import type { KeyboardEvent, ReactNode, RefObject } from 'react';

// 订单页行/卡片组件共用的类型（配合 pages/Orders.tsx 的纯提取重构）。
// 这里只声明类型，不涉及任何运行时逻辑。

export type OrderCellType = 'text' | 'number' | 'date' | 'datetime';

export interface OrderStatusOption {
  value: string;
  label: string;
  color: string;
}

/** 单元格渲染器：编辑态与权限仍由 Orders 页面持有，按 props 下发给行/卡片组件 */
export interface OrderCellRenderers {
  renderEditableCell: (order: any, field: string, type?: OrderCellType) => ReactNode;
  renderReadOnlyCell: (value: any, type?: OrderCellType) => ReactNode;
  renderStatusSelect: (order: any, field: string, options: OrderStatusOption[]) => ReactNode;
  renderBaseCommissionCell: (order: any) => ReactNode;
}

/** 行内编辑态：订单链接列在行内直接读取 editingCell / editValue，故单独成组 */
export interface OrderRowEditing {
  isEditing: (orderId: string, field: string) => boolean;
  value: any;
  onChange: (value: any) => void;
  onSave: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
  inputRef: RefObject<HTMLInputElement>;
}

export interface OrderRowActions {
  onSelectOne: (orderId: string) => void;
  onOpenDrawer: (orderId: string) => void;
  onDelete: (orderId: string) => void;
  onCopy: (text: string) => void;
  onCellClick: (orderId: string, field: string, currentValue: any) => void;
}

export interface OrderStatusOptions {
  refundOptions: OrderStatusOption[];
  reviewOptions: OrderStatusOption[];
}
