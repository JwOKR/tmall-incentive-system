import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle } from 'lucide-react';

// 模块名称映射。
// 唯一消费点：下方 NoPermission 的 `moduleMap[module] || module` 文案回退。
// NoPermission 只由 RequirePermission 触发，而 RequirePermission 从未以
// module="settings" 被调用（/settings 已改由 RequireAdmin 硬门控），
// 前后端亦零处引用 'settings' 权限键 —— 故此处不列出 settings，避免死条目。
export const moduleMap: Record<string, string> = {
  orders: '订单明细',
  takers: '接单人',
  tasks: '任务',
  intervals: '接单间隔',
  commissions: '佣金分析',
  logs: '操作日志',
  repeatDiscounts: '回头客立减',
  anomalies: '异常预警',
  export: '数据导出',
  dashboard: '数据汇总',
};

// ─── Hooks（必须在组件顶层调用） ─────────────────────────

// 返回用户的权限检查函数
export function usePermissions() {
  const { user } = useAuth();

  const canView = (module: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (!user.permissions) return false;
    return user.permissions[module]?.view === true;
  };

  const canEdit = (module: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (!user.permissions) return false;
    return user.permissions[module]?.edit === true;
  };

  const isAdmin = (): boolean => {
    return user?.role === 'admin';
  };

  return { canView, canEdit, isAdmin, user };
}

// ─── 权限不足提示组件 ────────────────────────────────────

export function NoPermission({ module }: { module: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-destructive/10 p-4 mb-4">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold mb-2">权限不足</h3>
      <p className="text-muted-foreground">
        您没有访问「{moduleMap[module] || module}」模块的权限
      </p>
      <p className="text-sm text-muted-foreground mt-1">
        请联系管理员开通权限
      </p>
    </div>
  );
}

// ─── 路由层权限守卫 ─────────────────────────────────────
// 说明：把模块鉴权上提到路由层。组件内只有 usePermissions 一个 hook，
// 且它在条件返回之前调用，hook 数量恒为 1 —— 无论权限状态如何在两次渲染间
// 翻转（例如登录后 user 从 null 变为有权限），hook 调用序列都保持一致，
// 不会出现「Rendered more/less hooks than during the previous render」。
// 无权限时直接渲染 NoPermission，业务页面组件根本不挂载，自然不会发起任何 API 请求。
export function RequirePermission({ module, children }: { module: string; children: ReactNode }) {
  const { canView } = usePermissions();
  if (!canView(module)) return <NoPermission module={module} />;
  return <>{children}</>;
}

// 管理员专属守卫（admin-only 硬拒，与后端 requireAdmin 对齐）。
// 注意：settings 模块权限在前后端都不再作为「系统设置」的放行条件 —— 普通用户即使被勾选了
// settings，也进不去该页。判定只在路由层用本组件包裹，页面组件内不得写 if (!isAdmin()) return，
// 否则会重新引入 React Hook 顺序违规。组件内只有 usePermissions 一个 hook，数量恒为 1。
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = usePermissions();
  if (!isAdmin()) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-destructive/10 p-4 mb-4">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <h3 className="text-lg font-semibold mb-2">权限不足</h3>
        <p className="text-muted-foreground">
          「系统设置」仅管理员可访问
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          请联系管理员开通权限
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
