import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { ordersApi } from '@/lib/api';
import { formatCurrency, formatDate, calcDisplayTotalRefund } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Search, Copy, Save, Trash2, CheckSquare, Square, CheckCircle, Circle, Star, Calendar, Eye, ExternalLink, ArrowUpDown, ChevronUp, ChevronDown, Undo2 } from 'lucide-react';
import ExportDialog from '@/components/ExportDialog';
import ImportDialog from '@/components/ImportDialog';
import ColumnFilter from '@/components/ColumnFilter';
import OrderDrawer from '@/components/OrderDrawer';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { orderColumns } from '@/lib/export';
import { usePermissions } from '@/lib/permissions';
import { computeVirtualWindow } from '@/lib/virtualList';

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const PAGE_SIZE_STORAGE_KEY = 'tmall_orders_page_size';

// P1-11 列表虚拟滚动：仅当渲染行数超过阈值时启用窗口化，降低回归面。
// VIRTUAL_ROW_HEIGHT 为固定行高（虚拟模式下单元格会被裁成单行以保证高度可预测）。
const VIRTUALIZE_THRESHOLD = 200;
const VIRTUAL_ROW_HEIGHT = 56;
const VIRTUAL_OVERSCAN = 6;

interface EditingCell {
  orderId: string;
  field: string;
}

