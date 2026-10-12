import fs from 'fs/promises';
import path from 'path';
import prisma from './db';
import logger from './logger';
import { createAuditLog } from './auditLog';
import { buildBackupSnapshot } from '../services/backupService';
import {
  getAutoBackupEnabled,
  getBackupRetention,
  getLogRetentionDays,
  parseBackupRetention,
  parseLogRetentionDays,
} from '../services/systemSettingService';

/**
 * 进程内定时任务调度器（本项目第一个定时任务）
 *
 * 职责：
 *   1. 自动备份：定期把全库快照落盘到 BACKUP_DIR，并按「滚动保留 N 份」清理最旧的备份；
 *   2. 日志保留：删除超过「日志保留天数」的 Log 行（带多重保护，绝不清空全表）。
 *
 * 设计要点：
 * - **不引入任何新依赖**：仅用 Node 内置 setInterval / fs / path；
 * - **单一数据源**：备份快照复用 services/backupService.buildBackupSnapshot（与手动导出同一函数）；
 * - **只在服务启动时注册**（由 index.ts 调用 startScheduler）：绝不在 GET 请求里触发；
 * - **全程 try/catch**：单次任务失败只记录日志 + 审计，绝不向外冒泡、绝不 crash 进程；
 * - **全部可注入**：快照函数 / 时钟 / 文件系统 / prisma 均可注入，便于单元测试。
 */

// 单一数据源对外暴露：便于断言「手动导出与定时任务共用同一函数」
export { buildBackupSnapshot };

/** 备份文件名前缀 / 后缀（用于识别与清理） */
export const BACKUP_FILE_PREFIX = 'backup-';
export const BACKUP_FILE_SUFFIX = '.json';

/** 默认备份间隔：24 小时 */
export const DEFAULT_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** 允许的最小间隔：1 分钟（防止误配极小值导致狂写磁盘） */
export const MIN_BACKUP_INTERVAL_MS = 60 * 1000;
/** 启动后首次执行延迟：60 秒（避开启动高峰） */
export const INITIAL_DELAY_MS = 60 * 1000;
/** 单次日志清理最多删除条数（超过则整体跳过，防止一次异常删掉巨量） */
export const LOG_RETENTION_MAX_DELETE_PER_RUN = 20000;

/** 备份落盘目录：BACKUP_DIR 优先，否则相对当前工作目录的 ./backups（容器内通常即 /app/backups） */
export function resolveBackupDir(): string {
  return path.resolve(process.env.BACKUP_DIR || './backups');
}

/** 备份间隔（毫秒）：AUTO_BACKUP_INTERVAL_MS 优先，非法/过小回退 24h */
export function resolveBackupIntervalMs(): number {
  const raw = Number(process.env.AUTO_BACKUP_INTERVAL_MS);
  if (Number.isFinite(raw) && raw >= MIN_BACKUP_INTERVAL_MS) return Math.floor(raw);
  return DEFAULT_BACKUP_INTERVAL_MS;
}

/* ============================================================
 * 纯函数（不依赖 IO / Prisma，便于单元测试）
 * ============================================================ */

/**
 * 生成备份文件名（本地时间，形如 backup-YYYYMMDD-HHmmss.json）。
 * 字典序 == 时间序，便于用文件名排序做「保留最新 N 份」。
 */
export function buildBackupFilename(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `${BACKUP_FILE_PREFIX}${stamp}${BACKUP_FILE_SUFFIX}`;
}

/**
 * 从目录文件名列表里挑出应删除的备份（保留最新 keep 份，返回最旧的在前）。
 * 只识别 backup-*.json；按字典序（=时间序）排序。
 *
 * @param filenames 目录项名称
 * @param keep 要保留的最新份数（负数/非法按 0 处理）
 * @returns 应删除的文件名数组（最旧在前）
 */
export function selectBackupsToPrune(filenames: string[], keep: number): string[] {
  const valid = filenames.filter(
    (f) => f.startsWith(BACKUP_FILE_PREFIX) && f.endsWith(BACKUP_FILE_SUFFIX)
  );
  const sorted = [...valid].sort();
  const keepN = Number.isFinite(keep) ? Math.max(0, Math.floor(keep)) : 0;
  if (sorted.length <= keepN) return [];
  return sorted.slice(0, sorted.length - keepN);
}

/** 日志保留截止时间：now - days 天 */
export function computeLogCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** 日志清理安全判定结果 */
export interface LogRetentionDecision {
  allowed: boolean;
  /** 跳过原因：no-expired-logs / would-empty-table / exceeds-max-per-run / ok */
  reason: string;
}

