import type { ReactNode } from 'react';
import { CheckSquare, Square, Trash2, Zap } from 'lucide-react';
import { formatDate } from '@/lib/utils';

type EditableCellRenderer = (task: any, field: string, type?: 'text' | 'number' | 'integer') => ReactNode;
type TaskCellRenderer = (task: any) => ReactNode;

interface TaskRowProps {
  task: any;
  selectedIds: Set<string>;
  inlineOrderId: string | null;
  handleSelectOne: (taskId: string) => void;
  renderEditableCell: EditableCellRenderer;
  renderTaoTokenCell: TaskCellRenderer;
  renderStatusSelect: TaskCellRenderer;
  renderDeadlineCell: TaskCellRenderer;
  handleQuickOrder: (task: any) => void;
  handleDelete: (taskId: string) => void;
}

export default function TaskRow({
  task,
  selectedIds,
  inlineOrderId,
  handleSelectOne,
  renderEditableCell,
  renderTaoTokenCell,
  renderStatusSelect,
  renderDeadlineCell,
  handleQuickOrder,
  handleDelete,
}: TaskRowProps) {
  return (
    <tr className={`table-row-hover table-row-zebra ${selectedIds.has(task.id) ? 'table-row-selected' : ''} ${inlineOrderId === task.id ? 'bg-indigo-50/30 dark:bg-indigo-950/10' : ''}`}>
      <td className="px-4 py-2">
        <button
          onClick={() => handleSelectOne(task.id)}
          className="p-1 hover:bg-accent rounded"
        >
          {selectedIds.has(task.id) ? (
            <CheckSquare className="h-4 w-4 text-indigo-500" />
          ) : (
            <Square className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </td>
      <td className="px-4 py-2">
        {renderEditableCell(task, 'productId')}
      </td>
      <td className="px-4 py-2">
        {renderEditableCell(task, 'productCode')}
      </td>
      <td className="px-4 py-2">
        {renderTaoTokenCell(task)}
      </td>
      <td className="px-4 py-2 font-medium">
        {renderEditableCell(task, 'price', 'number')}
      </td>
      <td className="px-4 py-2">
        {renderEditableCell(task, 'baseCommission', 'number')}
      </td>
      <td className="px-4 py-2">
        {renderEditableCell(task, 'reviewReward', 'number')}
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          {renderEditableCell(task, 'maxOrders', 'integer')}
          <span className="text-xs text-muted-foreground">人</span>
        </div>
      </td>
      <td className="px-4 py-2 text-sm">
        <span className={task.currentOrders >= task.maxOrders ? 'text-rose-500 font-medium' : ''}>
          {task.currentOrders}人
        </span>
      </td>
      <td className="px-4 py-2">
        {renderStatusSelect(task)}
      </td>
      <td className="px-4 py-2 text-sm text-muted-foreground">
        {formatDate(task.publishDate)}
      </td>
      <td className="px-4 py-2 text-sm">
        {renderDeadlineCell(task)}
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => handleQuickOrder(task)}
            disabled={task.currentOrders >= task.maxOrders || (task.status !== 'active' && task.status !== 'pending')}
            className="apple-btn p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="快速接单"
          >
            <Zap className="h-4 w-4 text-emerald-500" />
          </button>
          <button
            onClick={() => handleDelete(task.id)}
            className="apple-btn p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-colors"
            title="删除任务"
          >
            <Trash2 className="h-4 w-4 text-rose-500" />
          </button>
        </div>
      </td>
    </tr>
  );
}