export default function Orders() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const { canEdit } = usePermissions();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
      return PAGE_SIZE_OPTIONS.includes(saved) ? saved : 20;
    } catch {
      return 20;
    }
  });
  const [search, setSearch] = useState('');
  const [refundFilter, setRefundFilter] = useState('');
  const [reviewFilter, setReviewFilter] = useState('');
  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<any>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortConfig, setSortConfig] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page, pageSize, debouncedSearch, refundFilter, reviewFilter, startDate, endDate, sortConfig, columnFilters],
    queryFn: () => ordersApi.getAll({
      page,
      pageSize,
      search: debouncedSearch,
      isRefunded: refundFilter || undefined,
      isGoodReview: reviewFilter || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      sortField: sortConfig?.field || undefined,
      sortDirection: sortConfig?.direction || undefined,
      columnFilters,
    }),
  });

  // P2-3 撤销预览：纯只读（GET /orders/undo-last），供二次确认弹窗展示「将还原 N 条」。
  // 批量操作完成后必须失效该查询，让按钮状态跟随「最近一次批量操作」刷新。
  const { data: undoPreviewData } = useQuery({
    queryKey: ['orders-undo-preview'],
    queryFn: () => ordersApi.undoPreview(),
    enabled: canEdit('orders'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => ordersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message || '更新订单失败');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ordersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toastSuccess('删除成功');
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message || '删除订单失败');
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map(id => ordersApi.delete(id)));
      const success = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      return { success, failed };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setSelectedIds(new Set());
      toastSuccess(`批量删除完成: 成功${result.success}条${result.failed > 0 ? `，失败${result.failed}条` : ''}`);
    },
    onError: () => {
      toastError('批量删除失败');
    },
  });

  const batchStatusMutation = useMutation({
    mutationFn: ({ ids, field, value }: { ids: string[]; field: string; value: boolean | string }) =>
      ordersApi.batchUpdateStatus(ids, field, value),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['orders-undo-preview'] }); // P2-3：批量操作后刷新撤销预览
      setSelectedIds(new Set());
      toastSuccess(data?.message || '批量更新成功');
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message || '批量更新失败');
    },
  });

  // P2-3 撤销最近一次批量操作：二次确认（复用 ConfirmDialog，仅 import 不改组件）后执行
  const undoMutation = useMutation({
    mutationFn: () => ordersApi.undoLast(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['orders-undo-preview'] });
      toastSuccess(data?.message || '已撤销上一次批量操作');
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message || '撤销失败');
    },
  });

  const handleUndoLast = async () => {
    const preview = (undoPreviewData as any)?.data;
    if (!preview?.available) {
      toastError('没有可撤销的批量操作（仅支持撤销最近一次，且不能重复撤销）');
      return;
    }
    const actionLabel = preview.action === 'batch_create' ? '批量导入' : preview.action === 'batch_update' ? '批量修改' : '批量标记';
    const detail = preview.action === 'batch_create'
      ? `将删除上次批量导入新建的订单（共 ${preview.itemCount} 条导入行），并回退对应任务/接单人计数`
      : `将还原 ${preview.itemCount} 条订单的改动前状态`;
    const ok = await confirm({
      message: `撤销最近一次「${actionLabel}」：\n${detail}。\n撤销本身不支持再次撤销，确定继续吗？`,
      variant: 'warning',
      confirmText: '撤销',
    });
    if (ok) undoMutation.mutate();
  };

  useEffect(() => {
    if (editingCell) {
      if (inputRef.current) inputRef.current.focus();
      if (selectRef.current) selectRef.current.focus();
    }
  }, [editingCell]);

  // 由单元格原值推导「进入编辑态时的输入值」，供点击编辑与键盘导航（P1-5）共用
  const buildEditValue = (field: string, currentValue: any): string => {
    if (field === 'refundDate' || field === 'drawingDate' || field === 'reviewCommissionDate') {
      if ((field === 'drawingDate' || field === 'reviewCommissionDate') && currentValue) {
        const d = new Date(currentValue);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
      return currentValue ? String(currentValue).split('T')[0] : '';
    }
    if (typeof currentValue === 'boolean') return currentValue ? 'true' : 'false';
    return String(currentValue ?? '');
  };

  const handleCellClick = (orderId: string, field: string, currentValue: any) => {
    if (!canEdit('orders')) return; // 检查编辑权限
    if (editingCell?.orderId === orderId && editingCell?.field === field) return;

    setEditingCell({ orderId, field });
    setEditValue(buildEditValue(field, currentValue));
  };

  const handleSave = () => {
    if (!editingCell) return;
    
    const { orderId, field } = editingCell;
    let value = editValue;
    
    // 处理布尔字段
    if (['isRefunded', 'isBaseCommissionRefunded'].includes(field)) {
      value = value === 'true';
    }
    // 处理数字字段
    else if (['actualPayment', 'totalRefund', 'baseCommission', 'reviewCommission'].includes(field)) {
      value = Number(value) || 0;
    }
    
    const updateData: any = { [field]: value };
    
    // 如果修改了订单编号，自动生成订单链接
    if (field === 'orderNo' && value) {
      updateData.orderLink = `https://qn.taobao.com/home.htm/trade-platform/tp/detail?spm=a21dvs.23580594.0.0.60fb2cedkP5BNV&bizOrderId=${value}`;
    }
    
    // 如果标记为已返款，自动设置返款日期
    if (field === 'isRefunded' && value) {
      updateData.refundDate = new Date().toISOString().split('T')[0];
    }
    // 如果标记为作图中，自动设置作图时间（精确到分钟）
    if (field === 'isGoodReview' && value === 'creating') {
      updateData.drawingDate = new Date().toISOString();
    }
    // 如果标记为已好评，自动设置好评返佣日期（精确到分钟）
    if (field === 'isGoodReview' && value === 'reviewed') {
      updateData.reviewCommissionDate = new Date().toISOString();
    }
    
    updateMutation.mutate({ id: orderId, data: updateData });
    setEditingCell(null);
    setEditValue('');
  };

  const handleSelectChange = (orderId: string, field: string, value: string) => {
    const updateData: any = { [field]: value };
    
    if (field === 'isRefunded' && value === 'true') {
      updateData.refundDate = new Date().toISOString().split('T')[0];
    }
    if (field === 'isGoodReview' && value === 'creating') {
      updateData.drawingDate = new Date().toISOString();
    }
    if (field === 'isGoodReview' && value === 'reviewed') {
      updateData.reviewCommissionDate = new Date().toISOString();
    }
    
    updateMutation.mutate({ id: orderId, data: updateData });
    setEditingCell(null);
  };

  const handleCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const handleDelete = async (orderId: string) => {
    if (await confirm({ message: '确定要删除这个订单吗？', variant: 'danger' })) {
      deleteMutation.mutate(orderId);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === sortedOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedOrders.map((o: any) => o.id)));
    }
  };

  const handleSelectOne = (orderId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedIds(newSelected);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) {
      toastError('请先选择要删除的订单');
      return;
    }
    if (await confirm({ message: `确定要删除选中的 ${selectedIds.size} 个订单吗？此操作不可恢复！`, variant: 'danger', confirmText: '删除' })) {
      batchDeleteMutation.mutate(Array.from(selectedIds));
    }
  };

  const handleBatchStatus = async (field: 'isRefunded' | 'isGoodReview' | 'isBaseCommissionRefunded', value: boolean | string) => {
    if (selectedIds.size === 0) {
      toastError('请先选择订单');
      return;
    }
    // 基础返佣返款状态单独成句：现有模板会拼出「已基础返佣已返款」这种病句，故单独分支。
    const message = field === 'isBaseCommissionRefunded'
      ? `确定要将选中的 ${selectedIds.size} 个订单的基础返佣标记为已返款吗？`
      : (() => {
          const label = field === 'isRefunded' ? '返款' : '好评';
          const statusLabel = typeof value === 'string'
            ? (value === 'reviewed' ? '已好评' : value === 'creating' ? '作图中' : value === 'returned' ? '已返图' : '未好评')
            : (value ? '已' : '未');
          return `确定要将选中的 ${selectedIds.size} 个订单标记为${statusLabel}${label}吗？`;
        })();
    if (await confirm({ message, variant: 'warning' })) {
      batchStatusMutation.mutate({ ids: Array.from(selectedIds), field, value });
    }
  };

  // P1-5 表格键盘流：Enter 提交并跳到下一行同列，↑↓ 上下移动同列，Ctrl/Cmd+D 复制上一行同列。
  // 仅作用于行内可编辑的文本/数字/日期单元格；状态下拉（isRefunded/isGoodReview）保持原生交互。
  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toastSuccess('已复制');
    });
  };

  const isEditing = (orderId: string, field: string) => {
    return editingCell?.orderId === orderId && editingCell?.field === field;
  };

  const renderEditableCell = (order: any, field: string, type: 'text' | 'number' | 'date' | 'datetime' = 'text') => {
    const editing = isEditing(order.id, field);
    const value = order[field];
    
    if (editing) {
      return (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type={type === 'datetime' ? 'datetime-local' : type}
            step={type === 'number' ? '0.01' : undefined}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="w-full rounded border border-primary px-2 py-1 text-sm bg-background"
          />
          <button
            onClick={handleSave}
            className="p-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded"
          >
            <Save className="h-3 w-3" />
          </button>
        </div>
      );
    }
    
    const displayValue = () => {
      if (type === 'number') return value ? formatCurrency(value) : '-';
      if (type === 'datetime') return value ? formatDate(value) : '-';
      if (type === 'date') return value ? formatDate(value).split(' ')[0] : '-';
      return value || '-';
    };
    
    return (
      <div
        onClick={() => handleCellClick(order.id, field, value)}
        className="cursor-pointer hover:bg-accent px-2 py-1 rounded min-h-[28px] flex items-center"
        title="点击编辑"
      >
        {displayValue()}
      </div>
    );
  };

  // 只读单元格（不可编辑）
  const renderReadOnlyCell = (value: any, type: 'text' | 'number' | 'date' | 'datetime' = 'text') => {
    const displayValue = () => {
      if (type === 'number') return value ? formatCurrency(value) : '-';
      if (type === 'datetime') return value ? formatDate(value) : '-';
      if (type === 'date') return value ? formatDate(value).split(' ')[0] : '-';
      return value || '-';
    };
    
    return (
      <div className="px-2 py-1 rounded min-h-[28px] flex items-center">
        {displayValue()}
      </div>
    );
  };

  const renderStatusSelect = (order: any, field: string, options: { value: string; label: string; color: string }[]) => {
    const editing = isEditing(order.id, field);
    const value = order[field];
    const currentOption = options.find(opt => opt.value === String(value));
    
    if (editing) {
      return (
        <select
          ref={selectRef}
          value={editValue}
          onChange={(e) => handleSelectChange(order.id, field, e.target.value)}
          onBlur={() => setEditingCell(null)}
          onKeyDown={(e) => e.key === 'Escape' && handleCancel()}
          className="rounded border border-primary px-2 py-1 text-sm bg-white w-full"
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }
    
    return (
      <div
        onClick={() => handleCellClick(order.id, field, value)}
        className={`cursor-pointer hover:opacity-80 px-2 py-1 rounded text-xs font-medium inline-flex items-center ${currentOption?.color || ''}`}
        title="点击切换状态"
      >
        {currentOption?.label || '-'}
      </div>
    );
  };

  // 「基础返佣」列：左半是可点击编辑的金额（复用 renderEditableCell，行为不变），
  // 右半是独立的基础返佣返款状态标记（点标记切换）。该状态与订单级 isRefunded 完全独立、互不影响。
  const renderBaseCommissionCell = (order: any) => {
    const paid = !!order.isBaseCommissionRefunded;
    const editable = canEdit('orders');
    return (
      <div className={`flex items-center gap-1 rounded ${paid ? 'bg-green-100 dark:bg-green-900/30' : ''}`}>
        <div className="flex-1 min-w-0">{renderEditableCell(order, 'baseCommission', 'number')}</div>
        <button
          onClick={(e) => { e.stopPropagation(); if (editable) updateMutation.mutate({ id: order.id, data: { isBaseCommissionRefunded: !paid } }); }}
          disabled={!editable || updateMutation.isPending}
          title={paid ? '基础返佣已返款，点击改为未返款' : '基础返佣未返款，点击标记为已返款'}
          className={`shrink-0 p-0.5 rounded transition-colors ${paid ? 'text-green-600 dark:text-green-400 hover:bg-green-200/60' : 'text-muted-foreground hover:text-foreground hover:bg-accent'} disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {paid ? <CheckCircle className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  };

  const orders = (data as any)?.data?.list || [];
  const total = (data as any)?.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Filtering and sorting are performed by the server before pagination.
  const sortedOrders = orders;

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
    try {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
    } catch {
      /* localStorage 不可用时静默忽略，仅本次会话生效 */
    }
  };

  const handleSort = (field: string) => {
    setPage(1);
    setSortConfig(prev => {
      if (!prev || prev.field !== field) return { field, direction: 'asc' };
      if (prev.direction === 'asc') return { field, direction: 'desc' };
      return null; // 回到默认排序
    });
  };

  const getUniqueValues = useMemo(() => {
    return (field: string): { value: string; label: string }[] => {
      const values: string[] = orders.map((o: any): string => {
        if (field === 'wechatName') return o.taker?.wechatName || '';
        if (field === 'wechatId') return o.taker?.wechatId || '';
        if (field === 'taobaoNickname') return o.taker?.taobaoNickname || '';
        return String(o[field] ?? '');
      }).filter(Boolean);
      return [...new Set(values)].map(v => ({ value: v, label: v }));
    };
  }, [orders]);

  const setColFilter = (key: string, value: string) => {
    setPage(1);
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  };

  const refundOptions = [
    { value: 'true', label: '已返款', color: 'badge-success' },
    { value: 'false', label: '未返款', color: 'badge-danger' },
  ];

  const reviewOptions = [
    { value: 'pending', label: '未好评', color: 'badge-neutral' },
    { value: 'reviewed', label: '已好评', color: 'badge-success' },
    { value: 'creating', label: '作图中', color: 'badge-warning' },
    { value: 'returned', label: '已返图', color: 'badge-info' },
  ];

  // 快捷日期筛选
  const applyDatePreset = (preset: 'today' | 'yesterday' | '7days' | '30days' | 'thisMonth' | 'lastMonth' | 'custom' | 'clear') => {
    if (preset === 'custom') return;
    const now = new Date();
    const fmt = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    if (preset === 'clear') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'today') {
      setStartDate(fmt(now));
      setEndDate(fmt(now));
    } else if (preset === 'yesterday') {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      setStartDate(fmt(y));
      setEndDate(fmt(y));
    } else if (preset === '7days') {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      setStartDate(fmt(d));
      setEndDate(fmt(now));
    } else if (preset === '30days') {
      const d = new Date(now); d.setDate(d.getDate() - 29);
      setStartDate(fmt(d));
      setEndDate(fmt(now));
    } else if (preset === 'thisMonth') {
      setStartDate(fmt(new Date(now.getFullYear(), now.getMonth(), 1)));
      setEndDate(fmt(now));
    } else if (preset === 'lastMonth') {
      setStartDate(fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      setEndDate(fmt(new Date(now.getFullYear(), now.getMonth(), 0)));
    }
    setPage(1);
  };

  // 当前页快速统计（总额/待返款等仅反映当前页数据，总数由服务端返回）
  const stats = useMemo(() => {
    const refundPending = sortedOrders.filter((o: any) => !o.isRefunded).length;
    const reviewPending = sortedOrders.filter((o: any) => o.isGoodReview === 'pending').length;
    const totalAmount = sortedOrders.reduce((sum: number, o: any) => sum + (o.actualPayment || 0), 0);
    const totalRefund = sortedOrders.reduce((sum: number, o: any) =>
      sum + calcDisplayTotalRefund(o), 0);
    return { refundPending, reviewPending, totalAmount, totalRefund, count: total };
  }, [sortedOrders, total]);

  // ── P1-5 键盘流：行间导航辅助 ───────────────────────────────
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

  // ── P1-11 列表虚拟滚动（手写，零 npm 依赖）──────────────────
  // 仅当渲染行数超过阈值时才切换到窗口化渲染；否则完全走原有渲染路径（默认分页 20/50/100）。
  // 注意：订单页分页上限为 100 行/页（PAGE_SIZE_OPTIONS），因此本分支在现有分页策略下
  // 不会被触发；一旦分页上限提高到 200 以上即自动生效。虚拟模式下行高固定为
  // VIRTUAL_ROW_HEIGHT（56px，可容纳当前最常见的两行单元格）；由于该分支当前不可达，
  // 未对单元格追加 truncate/裁剪样式，以免影响常规渲染路径的既有观感。
  const virtualize = sortedOrders.length > VIRTUALIZE_THRESHOLD;
  const [tableViewport, setTableViewport] = useState({ scrollTop: 0, height: 600 });
  const virtualWindow = useMemo(
    () =>
      computeVirtualWindow({
        itemCount: sortedOrders.length,
        rowHeight: VIRTUAL_ROW_HEIGHT,
        scrollTop: tableViewport.scrollTop,
        viewportHeight: tableViewport.height,
        overscan: VIRTUAL_OVERSCAN,
      }),
    [sortedOrders.length, tableViewport]
  );
  const visibleOrders = virtualize
    ? sortedOrders.slice(virtualWindow.startIndex, virtualWindow.endIndex)
    : sortedOrders;
  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setTableViewport({ scrollTop: el.scrollTop, height: el.clientHeight || 600 });
  };

  // ── P1-4 移动端卡片视图 ─────────────────────────────────────
  // 与桌面表格共用同一份 react-query 数据与全部状态（筛选/分页/批量选择），
  // 不新增任何请求，仅按断点切换渲染形态（小屏卡片 md:hidden / 桌面表格 hidden md:block）。
  const renderOrderCard = (order: any) => {
    const selected = selectedIds.has(order.id);
    return (
      <div
        key={order.id}
        className={`rounded-2xl border bg-card p-4 shadow-sm apple-card space-y-3 ${selected ? 'ring-2 ring-indigo-400/60' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => handleSelectOne(order.id)}
              className="p-1 -ml-1 hover:bg-accent rounded shrink-0"
              title={selected ? '取消选择' : '选择'}
            >
              {selected ? <CheckSquare className="h-5 w-5 text-primary" /> : <Square className="h-5 w-5 text-muted-foreground" />}
            </button>
            <div className="min-w-0">
              <p className="font-semibold truncate">{order.taker?.wechatName || '-'}</p>
              <p className="text-xs text-muted-foreground truncate">{order.taker?.taobaoNickname || '-'}</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{formatDate(order.orderDate)}</span>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">总返款</p>
            <p className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(calcDisplayTotalRefund(order))}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">实付</p>
            <p className="font-medium">{formatCurrency(order.actualPayment)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">返款状态</p>
            {renderStatusSelect(order, 'isRefunded', refundOptions)}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">好评状态</p>
            {renderStatusSelect(order, 'isGoodReview', reviewOptions)}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">返款日期</p>
            {renderEditableCell(order, 'refundDate', 'date')}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">基础返佣</p>
            {renderBaseCommissionCell(order)}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">好评返佣</p>
            {renderEditableCell(order, 'reviewCommission', 'number')}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">19订单号</p>
            {renderEditableCell(order, 'orderNo19', 'text')}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">订单编号</p>
            {renderEditableCell(order, 'orderNo', 'text')}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">备注</p>
            {renderEditableCell(order, 'remark', 'text')}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">作图时间</p>
            {renderEditableCell(order, 'drawingDate', 'datetime')}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">好评返佣日期</p>
            {renderEditableCell(order, 'reviewCommissionDate', 'datetime')}
          </div>
        </div>

        <div className="text-sm space-y-1">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-muted-foreground shrink-0">商品</span>
            <span className="truncate">{order.task?.productName || '-'}</span>
            {order.productId && (
              <a
                href={`https://detail.tmall.com/item.htm?id=${order.productId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 shrink-0"
                title="在天猫查看"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-1 min-w-0 text-muted-foreground">
            <span className="text-xs shrink-0">ID</span>
            <span className="truncate">{order.productId || '-'}</span>
            <span className="text-xs shrink-0 ml-1">编号</span>
            <span className="truncate">{order.productCode || '-'}</span>
            {order.productCode && (
              <a
                href={`http://web.19buy.com/search.aspx?id=${order.productCode}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-600 dark:text-sky-400 shrink-0"
                title="查看产品页面"
              >
                ↗
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <div className="flex items-center gap-2 min-w-0">
            {order.orderLink ? (
              <>
                <a
                  href={order.orderLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-600 dark:text-sky-400 text-xs hover:underline"
                >
                  打开订单
                </a>
                <button
                  onClick={() => handleCopy(order.orderLink)}
                  className="text-muted-foreground hover:text-foreground"
                  title="复制链接"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleCellClick(order.id, 'orderLink', order.orderLink)}
                  className="text-muted-foreground hover:text-foreground text-xs"
                  title="编辑链接"
                >
                  ✎
                </button>
              </>
            ) : (
              <button
                onClick={() => handleCellClick(order.id, 'orderLink', '')}
                className="text-muted-foreground hover:text-foreground text-xs"
                title="点击添加链接"
              >
                + 添加链接
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setDrawerOrderId(order.id)}
              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
              title="查看详情"
            >
              <Eye className="h-4 w-4" /> 详情
            </button>
            <button
              onClick={() => handleDelete(order.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/40 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
              title="删除订单"
            >
              <Trash2 className="h-4 w-4" /> 删除
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">接单明细</h2>
          <p className="text-muted-foreground mt-1">点击任意单元格直接编辑，Enter 保存并下移，↑↓ 上下移动，Ctrl+D 复制上行，Esc 取消</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDialog
            title="导出订单数据"
            filename="订单数据"
            columns={orderColumns}
            data={orders}
            buttonLabel="导出"
            fetchData={async () => {
              const res = await api.get('/orders', {
                params: {
                  page: 1,
                  pageSize: 99999,
                  search,
                  isRefunded: refundFilter || undefined,
                  isGoodReview: reviewFilter || undefined,
                  startDate: startDate || undefined,
                  endDate: endDate || undefined,
                  sortField: sortConfig?.field || undefined,
                  sortDirection: sortConfig?.direction || undefined,
                  columnFilters: Object.keys(columnFilters).length > 0 ? columnFilters : undefined,
                },
                timeout: 120000,
              });
              return res.data?.list || [];
            }}
          />
          {canEdit('orders') && (
            <ImportDialog
              title="导入订单数据"
              templateFilename="订单导入模板"
              columns={[
                { key: 'orderDate', label: '接单日期' },
                { key: 'wechatName', label: '微信昵称' },
                { key: 'wechatId', label: '微信号' },
                { key: 'productId', label: '商品ID' },
                { key: 'productCode', label: '产品编号' },
                { key: 'orderNo', label: '订单编号' },
                { key: 'orderNo19', label: '19订单号' },
                { key: 'actualPayment', label: '实付价' },
                { key: 'baseCommission', label: '基础返佣' },
                { key: 'isBaseCommissionRefunded', label: '基础返佣已返款' },
                { key: 'reviewCommission', label: '好评返佣' },
                { key: 'isRefunded', label: '是否已返款' },
                { key: 'refundDate', label: '返款日期' },
                { key: 'isGoodReview', label: '是否好评' },
                { key: 'drawingDate', label: '作图时间' },
                { key: 'reviewCommissionDate', label: '好评返佣日期' },
                { key: 'remark', label: '备注' },
              ]}
            onImport={async (data) => {
              try {
                const result = await ordersApi.batchCreate(data);
                queryClient.invalidateQueries({ queryKey: ['orders'] });
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                queryClient.invalidateQueries({ queryKey: ['orders-undo-preview'] }); // P2-3
                // result 已经是 response.data（axios interceptor 处理后）
                return result.data || { success: data.length, failed: 0, duplicates: 0 };
              } catch (error: any) {
                console.error('Import error:', error);
                const errorMessage = error?.response?.data?.message || error?.message || '导入失败';
                toastError(errorMessage);
                return { success: 0, failed: data.length, duplicates: 0 };
              }
            }}
            onValidate={async (rows) => {
              // 服务端只读预校验（POST /orders/validate-batch）。
              // axios 响应拦截器已把 response.data（响应体）解包，故 res.data 即 { rows, summary }。
              const res: any = await ordersApi.validateBatch(rows);
              return res?.data || { rows: [], summary: { total: rows.length, ok: rows.length, dup: 0, invalid: 0 } };
            }}
            buttonLabel="导入"
          />
          )}
          {canEdit('orders') && (
            <ImportDialog
              title="批量修改订单"
              templateFilename="订单批量修改模板"
              mode="update"
              columns={[
                { key: 'orderNo', label: '订单编号' },
                { key: 'orderNo19', label: '19订单号' },
                { key: 'wechatName', label: '微信昵称' },
                { key: 'actualPayment', label: '实付价' },
                { key: 'baseCommission', label: '基础返佣' },
                { key: 'isBaseCommissionRefunded', label: '基础返佣已返款' },
                { key: 'reviewCommission', label: '好评返佣' },
                { key: 'isRefunded', label: '是否已返款' },
                { key: 'refundDate', label: '返款日期' },
                { key: 'isGoodReview', label: '是否好评' },
                { key: 'drawingDate', label: '作图时间' },
                { key: 'reviewCommissionDate', label: '好评返佣日期' },
                { key: 'remark', label: '备注' },
            ]}
            onImport={async (data) => {
              try {
                const result = await ordersApi.batchUpdate(data);
                queryClient.invalidateQueries({ queryKey: ['orders'] });
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                queryClient.invalidateQueries({ queryKey: ['orders-undo-preview'] }); // P2-3
                return result.data || { success: data.length, failed: 0, duplicates: 0 };
              } catch (error: any) {
                console.error('Batch update error:', error);
                const errorMessage = error?.response?.data?.message || error?.message || '批量修改失败';
                toastError(errorMessage);
                return { success: 0, failed: data.length, duplicates: 0 };
              }
            }}
            buttonLabel="批量修改"
          />
          )}
          {canEdit('orders') && (
            <button
              onClick={handleUndoLast}
              disabled={undoMutation.isPending}
              className="apple-btn inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              title="撤销最近一次批量导入/批量修改/批量标记"
            >
              <Undo2 className="h-4 w-4" />
              {undoMutation.isPending ? '撤销中...' : '撤销上一次批量操作'}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <textarea
              rows={2}
              placeholder="批量搜索产品编号、商品ID、订单编号（支持换行、逗号、顿号、分号、空格）..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="apple-input w-full resize-y rounded-xl border bg-card pl-10 pr-4 py-2 text-sm"
            />
          </div>
          <select
            value={refundFilter}
            onChange={(e) => setRefundFilter(e.target.value)}
            className="apple-input rounded-xl border bg-card px-3 py-2 text-sm"
          >
            <option value="">返款状态</option>
            <option value="true">已返款</option>
            <option value="false">未返款</option>
          </select>
          <select
            value={reviewFilter}
            onChange={(e) => setReviewFilter(e.target.value)}
            className="apple-input rounded-xl border bg-card px-3 py-2 text-sm"
          >
            <option value="">好评状态</option>
            <option value="pending">未好评</option>
            <option value="reviewed">已好评</option>
            <option value="creating">作图中</option>
            <option value="returned">已返图</option>
          </select>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="apple-input rounded-xl border bg-card px-3 py-2 text-sm"
              placeholder="开始日期"
            />
            <span className="text-muted-foreground text-sm">至</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="apple-input rounded-xl border bg-card px-3 py-2 text-sm"
              placeholder="结束日期"
            />
          </div>
        </div>
        {/* Quick date presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {[
            { label: '今天', value: 'today' as const },
            { label: '昨天', value: 'yesterday' as const },
            { label: '近7天', value: '7days' as const },
            { label: '近30天', value: '30days' as const },
            { label: '本月', value: 'thisMonth' as const },
            { label: '上月', value: 'lastMonth' as const },
            { label: '自定义', value: 'custom' as const },
            { label: '全部', value: 'clear' as const },
          ].map(preset => (
            <button
              key={preset.value}
              onClick={() => applyDatePreset(preset.value)}
              className="apple-btn rounded-lg border bg-card px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="stagger-item rounded-xl border bg-card p-3.5 text-center apple-card">
          <p className="text-xs text-muted-foreground font-medium">当前结果</p>
          <p className="text-xl font-bold mt-0.5 tabular-nums">{stats.count}</p>
        </div>
        <div className="stagger-item rounded-xl border bg-card p-3.5 text-center apple-card stat-accent-amber">
          <p className="text-xs text-muted-foreground font-medium">待返款</p>
          <p className="text-xl font-bold mt-0.5 text-amber-600 dark:text-amber-400 tabular-nums">{stats.refundPending}</p>
        </div>
        <div className="stagger-item rounded-xl border bg-card p-3.5 text-center apple-card stat-accent-sky">
          <p className="text-xs text-muted-foreground font-medium">待好评</p>
          <p className="text-xl font-bold mt-0.5 text-sky-600 dark:text-sky-400 tabular-nums">{stats.reviewPending}</p>
        </div>
        <div className="stagger-item rounded-xl border bg-card p-3.5 text-center apple-card stat-accent-emerald">
          <p className="text-xs text-muted-foreground font-medium">实付总额</p>
          <p className="text-xl font-bold mt-0.5 tabular-nums">{formatCurrency(stats.totalAmount)}</p>
        </div>
        <div className="stagger-item rounded-xl border bg-card p-3.5 text-center apple-card stat-accent-emerald">
          <p className="text-xs text-muted-foreground font-medium">返款总额</p>
          <p className="text-xl font-bold mt-0.5 text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(stats.totalRefund)}</p>
        </div>
      </div>

      {/* Batch Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-4 bg-indigo-50/80 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30 flex-wrap animate-fade-up">
          <span className="text-sm text-muted-foreground">
            已选择 <span className="font-bold text-indigo-600 dark:text-indigo-400">{selectedIds.size}</span> 项
          </span>
          <div className="h-4 w-px bg-border" />
          <button
            onClick={() => handleBatchStatus('isRefunded', true)}
            disabled={batchStatusMutation.isPending}
            className="apple-btn inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors shadow-sm"
          >
            <CheckCircle className="h-4 w-4" />
            批量已返款
          </button>
          <button
            onClick={() => handleBatchStatus('isBaseCommissionRefunded', true)}
            disabled={batchStatusMutation.isPending}
            className="apple-btn inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50 transition-colors shadow-sm"
          >
            <CheckCircle className="h-4 w-4" />
            批量基础返佣已返款
          </button>
          <button
            onClick={() => handleBatchStatus('isGoodReview', 'reviewed')}
            disabled={batchStatusMutation.isPending}
            className="apple-btn inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50 transition-colors shadow-sm"
          >
            <Star className="h-4 w-4" />
            批量已好评
          </button>
          <button
            onClick={handleBatchDelete}
            disabled={batchDeleteMutation.isPending}
            className="apple-btn inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 transition-colors shadow-sm"
          >
            <Trash2 className="h-4 w-4" />
            {batchDeleteMutation.isPending ? '删除中...' : '批量删除'}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="apple-btn text-sm text-muted-foreground hover:text-foreground ml-auto transition-colors"
          >
            取消选择
          </button>
        </div>
      )}

      {/* Mobile card view (P1-4)：小屏渲染卡片 */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={handleSelectAll}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            {selectedIds.size === sortedOrders.length && sortedOrders.length > 0 ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {selectedIds.size === sortedOrders.length && sortedOrders.length > 0 ? '取消全选' : '全选'}
          </button>
          <span className="text-xs text-muted-foreground">本页 {sortedOrders.length} 条</span>
        </div>
        {isLoading ? (
          <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">加载中...</div>
        ) : sortedOrders.length === 0 ? (
          <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">暂无匹配数据</div>
        ) : (
          sortedOrders.map((order: any) => renderOrderCard(order))
        )}
      </div>

      {/* Table (desktop) */}
      <div
        onScroll={virtualize ? handleTableScroll : undefined}
        style={virtualize ? { maxHeight: '70vh', overflowY: 'auto' } : undefined}
        className="hidden md:block rounded-2xl border bg-card shadow-sm overflow-x-auto apple-card"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="table-header">
              <th className="px-3 py-3 text-left">
                <button
                  onClick={handleSelectAll}
                  className="p-1 hover:bg-accent rounded"
                  title={selectedIds.size === sortedOrders.length ? '取消全选' : '全选'}
                >
                  {selectedIds.size === sortedOrders.length && sortedOrders.length > 0 ? (
                    <CheckSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => handleSort('orderDate')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
                  接单日期
                  {sortConfig?.field === 'orderDate' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
                <ColumnFilter type="date" value={columnFilters['orderDate'] || ''} onChange={(v) => setColFilter('orderDate', v)} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => handleSort('wechatName')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
                  微信昵称
                  {sortConfig?.field === 'wechatName' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
                <ColumnFilter value={columnFilters['wechatName'] || ''} onChange={(v) => setColFilter('wechatName', v)} options={getUniqueValues('wechatName')} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => handleSort('taobaoNickname')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
                  淘宝昵称
                  {sortConfig?.field === 'taobaoNickname' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
                <ColumnFilter value={columnFilters['taobaoNickname'] || ''} onChange={(v) => setColFilter('taobaoNickname', v)} options={getUniqueValues('taobaoNickname')} />
              </th>
              <th className="px-3 py-2 text-left font-medium"><div className="whitespace-nowrap">总返款</div></th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => handleSort('isRefunded')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
                  返款状态
                  {sortConfig?.field === 'isRefunded' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
                <ColumnFilter type="select" value={columnFilters['isRefunded'] || ''} onChange={(v) => setColFilter('isRefunded', v)} options={[{ value: 'true', label: '已返款' }, { value: 'false', label: '未返款' }]} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => handleSort('refundDate')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
                  返款日期
                  {sortConfig?.field === 'refundDate' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
                <ColumnFilter type="date" value={columnFilters['refundDate'] || ''} onChange={(v) => setColFilter('refundDate', v)} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => handleSort('productId')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
                  商品ID
                  {sortConfig?.field === 'productId' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
                <ColumnFilter value={columnFilters['productId'] || ''} onChange={(v) => setColFilter('productId', v)} options={getUniqueValues('productId')} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => handleSort('productCode')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
                  产品编号
                  {sortConfig?.field === 'productCode' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
                <ColumnFilter value={columnFilters['productCode'] || ''} onChange={(v) => setColFilter('productCode', v)} options={getUniqueValues('productCode')} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => handleSort('orderNo19')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
                  19订单号
                  {sortConfig?.field === 'orderNo19' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
                <ColumnFilter value={columnFilters['orderNo19'] || ''} onChange={(v) => setColFilter('orderNo19', v)} options={getUniqueValues('orderNo19')} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => handleSort('orderNo')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
                  订单编号
                  {sortConfig?.field === 'orderNo' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
                <ColumnFilter value={columnFilters['orderNo'] || ''} onChange={(v) => setColFilter('orderNo', v)} options={getUniqueValues('orderNo')} />
              </th>
              <th className="px-3 py-2 text-left font-medium"><div className="whitespace-nowrap">订单链接</div></th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => handleSort('actualPayment')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
                  实付
                  {sortConfig?.field === 'actualPayment' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
                <ColumnFilter value={columnFilters['actualPayment'] || ''} onChange={(v) => setColFilter('actualPayment', v)} options={getUniqueValues('actualPayment')} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => handleSort('isGoodReview')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
                  好评状态
                  {sortConfig?.field === 'isGoodReview' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
                <ColumnFilter type="select" value={columnFilters['isGoodReview'] || ''} onChange={(v) => setColFilter('isGoodReview', v)} options={[{ value: 'pending', label: '未好评' }, { value: 'reviewed', label: '已好评' }, { value: 'creating', label: '作图中' }, { value: 'returned', label: '已返图' }]} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => handleSort('baseCommission')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
                  基础返佣
                  {sortConfig?.field === 'baseCommission' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
                <ColumnFilter type="select" value={columnFilters['isBaseCommissionRefunded'] || ''} onChange={(v) => setColFilter('isBaseCommissionRefunded', v)} options={[{ value: 'true', label: '已返款' }, { value: 'false', label: '未返款' }]} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => handleSort('reviewCommission')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
                  好评返佣
                  {sortConfig?.field === 'reviewCommission' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
                <ColumnFilter value={columnFilters['reviewCommission'] || ''} onChange={(v) => setColFilter('reviewCommission', v)} options={getUniqueValues('reviewCommission')} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => handleSort('drawingDate')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
                  作图时间
                  {sortConfig?.field === 'drawingDate' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
                <ColumnFilter type="date" value={columnFilters['drawingDate'] || ''} onChange={(v) => setColFilter('drawingDate', v)} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => handleSort('reviewCommissionDate')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
                  好评返佣日期
                  {sortConfig?.field === 'reviewCommissionDate' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
                <ColumnFilter type="date" value={columnFilters['reviewCommissionDate'] || ''} onChange={(v) => setColFilter('reviewCommissionDate', v)} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button onClick={() => handleSort('remark')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
                  备注
                  {sortConfig?.field === 'remark' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
                <ColumnFilter value={columnFilters['remark'] || ''} onChange={(v) => setColFilter('remark', v)} options={getUniqueValues('remark')} />
              </th>
              <th className="px-3 py-2 text-right font-medium"><div className="whitespace-nowrap">操作</div></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={19} className="px-4 py-8 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : sortedOrders.length === 0 ? (
              <tr>
                <td colSpan={19} className="px-4 py-8 text-center text-muted-foreground">
                  暂无匹配数据
                </td>
              </tr>
            ) : (
              <>
                {/* P1-11 虚拟滚动：虚拟模式下用上下占位行撑起滚动高度 */}
                {virtualize && virtualWindow.padTop > 0 && (
                  <tr aria-hidden="true" style={{ height: virtualWindow.padTop }} />
                )}
                {visibleOrders.map((order: any) => (
                <tr key={order.id} style={virtualize ? { height: VIRTUAL_ROW_HEIGHT } : undefined} className={`table-row-hover table-row-zebra ${selectedIds.has(order.id) ? 'table-row-selected' : ''}`}>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleSelectOne(order.id)}
                      className="p-1 hover:bg-accent rounded"
                    >
                      {selectedIds.has(order.id) ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDate(order.orderDate)}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {order.taker?.wechatName}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {order.taker?.taobaoNickname || '-'}
                  </td>
                  <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400 font-medium">
                    <div title={order.isBaseCommissionRefunded
                      ? `实付 ${formatCurrency(order.actualPayment)} + 好评返佣 ${formatCurrency(order.reviewCommission)} + 基础返佣 ${formatCurrency(order.baseCommission)}`
                      : `实付 ${formatCurrency(order.actualPayment)} + 好评返佣 ${formatCurrency(order.reviewCommission)}（基础返佣 ${formatCurrency(order.baseCommission)} 未返款，未计入）`}>
                      {renderReadOnlyCell(calcDisplayTotalRefund(order), 'number')}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {renderStatusSelect(order, 'isRefunded', refundOptions)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {renderEditableCell(order, 'refundDate', 'date')}
                  </td>
                  <td className="px-3 py-2">
                    <div>
                      <p className="font-medium">{order.task?.productName}</p>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">{order.productId}</span>
                        {order.productId && (
                          <a
                            href={`https://detail.tmall.com/item.htm?id=${order.productId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                            title="在天猫查看"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">{order.productCode}</span>
                      {order.productCode && (
                        <a
                          href={`http://web.19buy.com/search.aspx?id=${order.productCode}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 text-xs"
                          title="查看产品页面"
                        >
                          ↗
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {renderEditableCell(order, 'orderNo19', 'text')}
                  </td>
                  <td className="px-3 py-2">
                    {renderEditableCell(order, 'orderNo', 'text')}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing(order.id, 'orderLink') ? (
                      <div className="flex items-center gap-1">
                        <input
                          ref={inputRef}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleSave}
                          onKeyDown={handleKeyDown}
                          className="w-full rounded border border-primary px-2 py-1 text-sm bg-background"
                        />
                        <button onClick={handleSave} className="p-1 text-emerald-600 hover:bg-emerald-100 rounded">
                          <Save className="h-3 w-3" />
                        </button>
                      </div>
                    ) : order.orderLink ? (
                      <div className="flex items-center gap-1">
                        <a
                          href={order.orderLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-600 dark:text-sky-400 hover:underline text-xs"
                          title="点击打开链接"
                        >
                          打开
                        </a>
                        <button
                          onClick={() => handleCopy(order.orderLink)}
                          className="text-muted-foreground hover:text-foreground text-xs"
                          title="点击复制链接"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleCellClick(order.id, 'orderLink', order.orderLink)}
                          className="text-muted-foreground hover:text-foreground text-xs"
                          title="点击编辑"
                        >
                          ✎
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleCellClick(order.id, 'orderLink', '')}
                        className="text-muted-foreground hover:text-foreground text-xs cursor-pointer"
                        title="点击添加链接"
                      >
                        + 添加
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {renderEditableCell(order, 'actualPayment', 'number')}
                  </td>
                  <td className="px-3 py-2">
                    {renderStatusSelect(order, 'isGoodReview', reviewOptions)}
                  </td>
                  <td className="px-3 py-2">
                    {renderBaseCommissionCell(order)}
                  </td>
                  <td className="px-3 py-2">
                    {renderEditableCell(order, 'reviewCommission', 'number')}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {renderEditableCell(order, 'drawingDate', 'datetime')}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {renderEditableCell(order, 'reviewCommissionDate', 'datetime')}
                  </td>
                  <td className="px-3 py-2">
                    {renderEditableCell(order, 'remark', 'text')}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setDrawerOrderId(order.id)}
                        className="p-1 hover:bg-accent rounded-md"
                        title="查看详情"
                      >
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleDelete(order.id)}
                        className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-md"
                        title="删除订单"
                      >
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </button>
                    </div>
                  </td>
                </tr>
                ))}
                {virtualize && virtualWindow.padBottom > 0 && (
                  <tr aria-hidden="true" style={{ height: virtualWindow.padBottom }} />
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex justify-center items-center gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground tabular-nums">共 {total} 条</span>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="apple-btn rounded-xl border bg-card px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            上一页
          </button>
          <span className="flex items-center px-4 text-sm text-muted-foreground tabular-nums">
            第 {page} 页 / 共 {totalPages} 页
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= totalPages}
            className="apple-btn rounded-xl border bg-card px-4 py-2 text-sm font-medium disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            下一页
          </button>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="apple-btn rounded-xl border bg-card px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {PAGE_SIZE_OPTIONS.map(n => (
              <option key={n} value={n}>{n} 条/页</option>
            ))}
          </select>
        </div>
      )}

      {/* Order Detail Drawer */}
      <OrderDrawer orderId={drawerOrderId} onClose={() => setDrawerOrderId(null)} />
    </div>
  );
}