import type { KeyboardEvent } from 'react';
import type { EditingCell } from '@/lib/orderListConfig';

// P1-5 键盘流：行间导航辅助。
// 原样提取自 pages/Orders.tsx（行内 handleKeyDown / commitAndMove / copyFromRowAbove），
// 未改写任何逻辑。本 hook 内部不调用 useState / useEffect / useMemo 等任何 React hook，
// 因此不会引入 hook 顺序问题。

interface UseOrdersKeyboardNavParams {
  editingCell: EditingCell | null;
  sortedOrders: any[];
  handleSave: () => void;
  handleCancel: () => void;
  buildEditValue: (field: string, currentValue: any) => string;
  setEditingCell: (cell: EditingCell | null) => void;
  setEditValue: (value: any) => void;
}

export function useOrdersKeyboardNav({
  editingCell,
  sortedOrders,
  handleSave,
  handleCancel,
  buildEditValue,
  setEditingCell,
  setEditValue,
}: UseOrdersKeyboardNavParams) {
  // 提交当前编辑并移动到同一列的上/下一行；提交走既有 handleSave（含校验与错误提示），不绕过。
  const commitAndMove = (direction: 1 | -1): boolean => {
    if (!editingCell) return false;
    const { orderId, field } = editingCell;
    const idx = sortedOrders.findIndex((o: any) => o.id === orderId);
    handleSave(); // 复用既有提交路径
    if (idx === -1) return false;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= sortedOrders.length) return false;
    const target = sortedOrders[targetIdx];
    setEditingCell({ orderId: target.id, field });
    setEditValue(buildEditValue(field, target[field]));
    return true;
  };

  // Ctrl/Cmd+D：把上一行同列的值填入当前编辑框（不自动提交，交由 Enter 确认）
  const copyFromRowAbove = () => {
    if (!editingCell) return;
    const { orderId, field } = editingCell;
    const idx = sortedOrders.findIndex((o: any) => o.id === orderId);
    if (idx <= 0) return;
    setEditValue(buildEditValue(field, sortedOrders[idx - 1][field]));
  };

  // P1-5 表格键盘流：Enter 提交并跳到下一行同列，↑↓ 上下移动同列，Ctrl/Cmd+D 复制上一行同列。
  // 仅作用于行内可编辑的文本/数字/日期单元格；状态下拉（isRefunded/isGoodReview）保持原生交互。
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitAndMove(1);
    } else if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      commitAndMove(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      commitAndMove(-1);
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      copyFromRowAbove();
    }
  };

  return { handleKeyDown };
}
