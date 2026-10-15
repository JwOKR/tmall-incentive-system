/**
 * copyToClipboard 单元测试（自带断言，零依赖）。
 *
 * 本仓库前端未安装 vitest（没有 vitest/jsdom 依赖，也不允许新增依赖），
 * 故沿用 lib/__tests__/dateInput.test.ts、virtualList.test.ts 的「自带断言」
 * 独立脚本风格：直接 import 真实实现（非镜像拷贝），保持 tsc 零报错。
 *
 * 运行（Node 22.18+ 原生支持 TS 类型擦除，无需额外依赖）：
 *   node client/src/lib/__tests__/copyToClipboard.test.ts
 *
 * 覆盖 copyToClipboard 的可单元验证场景：
 *   1) Clipboard API 可用且成功 → 返回 true，不触碰 execCommand
 *   2) navigator.clipboard 缺失 → 回退 execCommand
 *   3) clipboard 存在但 writeText 非函数 → 跳过 API 走回退
 *   4) Clipboard API reject → 回退 execCommand
 *   5) API 与 execCommand 均失败 → 返回 false 且不抛异常
 *   6) 回退方案抛异常 → 被捕获并返回 false
 *   7) 始终返回 Promise<boolean>，不阻塞调用方同步流程
 */
import { copyToClipboard } from '../clipboard.ts';

let passed = 0;
let failed = 0;

/** 断言工具：与同目录其它零依赖测试风格一致，失败时打印期望/实际 */
function check(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(
      `  FAIL  ${name}\n        expected=${JSON.stringify(expected)}\n        actual  =${JSON.stringify(actual)}`
    );
  }
}

// ── 全局环境桩：Node 无 DOM，需临时注入 navigator / document ──
const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const docDesc = Object.getOwnPropertyDescriptor(globalThis, 'document');

function defineGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

function restoreGlobals(): void {
  if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc);
  else delete (globalThis as Record<string, unknown>).navigator;
  if (docDesc) Object.defineProperty(globalThis, 'document', docDesc);
  else delete (globalThis as Record<string, unknown>).document;
}

type ClipboardMode = 'resolve' | 'reject' | 'not-fn' | 'absent';
type ExecMode = 'true' | 'false' | 'throw' | 'absent';

interface Probe {
  writeTextCalls: number;
  execCalls: number;
}

/** 按场景安装 navigator / document 桩，返回调用计数器 */
function setup(clipboard: ClipboardMode, exec: ExecMode): Probe {
  const probe: Probe = { writeTextCalls: 0, execCalls: 0 };

  const nav: Record<string, unknown> = {};
  if (clipboard === 'resolve') {
    nav.clipboard = { writeText: async () => { probe.writeTextCalls++; } };
  } else if (clipboard === 'reject') {
    nav.clipboard = { writeText: async () => { probe.writeTextCalls++; throw new Error('denied'); } };
  } else if (clipboard === 'not-fn') {
    nav.clipboard = { writeText: 'not-a-function' };
  }
  // 'absent' → navigator 无 clipboard 属性（navigator.clipboard === undefined）
  defineGlobal('navigator', nav);

  const doc: Record<string, unknown> = {
    createElement: () => ({ value: '', style: {}, select() {} }),
    body: { appendChild() {}, removeChild() {} },
  };
  if (exec === 'true') doc.execCommand = () => { probe.execCalls++; return true; };
  else if (exec === 'false') doc.execCommand = () => { probe.execCalls++; return false; };
  else if (exec === 'throw') doc.execCommand = () => { probe.execCalls++; throw new Error('not supported'); };
  // 'absent' → document.execCommand === undefined
  defineGlobal('document', doc);

  return probe;
}

async function main(): Promise<void> {
  // 场景 1：HTTPS 环境，Clipboard API 可用 → 成功且不触碰 execCommand
  {
    const probe = setup('resolve', 'true');
    const result = await copyToClipboard('¥abc¥');
    check('Clipboard API 成功 → 返回 true', result, true);
    check('Clipboard API 成功 → writeText 被调用一次', probe.writeTextCalls, 1);
    check('Clipboard API 成功 → 不调用 execCommand', probe.execCalls, 0);
  }

  // 场景 2：navigator.clipboard 缺失（HTTP 环境）→ 回退 execCommand
  {
    const probe = setup('absent', 'true');
    const result = await copyToClipboard('¥abc¥');
    check('clipboard 缺失 → 回退返回 true', result, true);
    check('clipboard 缺失 → 调用 execCommand 一次', probe.execCalls, 1);
  }

  // 场景 3：clipboard 存在但 writeText 非函数 → 跳过 API 走回退
  {
    const probe = setup('not-fn', 'true');
    const result = await copyToClipboard('¥abc¥');
    check('writeText 非函数 → 回退返回 true', result, true);
    check('writeText 非函数 → 调用 execCommand 一次', probe.execCalls, 1);
  }

  // 场景 4：Clipboard API reject → 回退 execCommand
  {
    const probe = setup('reject', 'true');
    const result = await copyToClipboard('¥abc¥');
    check('Clipboard API reject → 回退返回 true', result, true);
    check('Clipboard API reject → writeText 被调用', probe.writeTextCalls, 1);
    check('Clipboard API reject → 调用 execCommand 一次', probe.execCalls, 1);
  }

  // 场景 5：API 与 execCommand 均失败 → 返回 false 且不抛异常
  {
    setup('reject', 'false');
    const result = await copyToClipboard('¥abc¥');
    check('两种方式均失败 → 返回 false', result, false);
  }

  // 场景 6：回退方案抛异常 → 被捕获并返回 false
  {
    setup('absent', 'throw');
    const result = await copyToClipboard('¥abc¥');
    check('execCommand 抛异常 → 捕获后返回 false', result, false);
  }

  // 场景 7：始终返回 Promise<boolean>
  {
    setup('resolve', 'true');
    const p = copyToClipboard('¥abc¥');
    check('返回值是 Promise', p instanceof Promise, true);
    const r = await p;
    check('Promise 解析值为 boolean', typeof r, 'boolean');
  }
}

await main();
restoreGlobals();

console.log(`\n========== copyToClipboard 结果：PASS=${passed}  FAIL=${failed} ==========`);
if (failed > 0) {
  throw new Error(`copyToClipboard 单元测试存在 ${failed} 个失败用例`);
}
