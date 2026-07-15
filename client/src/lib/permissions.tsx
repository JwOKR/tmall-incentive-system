import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle } from 'lucide-react';

// 模块名称映射
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
