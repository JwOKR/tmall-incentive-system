// 订单列表页（pages/Orders.tsx）的常量与类型，原样提取自该页顶部，未做任何改写。

export const PAGE_SIZE_OPTIONS = [20, 50, 100];
export const PAGE_SIZE_STORAGE_KEY = 'tmall_orders_page_size';

// P1-11 列表虚拟滚动：仅当渲染行数超过阈值时启用窗口化，降低回归面。
// VIRTUAL_ROW_HEIGHT 为固定行高（虚拟模式下单元格会被裁成单行以保证高度可预测）。
export const VIRTUALIZE_THRESHOLD = 200;
export const VIRTUAL_ROW_HEIGHT = 56;
export const VIRTUAL_OVERSCAN = 6;

export interface EditingCell {
  orderId: string;
  field: string;
}
