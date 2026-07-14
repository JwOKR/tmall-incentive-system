import { useAuth } from '@/contexts/AuthContext';

// 模块名称映射
export const moduleMap: Record<string, string> = {
  orders: '订单明细',
  takers: '接单人',
  tasks: '任务',
  intervals: '接单间隔',
  commissions: '佣金分析',
  logs: '操作日志',
  repeatDiscounts: '回头客立减',
};

// 检查用户是否有某个模块的查看权限
export function canView(module: string): boolean {
  const { user } = useAuth();
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!user.permissions) return false;
  return user.permissions[module]?.view === true;
}

// 检查用户是否有某个模块的编辑权限
export function canEdit(module: string): boolean {
  const { user } = useAuth();
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!user.permissions) return false;
  return user.permissions[module]?.edit === true;
}

// 检查用户是否是管理员
export function isAdmin(): boolean {
  const { user } = useAuth();
  return user?.role === 'admin';
}
