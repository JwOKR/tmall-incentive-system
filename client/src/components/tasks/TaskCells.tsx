import type React from 'react';
import { Copy, Save } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getDeadlineTone, toDateInputValue } from '@/lib/deadline';
import type { EditingCell } from '@/lib/taskPreview';
import HoverPreview from './HoverPreview';

export interface EditableCellDeps {
  isEditing: (taskId: string, field: string) => boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  editValue: any;
  setEditValue: React.Dispatch<React.SetStateAction<any>>;
  handleSave: (taskId: string) => void;
  handleKeyDown: (e: React.KeyboardEvent, taskId: string) => void;
  handleCellClick: (taskId: string, field: string, currentValue: any) => void;
}

export const renderTaskEditableCell = (
  task: any,
  field: string,
  type: 'text' | 'number' | 'integer' = 'text',
  deps: EditableCellDeps,
) => {
  const { isEditing, inputRef, editValue, setEditValue, handleSave, handleKeyDown, handleCellClick } = deps;
  const editing = isEditing(task.id, field);
  const value = task[field];
  
  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type={type === 'integer' ? 'number' : type}
          step={type === 'number' ? '0.01' : undefined}
          min={type === 'integer' ? '0' : undefined}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => handleSave(task.id)}
          onKeyDown={(e) => handleKeyDown(e, task.id)}
          className="w-full rounded border border-primary px-2 py-1 text-sm bg-background"
        />
        <button
          onClick={() => handleSave(task.id)}
          className="p-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded"
        >
          <Save className="h-3 w-3" />
        </button>
      </div>
    );
  }
  
  const displayValue = () => {
    if (type === 'number') return formatCurrency(value);
    if (type === 'integer') return value || '0';
    return value || '-';
  };
  
  return (
    <div
      onClick={() => handleCellClick(task.id, field, value)}
      className="cursor-pointer hover:bg-accent px-2 py-1 rounded min-h-[28px] flex items-center"
      title="点击编辑"
    >
      {displayValue()}
    </div>
  );
};

export interface StatusSelectDeps {
  isEditing: (taskId: string, field: string) => boolean;
  selectRef: React.RefObject<HTMLSelectElement>;
  editValue: any;
  handleSelectChange: (taskId: string, field: string, value: string) => void;
  handleCellClick: (taskId: string, field: string, currentValue: any) => void;
  setEditingCell: React.Dispatch<React.SetStateAction<EditingCell | null>>;
  handleCancel: () => void;
}

export const renderTaskStatusSelect = (task: any, deps: StatusSelectDeps) => {
  const { isEditing, selectRef, editValue, handleSelectChange, handleCellClick, setEditingCell, handleCancel } = deps;
  const editing = isEditing(task.id, 'status');
  const statusOptions = [
    { value: 'pending', label: '待接单', color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
    { value: 'active', label: '进行中', color: 'bg-blue-100 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400' },
    { value: 'refunded', label: '已返款', color: 'bg-amber-100 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400' },
    { value: 'completed', label: '已完成', color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400' },
    { value: 'cancelled', label: '已取消', color: 'bg-rose-100 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400' },
  ];
  const currentOption = statusOptions.find(opt => opt.value === task.status);
  
  if (editing) {
    return (
      <select
        ref={selectRef}
        value={editValue}
        onChange={(e) => handleSelectChange(task.id, 'status', e.target.value)}
        onBlur={() => setEditingCell(null)}
        onKeyDown={(e) => e.key === 'Escape' && handleCancel()}
        className="rounded border border-primary px-2 py-1 text-sm bg-background w-full"
      >
        {statusOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }
  
  return (
    <div
      onClick={() => handleCellClick(task.id, 'status', task.status)}
      className={`cursor-pointer hover:opacity-80 px-2 py-1 rounded text-xs font-medium inline-flex items-center ${currentOption?.color || ''}`}
      title="点击切换状态"
    >
      {currentOption?.label || '-'}
    </div>
  );
};

export interface DeadlineCellDeps {
  isEditing: (taskId: string, field: string) => boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  editValue: any;
  setEditValue: React.Dispatch<React.SetStateAction<any>>;
  handleSave: (taskId: string) => void;
  handleKeyDown: (e: React.KeyboardEvent, taskId: string) => void;
  setEditingCell: React.Dispatch<React.SetStateAction<EditingCell | null>>;
}

/** 截止日期单元格：临期（≤3 天）琥珀色 / 超期红色；点击进入行内编辑（date 输入） */
export const renderTaskDeadlineCell = (task: any, deps: DeadlineCellDeps) => {
  const { isEditing, inputRef, editValue, setEditValue, handleSave, handleKeyDown, setEditingCell } = deps;
  const editing = isEditing(task.id, 'deadline');
  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={() => handleSave(task.id)}
        onKeyDown={(e) => handleKeyDown(e, task.id)}
        className="w-full rounded border border-primary px-2 py-1 text-sm bg-background"
      />
    );
  }
  const tone = getDeadlineTone(task.deadline);
  const toneClass = tone === 'overdue'
    ? 'text-rose-600 dark:text-rose-400 font-medium'
    : tone === 'soon'
      ? 'text-amber-600 dark:text-amber-400 font-medium'
      : '';
  return (
    <div
      onClick={() => {
        setEditingCell({ taskId: task.id, field: 'deadline' });
        setEditValue(toDateInputValue(task.deadline));
      }}
      className={`cursor-pointer hover:bg-accent px-2 py-1 rounded min-h-[28px] flex items-center ${toneClass}`}
      title={tone === 'overdue' ? '已超期' : tone === 'soon' ? '临期（3 天内到期）' : '点击编辑'}
    >
      {task.deadline ? formatDate(task.deadline) : '-'}
    </div>
  );
};

export interface TaoTokenCellDeps extends EditableCellDeps {
  handleCopyTaoToken: (taoToken: string) => void;
}

export const renderTaskTaoTokenCell = (task: any, deps: TaoTokenCellDeps) => {
  const {
    isEditing,
    inputRef,
    editValue,
    setEditValue,
    handleSave,
    handleKeyDown,
    handleCellClick,
    handleCopyTaoToken,
  } = deps;
  return (
    <div className="flex items-center gap-1 max-w-[200px]">
      <HoverPreview content={task.taoToken || ''} className="flex-1 min-w-0 overflow-hidden">
        {isEditing(task.id, 'taoToken') ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => handleSave(task.id)}
              onKeyDown={(e) => handleKeyDown(e, task.id)}
              className="w-full rounded border border-primary px-2 py-1 text-sm bg-background"
            />
            <button
              onClick={() => handleSave(task.id)}
              className="p-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded shrink-0"
            >
              <Save className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div
            onClick={() => handleCellClick(task.id, 'taoToken', task.taoToken)}
            className="cursor-pointer hover:bg-accent px-2 py-1 rounded min-h-[28px] flex items-center overflow-hidden text-ellipsis whitespace-nowrap"
            title="点击编辑"
          >
            {task.taoToken || '-'}
          </div>
        )}
      </HoverPreview>
      {task.taoToken && (
        <button
          onClick={() => handleCopyTaoToken(task.taoToken)}
          className="p-1 hover:bg-accent rounded shrink-0"
          title="复制淘口令"
        >
          <Copy className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};
