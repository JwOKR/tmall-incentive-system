import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '@/lib/permissions';

/** Alt+数字 快捷键的目标路由及其守卫要求（严格对齐 App.tsx 中的路由门控） */
interface ShortcutRoute {
  /** 数字键（e.key） */
  key: string;
  /** 目标路径 */
  path: string;
  /** 需要的「查看」权限模块；缺省表示无需模块权限 */
  module?: string;
  /** 仅管理员可用（对应 App.tsx 的 RequireAdmin 守卫） */
  adminOnly?: boolean;
}

// 与 App.tsx 路由守卫一一对应：
//   1 → /           仅 ProtectedLayout（登录即可，无模块守卫）
//   2 → /takers     RequirePermission module="takers"
//   3 → /tasks      RequirePermission module="tasks"
//   4 → /orders     RequirePermission module="orders"
//   5 → /intervals  RequirePermission module="intervals"
//   6 → /commissions RequirePermission module="commissions"
//   7 → /logs       RequirePermission module="logs"
//   8 → /export     RequirePermission module="export"
//   9 → /settings   RequireAdmin（admin-only）
const SHORTCUT_ROUTES: ShortcutRoute[] = [
  { key: '1', path: '/' },
  { key: '2', path: '/takers', module: 'takers' },
  { key: '3', path: '/tasks', module: 'tasks' },
  { key: '4', path: '/orders', module: 'orders' },
  { key: '5', path: '/intervals', module: 'intervals' },
  { key: '6', path: '/commissions', module: 'commissions' },
  { key: '7', path: '/logs', module: 'logs' },
  { key: '8', path: '/export', module: 'export' },
  { key: '9', path: '/settings', adminOnly: true },
];

// 全局键盘快捷键
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const { canView, isAdmin, user } = usePermissions();

  // 派生「当前用户有权访问的快捷键路由表」。
  //
  // 依赖陷阱：usePermissions() 每次渲染都会返回新的 canView/isAdmin 函数实例，
  // 若把它们直接放进 useEffect 依赖数组，effect 会每次渲染都重挂监听。
  // 这里用 useMemo 以 `user`（仅在登录态/权限变化时变化）为派生 key：
  // 既保持监听只在权限真正变化时重挂，又保证权限变化后过滤结果正确生效
  // （不使用 ref 缓存 user —— 那会导致权限变化不重算）。
  const allowedRoutes = useMemo(
    () =>
      SHORTCUT_ROUTES.filter((route) => {
        if (route.adminOnly) return isAdmin();
        if (route.module) return canView(route.module);
        return true;
      }),
    // canView / isAdmin 均闭包自上方同一次 usePermissions() 的 user，故 user 是其唯一外部依赖
    [user]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName;
      const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target.isContentEditable;

      // Esc 关闭弹框（不拦截其他 Esc 行为）
      if (e.key === 'Escape') {
        // 让各组件自己处理 Esc
        return;
      }

      // 以下快捷键在输入框内不生效
      if (isInput) return;

      // / 聚焦搜索框
      if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="搜索"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // Ctrl/Cmd + K 聚焦搜索框
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="搜索"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // 导航快捷键（Alt + 数字）：仅对当前用户有权访问的目标生效
      if (e.altKey) {
        const route = allowedRoutes.find((r) => r.key === e.key);
        if (route) {
          e.preventDefault();
          navigate(route.path);
        }
        // 无权时：既不跳转也不 preventDefault —— 让按键流回浏览器/其他组件，不吞掉
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [navigate, allowedRoutes]);
}
