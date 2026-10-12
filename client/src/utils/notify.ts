/**
 * notify.ts —— P2-9 浏览器通知提醒（零依赖）
 *
 * 约束与约定：
 *   - 无邮件服务、不引入任何新依赖 → 系统级提醒用浏览器 Notification API；
 *     不支持 / 权限被拒绝时由调用方回退为页面内提醒条。
 *   - 权限请求必须由用户主动触发（点击按钮才调用 requestNotificationPermission），
 *     禁止页面加载即弹权限框。
 *   - 本模块只做权限封装与通知发送，不做任何轮询/数据请求（轮询逻辑在 Dashboard 页内，
 *     频率克制 ≥5 分钟，且 document.hidden 时跳过）。
 */

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

/** 当前环境是否支持 Notification API（SSR / 老浏览器为 false） */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** 读取当前通知权限状态；不支持时返回 'unsupported' */
export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * 请求通知权限。**必须由用户主动触发**（按钮点击等），禁止在页面加载流程中调用。
 * 不支持 → 'unsupported'；请求异常 → 'denied'（保守降级）。
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    return (await Notification.requestPermission()) as NotificationPermissionState;
  } catch {
    return 'denied';
  }
}

/**
 * 发送一条系统通知。
 * 权限未授予（granted 之外）或发送失败时返回 false，调用方据此回退为页面内提醒条。
 * 使用固定 tag：同 tag 的新通知会覆盖旧通知，避免提醒堆积轰炸。
 */
export function showSystemNotification(title: string, body: string): boolean {
  if (getNotificationPermission() !== 'granted') return false;
  try {
    const notification = new Notification(title, {
      body,
      tag: 'tmall-dashboard-alert',
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}
