import type React from 'react';
import { Trash2 } from 'lucide-react';

interface BatchFormModalProps {
  setShowBatchForm: React.Dispatch<React.SetStateAction<boolean>>;
  setBatchProductCodes: React.Dispatch<React.SetStateAction<string>>;
  batchFormModalRef: React.RefObject<HTMLDivElement>;
  batchProductCodes: string;
  handleBatchCreate: () => void;
  batchCreateMutation: { isPending: boolean };
}

export function BatchFormModal({
  setShowBatchForm,
  setBatchProductCodes,
  batchFormModalRef,
  batchProductCodes,
  handleBatchCreate,
  batchCreateMutation,
}: BatchFormModalProps) {
  return (
    <div
      className="modal-overlay"
      onClick={() => { setShowBatchForm(false); setBatchProductCodes(''); }}
      onKeyDown={(e) => e.key === 'Escape' && (setShowBatchForm(false), setBatchProductCodes(''))}
      tabIndex={-1}
      ref={batchFormModalRef}
    >
      <div
        className="modal-content modal-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">批量新增任务</h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">商品编号（支持换行、空格、逗号、顿号、分号分隔）</label>
            <textarea
              value={batchProductCodes}
              onChange={(e) => setBatchProductCodes(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm apple-input"
              rows={10}
              placeholder="SKU-001，SKU-002\nSKU-003; SKU-004"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            将根据商品编号创建任务，默认基础返佣5元，限接1人
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowBatchForm(false);
                setBatchProductCodes('');
              }}
              className="apple-btn rounded-xl border px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleBatchCreate}
              disabled={batchCreateMutation.isPending}
              className="apple-btn rounded-xl bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
            >
              {batchCreateMutation.isPending ? '创建中...' : '批量创建'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TaskBatchActionsProps {
  selectedIds: Set<string>;
  handleBatchDelete: () => void;
  batchDeleteMutation: { isPending: boolean };
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function TaskBatchActions({ selectedIds, handleBatchDelete, batchDeleteMutation, setSelectedIds }: TaskBatchActionsProps) {
  return (
    <div className="flex items-center gap-4 p-4 bg-indigo-50/80 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30 flex-wrap animate-fade-up">
      <span className="text-sm text-muted-foreground">
        已选择 <span className="font-bold text-indigo-600 dark:text-indigo-400">{selectedIds.size}</span> 项
      </span>
      <button
        onClick={handleBatchDelete}
        disabled={batchDeleteMutation.isPending}
        className="apple-btn inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 transition-colors shadow-sm"
      >
        <Trash2 className="h-4 w-4" />
        {batchDeleteMutation.isPending ? '删除中...' : '批量删除'}
      </button>
      <button
        onClick={() => setSelectedIds(new Set())}
        className="apple-btn text-sm text-muted-foreground hover:text-foreground"
      >
        取消选择
      </button>
    </div>
  );
}