/**
 * 日志清理安全校验（纯函数）——防止一次任务把日志表清空或巨量删除。
 *
 * 规则（任一不满足即拒绝）：
 *  - toDelete <= 0                          → 拒绝（无到期日志）
 *  - toDelete >= total                      → 拒绝（会导致整表清空，硬保护）
 *  - toDelete > maxPerRun                   → 拒绝（超过单次上限，需人工介入）
 *
 * @param total 日志总条数
 * @param toDelete 本次到期（将被删）条数
 * @param maxPerRun 单次允许删除上限
 */
export function decideLogRetention(total: number, toDelete: number, maxPerRun: number): LogRetentionDecision {
  if (toDelete <= 0) return { allowed: false, reason: 'no-expired-logs' };
  if (toDelete >= total) return { allowed: false, reason: 'would-empty-table' };
  if (toDelete > maxPerRun) return { allowed: false, reason: 'exceeds-max-per-run' };
  return { allowed: true, reason: 'ok' };
}

/* ============================================================
 * 可注入依赖
 * ============================================================ */
export interface BackupFsLike {
  mkdir(dir: string, opts: { recursive: boolean }): Promise<unknown>;
  writeFile(file: string, data: string): Promise<void>;
  readdir(dir: string): Promise<string[]>;
  unlink(file: string): Promise<void>;
}

export type AuditLike = (data: { action: string; detail: string }) => Promise<unknown>;

