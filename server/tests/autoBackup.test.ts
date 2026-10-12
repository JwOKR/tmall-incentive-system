/**
 * autoBackup.test.ts —— 定时自动备份 + 日志保留 回归测试（第 5 批 P1-10）
 *
 * 覆盖：
 *   A. 纯函数：文件名生成 / 滚动保留 selectBackupsToPrune（保留 N 份时第 N+1 份淘汰最旧）
 *   B. 纯函数：日志截止时间 / 安全判定 decideLogRetention（绝不清空全表 / 单次上限）
 *   C. 配置解析：parseBackupRetention / parseLogRetentionDays 极端输入下的夹取（下限保护）
 *   D. runAutoBackupOnce：正常落盘 + 滚动清理；失败（快照抛错 / 写文件抛错）**不向外冒泡**
 *   E. runLogRetentionOnce：正常删除；全表清空保护；超上限保护；极端 days 被夹取
 *   F. 单一数据源：buildBackupSnapshot 被 exportBackup 与定时任务**共用同一函数引用**
 *   G. 调度：startScheduler 幂等且不抛错、默认关闭；stopScheduler 收尾
 *
 * 手法：require.cache 预注入 fake prisma（`\` 与 `/` 双路径键）+ 内存版 fs + 可控假时钟，
 *       直接驱动导出的纯函数/可注入任务函数，不连数据库、不写真实磁盘。
 * 退出码：全部 PASS → 0；存在 FAIL → 1。
 */
import path from 'path';

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(
      `  FAIL  ${name}\n        expected=${JSON.stringify(expected)}\n        actual  =${JSON.stringify(actual)}`
    );
  }
}

/* ============================================================
 * fake prisma（只实现本测试用到的读方法；写方法仅计数）
 * ============================================================ */
const prismaState = { systemSettingFindUnique: 0 };

const fakePrisma: any = {
  user: { findMany: async () => [] },
  orderTaker: { findMany: async () => [] },
  task: { findMany: async () => [] },
  order: { findMany: async () => [] },
  log: { findMany: async () => [] },
  repeatDiscount: { findMany: async () => [] },
  systemSetting: {
    findUnique: async () => {
      prismaState.systemSettingFindUnique++;
      return null; // 无设置行 → 走默认值
    },
  },
};

function injectFake(modulePath: string, exportsObj: any): void {
  const resolved = require.resolve(modulePath);
  const entry = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsObj,
    children: [],
    paths: [],
  } as unknown as NodeModule;
  require.cache[resolved] = entry;
  // 同时注入正斜杠路径键（Windows 下 require 缓存键可能是反斜杠形式）
  require.cache[resolved.replace(/\\/g, '/')] = entry;
}

