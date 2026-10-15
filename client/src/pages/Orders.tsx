import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { ordersApi } from '@/lib/api';
import { formatCurrency, formatDate, calcDisplayTotalRefund } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Save, CheckSquare, Square, CheckCircle, Circle, Undo2 } from 'lucide-react';
import ExportDialog from '@/components/ExportDialog';
import ImportDialog from '@/components/ImportDialog';
import OrderDrawer from '@/components/OrderDrawer';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { orderColumns } from '@/lib/export';
import { usePermissions } from '@/lib/permissions';
import { computeVirtualWindow } from '@/lib/virtualList';
import { PAGE_SIZE_OPTIONS, PAGE_SIZE_STORAGE_KEY, VIRTUALIZE_THRESHOLD, VIRTUAL_ROW_HEIGHT, VIRTUAL_OVERSCAN } from '@/lib/orderListConfig';
import type { EditingCell } from '@/lib/orderListConfig';
import { useOrdersKeyboardNav } from '@/hooks/useOrdersKeyboardNav';
import OrderCard from '@/components/orders/OrderCard';
import OrderRow from '@/components/orders/OrderRow';
import OrdersTableHead from '@/components/orders/OrdersTableHead';
import OrdersStatsBar from '@/components/orders/OrdersStatsBar';
import OrdersBatchBar from '@/components/orders/OrdersBatchBar';
import OrdersFilters from '@/components/orders/OrdersFilters';
import OrdersPagination from '@/components/orders/OrdersPagination';

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

  // 下发给 OrderCard / OrderRow 的共享 props（均为页面内既有函数，仅做打包）
  const statusOptions = { refundOptions, reviewOptions };
  const rowActions = {
    onSelectOne: handleSelectOne,
    onOpenDrawer: setDrawerOrderId,
    onDelete: handleDelete,
    onCopy: handleCopy,
    onCellClick: handleCellClick,
  };
  const rowCells = {
    renderEditableCell,
    renderReadOnlyCell,
    renderStatusSelect,
    renderBaseCommissionCell,
  };

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
  // commitAndMove / copyFromRowAbove / handleKeyDown 已原样提取至 @/hooks/useOrdersKeyboardNav
  const { handleKeyDown } = useOrdersKeyboardNav({
    editingCell,
    sortedOrders,
    handleSave,
    handleCancel,
    buildEditValue,
    setEditingCell,
    setEditValue,
  });

  // 行内编辑态打包后下发给 OrderRow（订单链接列在行内直接消费 editingCell / editValue）
  const rowEditing = {
    isEditing,
    value: editValue,
    onChange: setEditValue,
    onSave: handleSave,
    onKeyDown: handleKeyDown,
    inputRef,
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
      <OrdersFilters
        search={search}
        onSearchChange={setSearch}
        refundFilter={refundFilter}
        onRefundFilterChange={setRefundFilter}
        reviewFilter={reviewFilter}
        onReviewFilterChange={setReviewFilter}
        startDate={startDate}
        onStartDateChange={(v) => { setStartDate(v); setPage(1); }}
        endDate={endDate}
        onEndDateChange={(v) => { setEndDate(v); setPage(1); }}
        applyDatePreset={applyDatePreset}
      />

      {/* Quick Stats Bar */}
      <OrdersStatsBar stats={stats} />

      {/* Batch Actions */}
      {selectedIds.size > 0 && (
        <OrdersBatchBar
          selectedCount={selectedIds.size}
          onBatchStatus={handleBatchStatus}
          batchStatusPending={batchStatusMutation.isPending}
          onBatchDelete={handleBatchDelete}
          batchDeletePending={batchDeleteMutation.isPending}
          onClearSelection={() => setSelectedIds(new Set())}
        />
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
          sortedOrders.map((order: any) => (
            <OrderCard
              key={order.id}
              order={order}
              selected={selectedIds.has(order.id)}
              actions={rowActions}
              cells={rowCells}
              statusOptions={statusOptions}
            />
          ))
        )}
      </div>

      {/* Table (desktop) */}
      <div
        onScroll={virtualize ? handleTableScroll : undefined}
        style={virtualize ? { maxHeight: '70vh', overflowY: 'auto' } : undefined}
        className="hidden md:block rounded-2xl border bg-card shadow-sm overflow-x-auto apple-card"
      >
        <table className="w-full text-sm">
          <OrdersTableHead
            onSelectAll={handleSelectAll}
            selectedCount={selectedIds.size}
            totalCount={sortedOrders.length}
            sortConfig={sortConfig}
            onSort={handleSort}
            columnFilters={columnFilters}
            onColFilter={setColFilter}
            getUniqueValues={getUniqueValues}
          />
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
                  <OrderRow
                    key={order.id}
                    order={order}
                    selected={selectedIds.has(order.id)}
                    virtualize={virtualize}
                    rowHeight={VIRTUAL_ROW_HEIGHT}
                    editing={rowEditing}
                    cells={rowCells}
                    statusOptions={statusOptions}
                    actions={rowActions}
                  />
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
        <OrdersPagination
          total={total}
          page={page}
          setPage={setPage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
        />
      )}

      {/* Order Detail Drawer */}
      <OrderDrawer orderId={drawerOrderId} onClose={() => setDrawerOrderId(null)} />
    </div>
  );
}