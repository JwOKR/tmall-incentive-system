import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi, takersApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Plus, Search, Zap, Copy, Save, Trash2, CheckSquare, Square } from 'lucide-react';
import ExportDialog from '@/components/ExportDialog';
import ImportDialog from '@/components/ImportDialog';
import ColumnFilter, { filterData } from '@/components/ColumnFilter';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { taskColumns } from '@/lib/export';
import { usePermissions, NoPermission } from '@/lib/permissions';

interface EditingCell {
  taskId: string;
  field: string;
}

export default function Tasks() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const { canView, canEdit } = usePermissions();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [showQuickOrder, setShowQuickOrder] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [selectedTaker, setSelectedTaker] = useState('');
  const [takerSearch, setTakerSearch] = useState('');
  const [showTakerDropdown, setShowTakerDropdown] = useState(false);
  const [quickOrderForm, setQuickOrderForm] = useState({ orderNo: '', orderNo19: '', actualPayment: '' });
  const takerDropdownRef = useRef<HTMLDivElement>(null);
  const quickOrderModalRef = useRef<HTMLDivElement>(null);
  const batchFormModalRef = useRef<HTMLDivElement>(null);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchProductCodes, setBatchProductCodes] = useState('');
  const [addingNewRow, setAddingNewRow] = useState(false);
  const [newRowData, setNewRowData] = useState({
    productId: '',
    productCode: '',
    taoToken: '',
    price: '',
    baseCommission: '5',
    reviewReward: '0',
    maxOrders: '1',
  });
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<any>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', page, debouncedSearch, statusFilter],
    queryFn: () => tasksApi.getAll({ page, pageSize: 20, search: debouncedSearch, status: statusFilter }),
  });

  const { data: takersData } = useQuery({
    queryKey: ['takers-list'],
    queryFn: () => takersApi.getAll({ pageSize: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: tasksApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setAddingNewRow(false);
      resetNewRow();
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message || '创建任务失败');
    },
  });

  const batchCreateMutation = useMutation({
    mutationFn: (tasks: any[]) => tasksApi.batchCreate(tasks),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setShowBatchForm(false);
      setBatchProductCodes('');
      toastSuccess(data?.message || '批量创建成功');
    },
    onError: () => {
      toastError('批量创建失败');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => tasksApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message || '更新任务失败');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: tasksApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toastSuccess('删除成功');
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message || '删除任务失败');
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map(id => tasksApi.delete(id)));
      const success = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      return { success, failed };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setSelectedIds(new Set());
      toastSuccess(`批量删除完成: 成功${result.success}条${result.failed > 0 ? `，失败${result.failed}条` : ''}`);
    },
    onError: () => {
      toastError('批量删除失败');
    },
  });

  const quickOrderMutation = useMutation({
    mutationFn: tasksApi.quickOrder,
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setShowQuickOrder(false);
      setSelectedTask(null);
      setSelectedTaker('');
      setTakerSearch('');
      setShowTakerDropdown(false);
      setQuickOrderForm({ orderNo: '', orderNo19: '', actualPayment: '' });
      toastSuccess(data?.message || '接单成功');
    },
    onError: async (error: any) => {
      const errorData = error?.response?.data;
      const message = errorData?.message || '接单失败';
      const code = errorData?.code;
      
      // 如果是7天间隔限制，显示二次确认
      if (code === 'INTERVAL_LIMIT') {
        const confirmed = await confirm({ message: `${message}\n\n是否强制接单？`, variant: 'warning', confirmText: '强制接单' });
        if (confirmed) {
          handleConfirmQuickOrder(true);
          return;
        }
      } else {
        toastError(message);
      }
    },
  });

  useEffect(() => {
    if (editingCell) {
      if (inputRef.current) inputRef.current.focus();
      if (selectRef.current) selectRef.current.focus();
    }
  }, [editingCell]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (takerDropdownRef.current && !takerDropdownRef.current.contains(e.target as Node)) {
        setShowTakerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (showQuickOrder && quickOrderModalRef.current) {
      quickOrderModalRef.current.focus();
    }
  }, [showQuickOrder]);

  useEffect(() => {
    if (showBatchForm && batchFormModalRef.current) {
      batchFormModalRef.current.focus();
    }
  }, [showBatchForm]);

  const handleCellClick = (taskId: string, field: string, currentValue: any) => {
    if (editingCell?.taskId === taskId && editingCell?.field === field) return;
    setEditingCell({ taskId, field });
    setEditValue(String(currentValue || ''));
  };

  const handleSave = (taskId: string) => {
    if (!editingCell) return;
    const { field } = editingCell;
    let value = editValue;
    
    if (['price', 'baseCommission', 'reviewReward'].includes(field)) {
      value = Number(value) || 0;
    } else if (field === 'maxOrders') {
      value = Math.max(0, Math.floor(Number(value) || 0));
    }
    
    updateMutation.mutate({ id: taskId, data: { [field]: value } });
    setEditingCell(null);
    setEditValue('');
  };

  const handleCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, taskId: string) => {
    if (e.key === 'Enter') {
      handleSave(taskId);
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleSelectChange = (taskId: string, field: string, value: string) => {
    updateMutation.mutate({ id: taskId, data: { [field]: value } });
    setEditingCell(null);
  };

  const isEditing = (taskId: string, field: string) => {
    return editingCell?.taskId === taskId && editingCell?.field === field;
  };

  const renderEditableCell = (task: any, field: string, type: 'text' | 'number' | 'integer' = 'text') => {
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

  const renderStatusSelect = (task: any) => {
    const editing = isEditing(task.id, 'status');
    const statusOptions = [
      { value: 'active', label: '进行中', color: 'badge-success' },
      { value: 'completed', label: '已完成', color: 'badge-info' },
      { value: 'cancelled', label: '已取消', color: 'badge-danger' },
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

  const resetNewRow = () => {
    setNewRowData({
      productId: '',
      productCode: '',
      taoToken: '',
      price: '',
      baseCommission: '5',
      reviewReward: '0',
      maxOrders: '1',
    });
  };

  const handleAddNewRow = () => {
    setAddingNewRow(true);
    resetNewRow();
  };

  const handleSaveNewRow = () => {
    createMutation.mutate(newRowData);
  };

  const handleCancelNewRow = () => {
    setAddingNewRow(false);
    resetNewRow();
  };

  const handleDelete = async (taskId: string) => {
    if (await confirm({ message: '确定要删除这个任务吗？删除后关联的订单也会被删除。', variant: 'danger', confirmText: '删除' })) {
      deleteMutation.mutate(taskId);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredTasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTasks.map((t: any) => t.id)));
    }
  };

  const handleSelectOne = (taskId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedIds(newSelected);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) {
      toastError('请先选择要删除的任务');
      return;
    }
    if (await confirm({ message: `确定要删除选中的 ${selectedIds.size} 个任务吗？删除后关联的订单也会被删除。此操作不可恢复！`, variant: 'danger', confirmText: '删除' })) {
      batchDeleteMutation.mutate(Array.from(selectedIds));
    }
  };

  const handleBatchCreate = () => {
    const codes = batchProductCodes.split('\n').filter(code => code.trim());
    if (codes.length === 0) {
      toastError('请输入商品编号');
      return;
    }
    
    const tasks = codes.map(code => ({
      productId: code.trim(),
      productCode: code.trim(),
      taoToken: '',
      price: 0,
      baseCommission: 5,
      reviewReward: 0,
      maxOrders: 1,
    }));
    
    batchCreateMutation.mutate(tasks);
  };

  const handleQuickOrder = (task: any) => {
    setSelectedTask(task);
    setTakerSearch('');
    setSelectedTaker('');
    setShowTakerDropdown(false);
    setQuickOrderForm({ orderNo: '', orderNo19: '', actualPayment: '' });
    setShowQuickOrder(true);
  };

  const handleConfirmQuickOrder = (force = false) => {
    if (!selectedTaker) {
      toastError('请选择接单人');
      return;
    }
    quickOrderMutation.mutate({
      taskId: selectedTask.id,
      takerId: selectedTaker,
      orderNo: quickOrderForm.orderNo || undefined,
      orderNo19: quickOrderForm.orderNo19 || undefined,
      actualPayment: quickOrderForm.actualPayment !== '' ? Number(quickOrderForm.actualPayment) : undefined,
      force,
    });
  };

  const handleCopyTaoToken = (taoToken: string) => {
    navigator.clipboard.writeText(taoToken).then(() => {
      toastSuccess('淘口令已复制');
    });
  };

  const tasks = (data as any)?.data?.list || [];
  const total = (data as any)?.data?.total || 0;
  const takers = (takersData as any)?.data?.list || [];

  const filteredTasks = useMemo(() => {
    return filterData(tasks, columnFilters, (item: any, key: string) => {
      if (key === 'publishDate') return item.publishDate ? formatDate(item.publishDate) : '';
      return String(item[key] ?? '');
    });
  }, [tasks, columnFilters]);

  const setColFilter = (key: string, value: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  };

  if (!canView('tasks')) return <NoPermission module="tasks" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">任务管理</h2>
          <p className="text-muted-foreground mt-1">点击单元格直接编辑，按 Enter 保存</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDialog
            title="导出任务数据"
            filename="任务数据"
            columns={taskColumns}
            data={tasks}
            buttonLabel="导出"
            fetchData={async () => {
              const res: any = await tasksApi.getAll({ pageSize: 99999, search, status: statusFilter });
              return res?.data?.list || [];
            }}
          />
          <ImportDialog
            title="导入任务数据"
            templateFilename="任务导入模板"
            columns={[
              { key: 'publishDate', label: '发布日期' },
              { key: 'productId', label: '商品ID', required: true },
              { key: 'productCode', label: '产品编号', required: true },
              { key: 'taoToken', label: '淘口令' },
              { key: 'price', label: '商品价格' },
              { key: 'baseCommission', label: '基础返佣' },
              { key: 'reviewReward', label: '好评返佣' },
              { key: 'maxOrders', label: '限接人数' },
            ]}
            onImport={async (data) => {
              try {
                const result = await tasksApi.batchCreate(data);
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                return result.data || { success: data.length, failed: 0, duplicates: 0 };
              } catch (error: any) {
                console.error('Import error:', error);
                const errorMessage = error?.response?.data?.message || error?.message || '导入失败';
                toastError(errorMessage);
                return { success: 0, failed: data.length, duplicates: 0 };
              }
            }}
            buttonLabel="导入"
          />
          <button
            onClick={() => setShowBatchForm(true)}
            className="btn-press magnetic-btn inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 transition-colors shadow-md shadow-indigo-500/20"
          >
            <Plus className="h-4 w-4" />
            批量新增
          </button>
          <button
            onClick={handleAddNewRow}
            className="btn-press magnetic-btn inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 transition-colors shadow-md shadow-violet-500/20"
          >
            <Plus className="h-4 w-4" />
            新增任务
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索商品ID、产品编号..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="premium-input w-full rounded-xl border bg-card pl-10 pr-4 py-2 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="premium-input rounded-xl border bg-card px-3 py-2 text-sm"
        >
          <option value="">全部状态</option>
          <option value="active">进行中</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
        </select>
      </div>

      {/* Batch Form Modal */}
      {showBatchForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          onClick={() => { setShowBatchForm(false); setBatchProductCodes(''); }}
          onKeyDown={(e) => e.key === 'Escape' && (setShowBatchForm(false), setBatchProductCodes(''))}
          tabIndex={-1}
          ref={batchFormModalRef}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl border border-border/50 animate-modal-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">批量新增任务</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">商品编号（每行一个）</label>
                <textarea
                  value={batchProductCodes}
                  onChange={(e) => setBatchProductCodes(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm premium-input"
                  rows={10}
                  placeholder="SKU-001&#10;SKU-002&#10;SKU-003"
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
                  className="btn-press rounded-xl border px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleBatchCreate}
                  disabled={batchCreateMutation.isPending}
                  className="btn-press rounded-xl bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                >
                  {batchCreateMutation.isPending ? '创建中...' : '批量创建'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Order Modal */}
      {showQuickOrder && selectedTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          onClick={() => { setShowQuickOrder(false); setSelectedTask(null); setSelectedTaker(''); setTakerSearch(''); setShowTakerDropdown(false); setQuickOrderForm({ orderNo: '', orderNo19: '', actualPayment: '' }); }}
          onKeyDown={(e) => e.key === 'Escape' && (setShowQuickOrder(false), setSelectedTask(null), setSelectedTaker(''), setTakerSearch(''), setShowTakerDropdown(false), setQuickOrderForm({ orderNo: '', orderNo19: '', actualPayment: '' }))}
          tabIndex={-1}
          ref={quickOrderModalRef}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl border border-border/50 animate-modal-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">快速接单</h3>
            <div className="space-y-4">
              <div className="rounded-xl border p-4 bg-slate-50 dark:bg-slate-900/40">
                <p className="font-medium">商品ID: {selectedTask.productId || '未填写'}</p>
                <p className="text-sm text-muted-foreground">产品编号: {selectedTask.productCode || '未填写'}</p>
                <p className="text-sm text-muted-foreground">商品价格: {formatCurrency(selectedTask.price)}</p>
                <div className="border-t mt-2 pt-2">
                  <p className="text-sm text-muted-foreground">基础返佣: {formatCurrency(selectedTask.baseCommission)}</p>
                  <p className="text-sm text-muted-foreground">好评返佣: {formatCurrency(selectedTask.reviewReward)}</p>
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    总返款: {formatCurrency(selectedTask.price + selectedTask.baseCommission + selectedTask.reviewReward)}
                  </p>
                </div>
                <p className="text-sm mt-2">
                  剩余名额: <span className="font-bold text-indigo-600 dark:text-indigo-400">{selectedTask.maxOrders - selectedTask.currentOrders}人</span>
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">选择接单人 *</label>
                <div className="relative mt-1" ref={takerDropdownRef}>
                  <div className="relative">
                    <input
                      type="text"
                      value={takerSearch}
                      onChange={(e) => {
                        setTakerSearch(e.target.value);
                        setSelectedTaker('');
                        setShowTakerDropdown(true);
                      }}
                      onFocus={() => setShowTakerDropdown(true)}
                      placeholder="点击展开或输入搜索..."
                      className={`w-full rounded-lg border bg-card px-3 py-2 text-sm pr-8 premium-input ${
                        selectedTaker ? 'border-emerald-500' : 'border-input'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowTakerDropdown(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <svg className={`h-4 w-4 transition-transform ${showTakerDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                  </div>
                  {showTakerDropdown && (
                    <div className="absolute z-10 mt-1 w-full max-h-52 overflow-y-auto rounded-md border bg-card shadow-lg">
                      {takers
                        .filter((t: any) => {
                          if (!takerSearch) return true;
                          const keyword = takerSearch.toLowerCase();
                          return (
                            (t.wechatName && t.wechatName.toLowerCase().includes(keyword)) ||
                            (t.wechatId && t.wechatId.toLowerCase().includes(keyword))
                          );
                        })
                        .slice(0, 50)
                        .map((taker: any) => (
                          <div
                            key={taker.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedTaker(taker.id);
                              setTakerSearch(`${taker.wechatName}（${taker.wechatId}）`);
                              setShowTakerDropdown(false);
                            }}
                            className={`cursor-pointer px-3 py-2 text-sm hover:bg-accent flex items-center justify-between ${
                              selectedTaker === taker.id ? 'bg-accent font-medium' : ''
                            }`}
                          >
                            <span>{taker.wechatName}</span>
                            <span className="text-xs text-muted-foreground">{taker.wechatId}</span>
                          </div>
                        ))
                      }
                      {takers.filter((t: any) => {
                        if (!takerSearch) return true;
                        const keyword = takerSearch.toLowerCase();
                        return (
                          (t.wechatName && t.wechatName.toLowerCase().includes(keyword)) ||
                          (t.wechatId && t.wechatId.toLowerCase().includes(keyword))
                        );
                      }).length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">未找到匹配的接单人</div>
                      )}
                    </div>
                  )}
                </div>
                {selectedTaker && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    已选择接单人
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">订单号（淘宝）</label>
                <input
                  type="text"
                  value={quickOrderForm.orderNo}
                  onChange={(e) => setQuickOrderForm({ ...quickOrderForm, orderNo: e.target.value })}
                  placeholder="选填"
                  className="mt-1 w-full rounded-lg border bg-card px-3 py-2 text-sm premium-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium">19位订单号</label>
                <input
                  type="text"
                  value={quickOrderForm.orderNo19}
                  onChange={(e) => setQuickOrderForm({ ...quickOrderForm, orderNo19: e.target.value })}
                  placeholder="选填"
                  className="mt-1 w-full rounded-lg border bg-card px-3 py-2 text-sm premium-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium">实付款（元）</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={quickOrderForm.actualPayment}
                  onChange={(e) => setQuickOrderForm({ ...quickOrderForm, actualPayment: e.target.value })}
                  placeholder="选填，默认 0"
                  className="mt-1 w-full rounded-lg border bg-card px-3 py-2 text-sm premium-input"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickOrder(false);
                    setSelectedTask(null);
                    setSelectedTaker('');
                    setTakerSearch('');
                    setShowTakerDropdown(false);
                    setQuickOrderForm({ orderNo: '', orderNo19: '', actualPayment: '' });
                  }}
                  className="btn-press rounded-xl border px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  onClick={() => handleConfirmQuickOrder()}
                  disabled={quickOrderMutation.isPending}
                  className="btn-press rounded-xl bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-600 disabled:opacity-50"
                >
                  {quickOrderMutation.isPending ? '接单中...' : '确认接单'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-4 p-4 bg-indigo-50/80 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30 flex-wrap animate-fade-up">
          <span className="text-sm text-muted-foreground">
            已选择 <span className="font-bold text-indigo-600 dark:text-indigo-400">{selectedIds.size}</span> 项
          </span>
          <button
            onClick={handleBatchDelete}
            disabled={batchDeleteMutation.isPending}
            className="btn-press inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 transition-colors shadow-sm"
          >
            <Trash2 className="h-4 w-4" />
            {batchDeleteMutation.isPending ? '删除中...' : '批量删除'}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="btn-press text-sm text-muted-foreground hover:text-foreground"
          >
            取消选择
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border bg-card shadow-sm overflow-x-auto premium-card">
        <table className="w-full">
          <thead>
            <tr className="table-header">
              <th className="px-4 py-3 text-left">
                <button
                  onClick={handleSelectAll}
                  className="p-1 hover:bg-accent rounded"
                  title={selectedIds.size === filteredTasks.length ? '取消全选' : '全选'}
                >
                  {selectedIds.size === filteredTasks.length && filteredTasks.length > 0 ? (
                    <CheckSquare className="h-4 w-4 text-indigo-500" />
                  ) : (
                    <Square className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>商品ID</div>
                <ColumnFilter value={columnFilters['productId'] || ''} onChange={(v) => setColFilter('productId', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>产品编号</div>
                <ColumnFilter value={columnFilters['productCode'] || ''} onChange={(v) => setColFilter('productCode', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>淘口令</div>
                <ColumnFilter value={columnFilters['taoToken'] || ''} onChange={(v) => setColFilter('taoToken', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>价格</div>
                <ColumnFilter value={columnFilters['price'] || ''} onChange={(v) => setColFilter('price', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>基础返佣</div>
                <ColumnFilter value={columnFilters['baseCommission'] || ''} onChange={(v) => setColFilter('baseCommission', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>好评返佣</div>
                <ColumnFilter value={columnFilters['reviewReward'] || ''} onChange={(v) => setColFilter('reviewReward', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>限接人数</div>
                <ColumnFilter value={columnFilters['maxOrders'] || ''} onChange={(v) => setColFilter('maxOrders', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>已接人数</div>
                <ColumnFilter value={columnFilters['currentOrders'] || ''} onChange={(v) => setColFilter('currentOrders', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>状态</div>
                <ColumnFilter type="select" value={columnFilters['status'] || ''} onChange={(v) => setColFilter('status', v)} options={[{ value: 'active', label: '进行中' }, { value: 'completed', label: '已完成' }, { value: 'cancelled', label: '已取消' }]} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>发布日期</div>
                <ColumnFilter value={columnFilters['publishDate'] || ''} onChange={(v) => setColFilter('publishDate', v)} />
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium"><div>操作</div></th>
            </tr>
          </thead>
          <tbody>
            {/* New Row */}
            {addingNewRow && (
              <tr className="border-b bg-indigo-50/50 dark:bg-indigo-950/20">
                <td className="px-4 py-2"></td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={newRowData.productId}
                    onChange={(e) => setNewRowData({ ...newRowData, productId: e.target.value })}
                    className="w-full rounded border px-2 py-1 text-sm"
                    placeholder="商品ID"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={newRowData.productCode}
                    onChange={(e) => setNewRowData({ ...newRowData, productCode: e.target.value })}
                    className="w-full rounded border px-2 py-1 text-sm"
                    placeholder="产品编号"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={newRowData.taoToken}
                    onChange={(e) => setNewRowData({ ...newRowData, taoToken: e.target.value })}
                    className="w-full rounded border px-2 py-1 text-sm"
                    placeholder="淘口令"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={newRowData.price}
                    onChange={(e) => setNewRowData({ ...newRowData, price: e.target.value })}
                    className="w-24 rounded border px-2 py-1 text-sm"
                    placeholder="价格"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={newRowData.baseCommission}
                    onChange={(e) => setNewRowData({ ...newRowData, baseCommission: e.target.value })}
                    className="w-20 rounded border px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={newRowData.reviewReward}
                    onChange={(e) => setNewRowData({ ...newRowData, reviewReward: e.target.value })}
                    className="w-20 rounded border px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      value={newRowData.maxOrders}
                      onChange={(e) => setNewRowData({ ...newRowData, maxOrders: e.target.value })}
                      className="w-16 rounded border px-2 py-1 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">人</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-muted-foreground">0人</td>
                <td className="px-4 py-2">
                  <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium badge-success">
                    进行中
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {formatDate(new Date())}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={handleSaveNewRow}
                      disabled={createMutation.isPending}
                      className="btn-press px-3 py-1 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600 disabled:opacity-50"
                    >
                      {createMutation.isPending ? '保存中...' : '保存'}
                    </button>
                    <button
                      onClick={handleCancelNewRow}
                      className="btn-press px-3 py-1 border rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      取消
                    </button>
                  </div>
                </td>
              </tr>
            )}
            
            {/* Data Rows */}
            {isLoading ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : filteredTasks.length === 0 && !addingNewRow ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">
                  暂无匹配数据
                </td>
              </tr>
            ) : (
              filteredTasks.map((task: any) => (
                <tr key={task.id} className={`table-row-hover table-row-zebra ${selectedIds.has(task.id) ? 'table-row-selected' : ''}`}>
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
                    <div className="flex items-center gap-1">
                      {renderEditableCell(task, 'taoToken')}
                      {task.taoToken && (
                        <button
                          onClick={() => handleCopyTaoToken(task.taoToken)}
                          className="p-1 hover:bg-accent rounded"
                          title="复制淘口令"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      )}
                    </div>
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
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleQuickOrder(task)}
                        disabled={task.currentOrders >= task.maxOrders || task.status !== 'active'}
                        className="btn-press p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="快速接单"
                      >
                        <Zap className="h-4 w-4 text-emerald-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="btn-press p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-colors"
                        title="删除任务"
                      >
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center items-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-press rounded-xl border bg-card px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            上一页
          </button>
          <span className="flex items-center px-4 text-sm text-muted-foreground tabular-nums">
            第 {page} 页 / 共 {Math.ceil(total / 20)} 页
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(total / 20)}
            className="btn-press rounded-xl border bg-card px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}