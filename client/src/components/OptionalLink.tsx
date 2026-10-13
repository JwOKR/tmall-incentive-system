import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface OptionalLinkProps {
  /** 跳转目标；为 undefined 时渲染为不可点击的 <div> */
  to?: string;
  className: string;
  title?: string;
  children: ReactNode;
}

/**
 * 可选跳转容器：有 to 时渲染为可点击的 <Link>，无 to 时渲染为**不可点击的 <div>**
 * （同一份 children，避免复制两份 inner JSX）。
 *
 * 用途：跳转目标可能无权限访问（目标路由受 RequirePermission / RequireAdmin 门控），
 * 需把入口按权限降级为不可点击，避免用户点进「权限不足」页：
 * - 账户入口卡片：`/settings` 已收紧为 admin-only（RequireAdmin），非管理员不给目标；
 * - 顶栏通知 Bell：按 anomalies / logs 权限决定去向，两者都无权限时不给目标；
 * - Dashboard 数据卡/图表入口：`/orders`、`/anomalies`、`/tasks`、`/takers` 等按对应模块权限决定是否可跳转。
 *
 * 注意：本组件只负责「可点 / 不可点」，不负责隐藏内容——承载数据的卡片无权时应保留展示、
 * 仅取消跳转（由调用方传入 to={undefined} 并去掉 hover/group 等「可点」暗示）。
 */
export default function OptionalLink({ to, className, title, children }: OptionalLinkProps) {
  if (to) {
    return (
      <Link to={to} className={className} title={title}>
        {children}
      </Link>
    );
  }
  return (
    <div className={className} title={title}>
      {children}
    </div>
  );
}