export interface LoggerLike {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface LogPrismaLite {
  log: {
    count(args?: { where?: unknown }): Promise<number>;
    deleteMany(args: { where: unknown }): Promise<{ count: number }>;
  };
}

const defaultFs: BackupFsLike = {
  mkdir: (dir, opts) => fs.mkdir(dir, opts),
  writeFile: (file, data) => fs.writeFile(file, data, 'utf8'),
  readdir: (dir) => fs.readdir(dir),
  unlink: (file) => fs.unlink(file),
};

const defaultAudit: AuditLike = (data) => createAuditLog(data);
const defaultLogger: LoggerLike = logger as unknown as LoggerLike;
const defaultLogPrisma: LogPrismaLite = prisma as unknown as LogPrismaLite;

/* ============================================================
 * 单次任务
 * ============================================================ */
export interface AutoBackupResult {
  ok: boolean;
  file?: string;
  bytes?: number;
  kept?: number;
  pruned?: string[];
  error?: string;
}

/**
 * 执行一次自动备份：快照 → 落盘 → 滚动清理。
 * **永不抛错**：任何失败都返回 { ok:false, error } 并写审计。
 */
export async function runAutoBackupOnce(opts: {
  backupDir?: string;
  retention?: number;
  snapshot?: () => Promise<unknown>;
  now?: () => Date;
  fsImpl?: BackupFsLike;
  audit?: AuditLike;
  log?: LoggerLike;
} = {}): Promise<AutoBackupResult> {
  const log = opts.log ?? defaultLogger;
  const fsImpl = opts.fsImpl ?? defaultFs;
  const audit = opts.audit ?? defaultAudit;
  const now = opts.now ?? (() => new Date());

  try {
    const dir = opts.backupDir ?? resolveBackupDir();
    const retention = parseBackupRetention(opts.retention ?? (await getBackupRetention()));
    const snapshotFn = opts.snapshot ?? buildBackupSnapshot;

    await fsImpl.mkdir(dir, { recursive: true });
    const snapshot = await snapshotFn();
    const json = JSON.stringify(snapshot);
    const file = path.join(dir, buildBackupFilename(now()));
    await fsImpl.writeFile(file, json);

    // 滚动保留：清理最旧的，保留最新 retention 份。清理失败不影响本次备份成功。
    let pruned: string[] = [];
    try {
      const entries = await fsImpl.readdir(dir);
      pruned = selectBackupsToPrune(entries, retention);
      for (const name of pruned) {
        await fsImpl.unlink(path.join(dir, name));
      }
    } catch (e) {
      log.warn('[scheduler] 清理旧备份失败（不影响本次备份）:', e);
      pruned = [];
    }

    const bytes = Buffer.byteLength(json, 'utf8');
    const base = path.basename(file);
    log.info(`[scheduler] 自动备份完成: ${base} (${bytes} 字节), 保留 ${retention} 份, 清理 ${pruned.length} 份`);
    await audit({
      action: 'auto_backup',
      detail: `自动备份完成: ${base} (${(bytes / 1024).toFixed(1)} KB), 保留 ${retention} 份, 清理 ${pruned.length} 份`,
    });
    return { ok: true, file, bytes, kept: retention, pruned };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error('[scheduler] 自动备份失败:', error);
    try {
      await audit({ action: 'auto_backup_failed', detail: `自动备份失败: ${msg}` });
    } catch {
      // 审计写入自身失败时忽略，避免影响主流程
    }
    return { ok: false, error: msg };
  }
}

export interface LogRetentionResult {
  ok: boolean;
  cutoff?: string;
  total?: number;
  expired?: number;
  deleted?: number;
  skipped?: string;
  error?: string;
}

/**
 * 执行一次日志保留：删除超过 days 天的 Log 行（带安全保护）。
 * **永不抛错**：任何失败返回 { ok:false, error } 并写审计。
 * days 会经 parseLogRetentionDays 夹取（下限保护），极端参数也不会误删近期日志。
 */
export async function runLogRetentionOnce(opts: {
  days?: number;
  maxPerRun?: number;
  now?: () => Date;
  prismaClient?: LogPrismaLite;
  audit?: AuditLike;
  log?: LoggerLike;
} = {}): Promise<LogRetentionResult> {
  const log = opts.log ?? defaultLogger;
  const audit = opts.audit ?? defaultAudit;
  const client = opts.prismaClient ?? defaultLogPrisma;
  const now = opts.now ?? (() => new Date());

  try {
    const days = parseLogRetentionDays(opts.days ?? (await getLogRetentionDays()));
    const maxPerRun = opts.maxPerRun ?? LOG_RETENTION_MAX_DELETE_PER_RUN;
    const cutoff = computeLogCutoff(now(), days);

    const [total, expired] = await Promise.all([
      client.log.count(),
      client.log.count({ where: { createdAt: { lt: cutoff } } }),
    ]);

    const decision = decideLogRetention(total, expired, maxPerRun);
    if (!decision.allowed) {
      log.info(
        `[scheduler] 日志保留跳过（${decision.reason}）: 总数 ${total}, 到期 ${expired}, 单次上限 ${maxPerRun}, 保留天数 ${days}`
      );
      return { ok: true, cutoff: cutoff.toISOString(), total, expired, deleted: 0, skipped: decision.reason };
    }

    const result = await client.log.deleteMany({ where: { createdAt: { lt: cutoff } } });
    log.info(`[scheduler] 日志保留完成: 删除 ${result.count} 条（保留 ${days} 天内），余 ${total - result.count} 条`);
    await audit({
      action: 'log_retention',
      detail: `日志保留: 删除 ${result.count} 条（保留 ${days} 天内），余 ${total - result.count} 条`,
    });
    return { ok: true, cutoff: cutoff.toISOString(), total, expired, deleted: result.count };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error('[scheduler] 日志保留失败:', error);
    try {
      await audit({ action: 'log_retention_failed', detail: `日志保留失败: ${msg}` });
    } catch {
      // 忽略审计写入失败
    }
    return { ok: false, error: msg };
  }
}

/* ============================================================
 * 调度注册（仅由服务启动时调用）
 * ============================================================ */
let timeoutIds: Array<ReturnType<typeof setTimeout>> = [];
let intervalIds: Array<ReturnType<typeof setInterval>> = [];
let started = false;

/** 包一层：保证定时回调里的任何异常都不冒泡（runners 自身已 catch，这里是兜底） */
function safeRun(name: string, fn: () => Promise<unknown>, log: LoggerLike): void {
  void fn().catch((e) => log.error(`[scheduler] ${name} 未捕获异常:`, e));
}

/**
 * 注册自动维护定时任务（幂等：重复调用不会重复注册）。
 * 仅在「自动维护总开关」为 true 时注册；否则记录一条 info 说明如何开启。
 * 开关判定：env AUTO_BACKUP_ENABLED 优先 > 系统设置 auto_backup_enabled > 默认 false。
 */
export function startScheduler(): void {
  if (started) return;
  started = true;

  void (async () => {
    try {
      const enabled = await getAutoBackupEnabled();
      if (!enabled) {
        logger.info(
          '[scheduler] 自动维护未启用（默认关闭）。如需开启：设置环境变量 AUTO_BACKUP_ENABLED=true，或在系统设置 auto_backup_enabled 置 true。'
        );
        // 允许后续再次调用重新判定
        started = false;
        return;
      }

      const interval = resolveBackupIntervalMs();
      const days = await getLogRetentionDays();

      const first = setTimeout(() => safeRun('auto-backup', runAutoBackupOnce, defaultLogger), INITIAL_DELAY_MS);
      const backupTimer = setInterval(() => safeRun('auto-backup', runAutoBackupOnce, defaultLogger), interval);
      const logTimer = setInterval(() => safeRun('log-retention', runLogRetentionOnce, defaultLogger), interval);

      timeoutIds = [first];
      intervalIds = [backupTimer, logTimer];

      logger.info(
        `[scheduler] 自动维护已启用：间隔 ${(interval / 3600000).toFixed(1)}h，备份目录 ${resolveBackupDir()}，日志保留 ${days} 天。`
      );
    } catch (e) {
      logger.error('[scheduler] 注册自动维护任务失败:', e);
      started = false;
    }
  })();
}

/** 停止所有定时任务（优雅退出 / 测试收尾） */
export function stopScheduler(): void {
  for (const t of timeoutIds) clearTimeout(t);
  for (const i of intervalIds) clearInterval(i);
  timeoutIds = [];
  intervalIds = [];
  started = false;
}