injectFake('../src/utils/db', { __esModule: true, default: fakePrisma });
injectFake('../src/utils/logger', {
  __esModule: true,
  default: { info() {}, warn() {}, error() {}, debug() {} },
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const scheduler = require('../src/utils/scheduler');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const settings = require('../src/services/systemSettingService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const backupService = require('../src/services/backupService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const backupController = require('../src/controllers/backupController');

/* ============================================================
 * 内存版 fs + 假时钟 + 审计记录器
 * ============================================================ */
function makeMemFs(initial: string[] = []) {
  const files = new Set<string>(initial);
  const state = { lastWritten: '', mkdirs: 0 };
  const impl = {
    mkdir: async (_dir: string, _opts: { recursive: boolean }) => {
      state.mkdirs++;
      return undefined;
    },
    writeFile: async (file: string, data: string) => {
      files.add(path.basename(file));
      state.lastWritten = data;
    },
    readdir: async (_dir: string) => Array.from(files),
    unlink: async (file: string) => {
      files.delete(path.basename(file));
    },
  };
  return { impl, files, state };
}

function makeAuditRecorder() {
  const calls: { action: string; detail: string }[] = [];
  const audit = async (data: { action: string; detail: string }) => {
    calls.push(data);
    return undefined;
  };
  return { audit, calls };
}

function makeLogClient(total: number, expired: number) {
  const state = { total, expired, deleteManyCalls: 0 };
  const client = {
    log: {
      count: async (args?: { where?: unknown }) => (args && args.where ? state.expired : state.total),
      deleteMany: async (_args: { where: unknown }) => {
        state.deleteManyCalls++;
        return { count: state.expired };
      },
    },
  };
  return { client, state };
}

const FAST = { info() {}, warn() {}, error() {} }; // 静音 logger 注入

/* ============================================================
 * 用例
 * ============================================================ */
(async () => {
  /* ---------- A. 文件名 + 滚动保留 ---------- */
  console.log('\n=== A. 文件名与滚动保留 selectBackupsToPrune ===');
  const f1 = scheduler.buildBackupFilename(new Date('2026-01-01T00:00:00'));
  const f2 = scheduler.buildBackupFilename(new Date('2026-01-01T00:00:01'));
  check('[A] 文件名前缀正确', f1.startsWith('backup-'), true);
  check('[A] 文件名后缀正确', f1.endsWith('.json'), true);
  check('[A] 文件名字典序随时间递增', f1 < f2, true);

  const mk = (n: number) => `backup-2026010${n}-000000.json`;
  // 保留 7 份、现有 8 份 → 淘汰 1 份（最旧）
  check('[A] 8 份保留 7 → 淘汰 1 份', scheduler.selectBackupsToPrune([1, 2, 3, 4, 5, 6, 7, 8].map(mk), 7), [mk(1)]);
  // 恰好 7 份 → 不淘汰
  check('[A] 恰好 7 份保留 7 → 不淘汰', scheduler.selectBackupsToPrune([1, 2, 3, 4, 5, 6, 7].map(mk), 7), []);
  // 5 份保留 3 → 淘汰最旧 2 份
  check('[A] 5 份保留 3 → 淘汰最旧 2 份', scheduler.selectBackupsToPrune([1, 2, 3, 4, 5].map(mk), 3), [mk(1), mk(2)]);
  // 只识别 backup-*.json
  check(
    '[A] 忽略非备份文件',
    scheduler.selectBackupsToPrune(['readme.txt', 'backup-bad.txt', mk(1), 'other.json'], 0),
    [mk(1)]
  );
  // 保留 0 → 全删
  check('[A] 保留 0 → 全部淘汰', scheduler.selectBackupsToPrune([mk(1), mk(2)], 0).length, 2);
  // 负数保留 → 按 0
  check('[A] 负数保留按 0 处理', scheduler.selectBackupsToPrune([mk(1)], -3).length, 1);

  /* ---------- B. 日志截止 + 安全判定 ---------- */
  console.log('\n=== B. 日志截止时间与安全判定 ===');
  const base = new Date('2026-06-01T00:00:00.000Z');
  check(
    '[B] computeLogCutoff(180d)',
    scheduler.computeLogCutoff(base, 180).toISOString(),
    new Date(base.getTime() - 180 * 24 * 3600 * 1000).toISOString()
  );
  check('[B] 正常：5000/10000 且 < 上限 → allowed', scheduler.decideLogRetention(10000, 5000, 20000), { allowed: true, reason: 'ok' });
  check('[B] 无到期 → no-expired-logs', scheduler.decideLogRetention(100, 0, 20000), { allowed: false, reason: 'no-expired-logs' });
  check('[B] 会清空全表 → 拒绝', scheduler.decideLogRetention(100, 100, 20000), { allowed: false, reason: 'would-empty-table' });
  check('[B] 超过单次上限 → 拒绝', scheduler.decideLogRetention(100000, 50000, 20000), { allowed: false, reason: 'exceeds-max-per-run' });

  /* ---------- C. 配置解析夹取 ---------- */
  console.log('\n=== C. 配置解析（极端输入夹取）===');
  check('[C] parseBackupRetention(null) = 默认 7', settings.parseBackupRetention(null), 7);
  check('[C] parseBackupRetention("0") 夹到下限 1', settings.parseBackupRetention('0'), 1);
  check('[C] parseBackupRetention("999") 夹到上限 30', settings.parseBackupRetention('999'), 30);
  check('[C] parseBackupRetention("abc") = 默认 7', settings.parseBackupRetention('abc'), 7);
  check('[C] parseLogRetentionDays(null) = 默认 180', settings.parseLogRetentionDays(null), 180);
  check('[C] parseLogRetentionDays("0") 夹到下限 7（下限保护）', settings.parseLogRetentionDays('0'), 7);
  check('[C] parseLogRetentionDays("-100") 夹到下限 7', settings.parseLogRetentionDays('-100'), 7);
  check('[C] parseLogRetentionDays("99999") 夹到上限 3650', settings.parseLogRetentionDays('99999'), 3650);
  check('[C] parseLogRetentionDays("abc") = 默认 180', settings.parseLogRetentionDays('abc'), 180);

  /* ---------- D. runAutoBackupOnce ---------- */
  console.log('\n=== D. runAutoBackupOnce 备份 + 滚动清理 + 失败不冒泡 ===');
  const clock = new Date('2026-06-01T12:00:00');
  const now = () => clock;

  // D1：正常（预置 3 份 + 本次 1 份 = 4 份，保留 3 → 淘汰最旧 1 份）
  {
    const mem = makeMemFs(['backup-20260101-000000.json', 'backup-20260102-000000.json', 'backup-20260103-000000.json']);
    const rec = makeAuditRecorder();
    const res = await scheduler.runAutoBackupOnce({
      backupDir: '/tmp/x',
      retention: 3,
      snapshot: async () => ({ version: '1.1', data: {} }),
      fsImpl: mem.impl,
      audit: rec.audit,
      log: FAST,
      now,
    });
    check('[D1] ok = true', res.ok, true);
    check('[D1] 落盘字节数 > 0', (res.bytes ?? 0) > 0, true);
    check('[D1] 淘汰最旧 1 份', res.pruned, ['backup-20260101-000000.json']);
    check('[D1] 目录内最终保留 3 份（滚动保留生效）', mem.files.size, 3);
    check('[D1] 新备份文件名正确', path.basename(res.file || ''), 'backup-20260601-120000.json');
    check('[D1] 写了审计 auto_backup', rec.calls.some((c) => c.action === 'auto_backup'), true);
  }

  // D2：快照抛错 → 不冒泡、ok=false、写失败审计
  {
    const mem = makeMemFs();
    const rec = makeAuditRecorder();
    let threw = false;
    let res: any;
    try {
      res = await scheduler.runAutoBackupOnce({
        backupDir: '/tmp/x',
        retention: 3,
        snapshot: async () => {
          throw new Error('snapshot-boom');
        },
        fsImpl: mem.impl,
        audit: rec.audit,
        log: FAST,
        now,
      });
    } catch {
      threw = true;
    }
    check('[D2] 内部抛错不向外冒泡', threw, false);
    check('[D2] ok = false', res?.ok, false);
    check('[D2] 带 error 信息', res?.error, 'snapshot-boom');
    check('[D2] 写了审计 auto_backup_failed', rec.calls.some((c) => c.action === 'auto_backup_failed'), true);
    check('[D2] 失败时不写文件', mem.files.size, 0);
  }

  // D3：写文件抛错 → 同样不冒泡
  {
    const mem = makeMemFs();
    const failingFs = { ...mem.impl, writeFile: async () => { throw new Error('disk-full'); } };
    let threw = false;
    let res: any;
    try {
      res = await scheduler.runAutoBackupOnce({
        backupDir: '/tmp/x',
        retention: 3,
        snapshot: async () => ({ a: 1 }),
        fsImpl: failingFs,
        audit: makeAuditRecorder().audit,
        log: FAST,
        now,
      });
    } catch {
      threw = true;
    }
    check('[D3] 写文件失败不冒泡', threw, false);
    check('[D3] ok = false 且带 error', [res?.ok, res?.error], [false, 'disk-full']);
  }

  /* ---------- E. runLogRetentionOnce ---------- */
  console.log('\n=== E. runLogRetentionOnce 保留 + 保护 ===');
  // E1：正常删除
  {
    const { client, state } = makeLogClient(1000, 10);
    const rec = makeAuditRecorder();
    const res = await scheduler.runLogRetentionOnce({ days: 180, prismaClient: client, audit: rec.audit, log: FAST, now });
    check('[E1] ok = true', res.ok, true);
    check('[E1] 删除 10 条', res.deleted, 10);
    check('[E1] deleteMany 调用 1 次', state.deleteManyCalls, 1);
    check('[E1] 写了审计 log_retention', rec.calls.some((c) => c.action === 'log_retention'), true);
  }
  // E2：会清空全表 → 拒绝，且不调用 deleteMany
  {
    const { client, state } = makeLogClient(5, 5);
    const res = await scheduler.runLogRetentionOnce({ days: 180, prismaClient: client, log: FAST, now });
    check('[E2] 全表到期 → 不清空，deleted = 0', res.deleted, 0);
    check('[E2] 跳过原因 = would-empty-table', res.skipped, 'would-empty-table');
    check('[E2] deleteMany 未被调用', state.deleteManyCalls, 0);
  }
  // E3：超单次上限 → 拒绝
  {
    const { client, state } = makeLogClient(100000, 50000);
    const res = await scheduler.runLogRetentionOnce({ days: 180, maxPerRun: 20000, prismaClient: client, log: FAST, now });
    check('[E3] 超上限 → deleted = 0', res.deleted, 0);
    check('[E3] 跳过原因 = exceeds-max-per-run', res.skipped, 'exceeds-max-per-run');
    check('[E3] deleteMany 未被调用', state.deleteManyCalls, 0);
  }
  // E4：无到期
  {
    const { client } = makeLogClient(100, 0);
    const res = await scheduler.runLogRetentionOnce({ days: 180, prismaClient: client, log: FAST, now });
    check('[E4] 无到期 → 跳过 no-expired-logs', res.skipped, 'no-expired-logs');
  }
  // E5：极端 days 参数被夹到下限 7（下限保护）
  {
    const { client } = makeLogClient(1000, 10);
    const res = await scheduler.runLogRetentionOnce({ days: 0, prismaClient: client, log: FAST, now });
    check('[E5] days=0 被夹到 7 天（下限保护）', res.cutoff, new Date(clock.getTime() - 7 * 24 * 3600 * 1000).toISOString());
  }
  {
    const { client } = makeLogClient(1000, 10);
    const res = await scheduler.runLogRetentionOnce({ days: -999, prismaClient: client, log: FAST, now });
    check('[E5] days=-999 同样夹到 7 天', res.cutoff, new Date(clock.getTime() - 7 * 24 * 3600 * 1000).toISOString());
  }

  /* ---------- F. 单一数据源 ---------- */
  console.log('\n=== F. buildBackupSnapshot 单一数据源（两处共用同一函数）===');
  check(
    '[F] exportBackup 与 scheduler 共用同一 buildBackupSnapshot',
    backupController.buildBackupSnapshot === scheduler.buildBackupSnapshot,
    true
  );
  check(
    '[F] 二者均等于 backupService.buildBackupSnapshot',
    [
      backupController.buildBackupSnapshot === backupService.buildBackupSnapshot,
      scheduler.buildBackupSnapshot === backupService.buildBackupSnapshot,
    ],
    [true, true]
  );
  {
    const snap = await backupService.buildBackupSnapshot();
    check('[F] 快照版本 = 1.1', snap.version, '1.1');
    check('[F] 快照含 summary 汇总', typeof snap.summary?.takers, 'number');
  }

  /* ---------- G. 调度开关 ---------- */
  console.log('\n=== G. startScheduler 幂等 + 默认关闭 ===');
  delete process.env.AUTO_BACKUP_ENABLED;
  let startThrew = false;
  try {
    scheduler.startScheduler();
    scheduler.startScheduler(); // 幂等：第二次调用不应抛错
  } catch {
    startThrew = true;
  }
  check('[G] startScheduler 不抛错且可重复调用', startThrew, false);
  await new Promise((r) => setTimeout(r, 60)); // 等待异步开关判定落定
  let stopThrew = false;
  try {
    scheduler.stopScheduler();
  } catch {
    stopThrew = true;
  }
  check('[G] stopScheduler 不抛错', stopThrew, false);

  console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error('测试运行异常：', e);
  process.exit(2);
});
