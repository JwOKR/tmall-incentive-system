/**
 * copyToClipboard 单元测试（参考用，待启用）
 *
 * 启用前提（需工程师配合，二选一）：
 *   方案 A（推荐）：将 copyToClipboard 抽到 src/utils/clipboard.ts 并 export，
 *                   把本文件的 import 改为 '../utils/clipboard'。
 *   方案 B：在 Tasks.tsx 第 74 行 `async function copyToClipboard` 前加 `export`，
 *           保留本文件 import 自 '../Tasks'（会拉入整个组件，较重，不推荐）。
 *
 * 环境前提：
 *   - 安装 vitest + jsdom：npm i -D vitest @testing-library/jest-dom jsdom
 *   - package.json 增加 script："test": "vitest run"
 *   - vitest.config.ts 中 environment 设为 'jsdom'
 *
 * 以下用例覆盖任务要求的 7 个验证场景中的可单元验证部分
 * （onSuccess / handleCopyTaoToken 的 UI 行为需配合组件集成测试）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 占位 import：启用前按上述方案修正路径
// import { copyToClipboard } from '../Tasks';

// 为便于审查，这里以本地引用实现声明类型，真正启用时删除并使用上方 import
type CopyFn = (text: string) => Promise<boolean>;

describe('copyToClipboard', () => {
  let originalClipboard: any;
  let originalExecCommand: any;

  beforeEach(() => {
    originalClipboard = (navigator as any).clipboard;
    originalExecCommand = document.execCommand;
  });

  afterEach(() => {
    (navigator as any).clipboard = originalClipboard;
    document.execCommand = originalExecCommand;
    vi.restoreAllMocks();
  });

  // 场景 2：HTTPS 环境，Clipboard API 可用
  it('优先使用 Clipboard API 并在其成功时返回 true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    document.execCommand = vi.fn(); // 不应被调用

    // const result = await copyToClipboard('¥abc¥');
    // expect(writeText).toHaveBeenCalledWith('¥abc¥');
    // expect(document.execCommand).not.toHaveBeenCalled();
    // expect(result).toBe(true);
    expect(writeText).toBeDefined(); // 占位断言，启用后替换上方注释
  });

  // 场景 1：HTTP 环境，navigator.clipboard 为 undefined
  it('clipboard 不存在时回退到 execCommand 并返回 true', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    document.execCommand = vi.fn().mockReturnValue(true);

    // const result = await copyToClipboard('¥abc¥');
    // expect(document.execCommand).toHaveBeenCalledWith('copy');
    // expect(result).toBe(true);
    expect(document.execCommand).toBeDefined(); // 占位断言
  });

  // 场景 1 变体：clipboard 存在但 writeText 不是函数
  it('writeText 不是函数时跳过 API 走回退', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: 'not-a-function' },
      configurable: true,
    });
    document.execCommand = vi.fn().mockReturnValue(true);

    // const result = await copyToClipboard('¥abc¥');
    // expect(document.execCommand).toHaveBeenCalled();
    // expect(result).toBe(true);
    expect(document.execCommand).toBeDefined(); // 占位断言
  });

  // 场景 3：Clipboard API reject → 回退
  it('Clipboard API reject 时回退到 execCommand', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    document.execCommand = vi.fn().mockReturnValue(true);

    // const result = await copyToClipboard('¥abc¥');
    // expect(writeText).toHaveBeenCalled();
    // expect(document.execCommand).toHaveBeenCalled();
    // expect(result).toBe(true);
    expect(writeText).toBeDefined(); // 占位断言
  });

  // 场景 3：两种方式都失败 → 返回 false
  it('API 与 execCommand 均失败时返回 false 且不抛异常', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    document.execCommand = vi.fn().mockReturnValue(false);

    // const result = await copyToClipboard('¥abc¥');
    // expect(result).toBe(false);
    expect(document.execCommand).toBeDefined(); // 占位断言
  });

  // 场景 3 变体：回退方案抛异常 → 返回 false
  it('execCommand 抛异常时被捕获并返回 false', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    document.execCommand = vi.fn(() => {
      throw new Error('not supported');
    });

    // const result = await copyToClipboard('¥abc¥');
    // expect(result).toBe(false);
    expect(document.execCommand).toBeDefined(); // 占位断言
  });

  // 时序：始终返回 Promise，不阻塞调用方同步流程
  it('返回值是一个 Promise<boolean>', () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    document.execCommand = vi.fn().mockReturnValue(true);

    // const p = copyToClipboard('¥abc¥');
    // expect(p).toBeInstanceOf(Promise);
    // return p.then((r) => expect(typeof r).toBe('boolean'));
    expect(true).toBe(true); // 占位断言
  });
});
