/**
 * 复制文本到剪贴板。
 * 优先使用 navigator.clipboard API（仅在 HTTPS / localhost 安全上下文可用）；
 * 若该 API 不存在或调用失败，则回退到 document.execCommand('copy') 方案，
 * 以兼容 HTTP 环境下的复制需求。
 * 返回 Promise<boolean>，true 表示复制成功，绝不抛出未捕获异常。
 *
 * 说明：本函数原为 Tasks.tsx 内的私有实现，因需要被单元测试直接 import
 * 而抽到 lib/（与 dateInput.ts / virtualList.ts 同类的纯工具模块），
 * 供 lib/__tests__/copyToClipboard.test.ts 以零依赖方式运行验证。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 优先尝试 Clipboard API（安全上下文：HTTPS 或 localhost）
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API 不可用或被拒绝，继续尝试回退方案
  }

  // 回退方案：execCommand('copy')，兼容 HTTP 环境
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}
