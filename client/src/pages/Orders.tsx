import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { ordersApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Search, Copy, Save, Trash2, CheckSquare, Square, CheckCircle, Star, Calendar, Eye } from 'lucide-react';
import ExportDialog from '@/components/ExportDialog';
import ImportDialog from '@/components/ImportDialog';
import ColumnFilter, { filterData } from '@/components/ColumnFilter';
import OrderDrawer from '@/components/OrderDrawer';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { orderColumns } from '@/lib/export';
import { canEdit } from '@/lib/permissions';

interface EditingCell {
  orderId: string;
  field: string;
}

export default function Orders() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const [page, setPage] = useState(1);
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
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page, debouncedSearch, refundFilter, reviewFilter, startDate, endDate],
    queryFn: () => ordersApi.getAll({
      page,
      pageSize: 20,
      search: debouncedSearch,
      isRefunded: refundFilter || undefined,
      isGoodReview: reviewFilter || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
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
      setSelectedIds(new Set());
      toastSuccess(data?.message || '批量更新成功');
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message || '批量更新失败');
    },
  });

  useEffect(() => {
    if (editingCell) {
      if (inputRef.current) inputRef.current.focus();
      if (selectRef.current) selectRef.current.focus();
    }
  }, [editingCell]);

  const handleCellClick = (orderId: string, field: string, currentValue: any) => {
    if (!canEdit('orders')) return; // 检查编辑权限
    if (editingCell?.orderId === orderId && editingCell?.field === field) return;
    
    setEditingCell({ orderId, field });
    
    if (field === 'refundDate' || field === 'reviewCommissionDate') {
      setEditValue(currentValue ? currentValue.split('T')[0] : '');
    } else if (typeof currentValue === 'boolean') {
      setEditValue(currentValue ? 'true' : 'false');
    } else {
      setEditValue(String(currentValue || ''));
    }
  };

  const handleSave = () => {
    if (!editingCell) return;
    
    const { orderId, field } = editingCell;
    let value = editValue;
    
    // 处理布尔字段
    if (['isRefunded'].includes(field)) {
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
    // 如果标记为已好评，自动设置好评返佣日期
    if (field === 'isGoodReview' && value === 'reviewed') {
      updateData.reviewCommissionDate = new Date().toISOString().split('T')[0];
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
    if (field === 'isGoodReview' && value === 'reviewed') {
      updateData.reviewCommissionDate = new Date().toISOString().split('T')[0];
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
    if (selectedIds.size === filteredOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOrders.map((o: any) => o.id)));
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

  const handleBatchStatus = async (field: 'isRefunded' | 'isGoodReview', value: boolean | string) => {
    if (selectedIds.size === 0) {
      toastError('请先选择订单');
      return;
    }
    const label = field === 'isRefunded' ? '返款' : '好评';
    const statusLabel = typeof value === 'string' ? 
      (value === 'reviewed' ? '已好评' : value === 'creating' ? '作图中' : value === 'returned' ? '已返图' : '未好评') : 
      (value ? '已' : '未');
    if (await confirm({ message: `确定要将选中的 ${selectedIds.size} 个订单标记为${statusLabel}${label}吗？`, variant: 'warning' })) {
      batchStatusMutation.mutate({ ids: Array.from(selectedIds), field, value });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
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

  const renderEditableCell = (order: any, field: string, type: 'text' | 'number' | 'date' = 'text') => {
    const editing = isEditing(order.id, field);
    const value = order[field];
    
    if (editing) {
      return (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type={type}
            step={type === 'number' ? '0.01' : undefined}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="w-full rounded border border-primary px-2 py-1 text-sm bg-background"
          />
          <button
            onClick={handleSave}
            className="p-1 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
          >
            <Save className="h-3 w-3" />
          </button>
        </div>
      );
    }
    
    const displayValue = () => {
      if (type === 'number') return value ? formatCurrency(value) : '-';
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
  const renderReadOnlyCell = (value: any, type: 'text' | 'number' | 'date' = 'text') => {
    const displayValue = () => {
      if (type === 'number') return value ? formatCurrency(value) : '-';
      if (type === 'date') return value ? formatDate(value).split(' ')[0] : '-';
      return value || '-';
    };
    
    return (
      <div className="px-2 py-1 rounded min-h-[28px] flex items-center">
        {displayValue()}
      </div>
    );
  };

  // 计算总返款 = 实付款 + 基础返佣 + 好评返佣
  const calculateTotalRefund = (order: any) => {
    return (order.actualPayment || 0) + (order.baseCommission || 0) + (order.reviewCommission || 0);
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

  const orders = (data as any)?.data?.list || [];
  const total = (data as any)?.data?.total || 0;

  const filteredOrders = useMemo(() => {
    return filterData(orders, columnFilters, (item: any, key: string) => {
      if (key === 'wechatName') return item.taker?.wechatName || '';
      if (key === 'wechatId') return item.taker?.wechatId || '';
      return String(item[key] ?? '');
    });
  }, [orders, columnFilters]);

  const setColFilter = (key: string, value: string) => {
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
  const applyDatePreset = (preset: 'today' | 'yesterday' | '7days' | '30days' | 'clear') => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    if (preset === 'clear') {
      setStartDate('');
      setEndDate('');
      return;
    }
    if (preset === 'today') {
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
    }
    setPage(1);
  };

  // 当前筛选结果的快速统计
  const stats = useMemo(() => {
    const refundPending = filteredOrders.filter((o: any) => !o.isRefunded).length;
    const reviewPending = filteredOrders.filter((o: any) => o.isGoodReview === 'pending').length;
    const totalAmount = filteredOrders.reduce((sum: number, o: any) => sum + (o.actualPayment || 0), 0);
    const totalRefund = filteredOrders.reduce((sum: number, o: any) =>
      sum + (o.actualPayment || 0) + (o.baseCommission || 0) + (o.reviewCommission || 0), 0);
    return { refundPending, reviewPending, totalAmount, totalRefund, count: filteredOrders.length };
  }, [filteredOrders]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">接单明细</h2>
          <p className="text-muted-foreground">点击任意单元格直接编辑，按 Enter 保存，Esc 取消</p>
        </div>
        <div className="flex gap-2">
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
                { key: 'reviewCommission', label: '好评返佣' },
                { key: 'isRefunded', label: '是否已返款' },
                { key: 'refundDate', label: '返款日期' },
                { key: 'isGoodReview', label: '是否好评' },
                { key: 'reviewCommissionDate', label: '好评返佣日期' },
                { key: 'remark', label: '备注' },
              ]}
            onImport={async (data) => {
              try {
                const result = await ordersApi.batchCreate(data);
                queryClient.invalidateQueries({ queryKey: ['orders'] });
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                // result 已经是 response.data（axios interceptor 处理后）
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
          )}
          {canEdit('orders') && (
            <ImportDialog
              title="批量修改订单"
              templateFilename="订单批量修改模板"
              mode="update"
              columns={[
                { key: 'orderNo', label: '订单编号', required: true },
                { key: 'orderNo19', label: '19订单号' },
                { key: 'wechatName', label: '微信昵称' },
                { key: 'actualPayment', label: '实付价' },
                { key: 'baseCommission', label: '基础返佣' },
                { key: 'reviewCommission', label: '好评返佣' },
                { key: 'isRefunded', label: '是否已返款' },
                { key: 'refundDate', label: '返款日期' },
                { key: 'isGoodReview', label: '是否好评' },
                { key: 'reviewCommissionDate', label: '好评返佣日期' },
                { key: 'remark', label: '备注' },
            ]}
            onImport={async (data) => {
              try {
                const result = await ordersApi.batchUpdate(data);
                queryClient.invalidateQueries({ queryKey: ['orders'] });
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard'] });
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
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜索订单号、商品ID、微信昵称..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-input bg-background pl-10 pr-4 py-2 text-sm"
            />
          </div>
          <select
            value={refundFilter}
            onChange={(e) => setRefundFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">返款状态</option>
            <option value="true">已返款</option>
            <option value="false">未返款</option>
          </select>
          <select
            value={reviewFilter}
            onChange={(e) => setReviewFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
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
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="开始日期"
            />
            <span className="text-muted-foreground">至</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
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
            { label: '全部', value: 'clear' as const },
          ].map(preset => (
            <button
              key={preset.value}
              onClick={() => applyDatePreset(preset.value)}
              className="rounded-md border border-input bg-background px-3 py-1 text-xs hover:bg-accent transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">当前结果</p>
          <p className="text-lg font-bold mt-0.5">{stats.count}</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">待返款</p>
          <p className="text-lg font-bold mt-0.5 text-yellow-600 dark:text-yellow-400">{stats.refundPending}</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">待好评</p>
          <p className="text-lg font-bold mt-0.5 text-blue-600 dark:text-blue-400">{stats.reviewPending}</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">实付总额</p>
          <p className="text-lg font-bold mt-0.5">{formatCurrency(stats.totalAmount)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">返款总额</p>
          <p className="text-lg font-bold mt-0.5 text-green-600 dark:text-green-400">{formatCurrency(stats.totalRefund)}</p>
        </div>
      </div>

      {/* Batch Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg flex-wrap">
          <span className="text-sm text-muted-foreground">
            已选择 <span className="font-bold text-foreground">{selectedIds.size}</span> 项
          </span>
          <div className="h-4 w-px bg-border" />
          <button
            onClick={() => handleBatchStatus('isRefunded', true)}
            disabled={batchStatusMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <CheckCircle className="h-4 w-4" />
            批量已返款
          </button>
          <button
            onClick={() => handleBatchStatus('isGoodReview', 'reviewed')}
            disabled={batchStatusMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Star className="h-4 w-4" />
            批量已好评
          </button>
          <button
            onClick={handleBatchDelete}
            disabled={batchDeleteMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            {batchDeleteMutation.isPending ? '删除中...' : '批量删除'}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-muted-foreground hover:text-foreground ml-auto"
          >
            取消选择
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="table-header">
              <th className="px-3 py-3 text-left">
                <button
                  onClick={handleSelectAll}
                  className="p-1 hover:bg-accent rounded"
                  title={selectedIds.size === filteredOrders.length ? '取消全选' : '全选'}
                >
                  {selectedIds.size === filteredOrders.length && filteredOrders.length > 0 ? (
                    <CheckSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <div className="whitespace-nowrap">接单日期</div>
                <ColumnFilter value={columnFilters['orderDate'] || ''} onChange={(v) => setColFilter('orderDate', v)} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <div className="whitespace-nowrap">微信昵称</div>
                <ColumnFilter value={columnFilters['wechatName'] || ''} onChange={(v) => setColFilter('wechatName', v)} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <div className="whitespace-nowrap">微信号</div>
                <ColumnFilter value={columnFilters['wechatId'] || ''} onChange={(v) => setColFilter('wechatId', v)} />
              </th>
              <th className="px-3 py-2 text-left font-medium"><div className="whitespace-nowrap">总返款</div></th>
              <th className="px-3 py-2 text-left font-medium">
                <div className="whitespace-nowrap">返款状态</div>
                <ColumnFilter type="select" value={columnFilters['isRefunded'] || ''} onChange={(v) => setColFilter('isRefunded', v)} options={[{ value: 'true', label: '已返款' }, { value: 'false', label: '未返款' }]} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <div className="whitespace-nowrap">返款日期</div>
                <ColumnFilter value={columnFilters['refundDate'] || ''} onChange={(v) => setColFilter('refundDate', v)} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <div className="whitespace-nowrap">商品ID</div>
                <ColumnFilter value={columnFilters['productId'] || ''} onChange={(v) => setColFilter('productId', v)} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <div className="whitespace-nowrap">产品编号</div>
                <ColumnFilter value={columnFilters['productCode'] || ''} onChange={(v) => setColFilter('productCode', v)} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <div className="whitespace-nowrap">19订单号</div>
                <ColumnFilter value={columnFilters['orderNo19'] || ''} onChange={(v) => setColFilter('orderNo19', v)} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <div className="whitespace-nowrap">订单编号</div>
                <ColumnFilter value={columnFilters['orderNo'] || ''} onChange={(v) => setColFilter('orderNo', v)} />
              </th>
              <th className="px-3 py-2 text-left font-medium"><div className="whitespace-nowrap">订单链接</div></th>
              <th className="px-3 py-2 text-left font-medium">
                <div className="whitespace-nowrap">实付</div>
                <ColumnFilter value={columnFilters['actualPayment'] || ''} onChange={(v) => setColFilter('actualPayment', v)} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <div className="whitespace-nowrap">好评状态</div>
                <ColumnFilter type="select" value={columnFilters['isGoodReview'] || ''} onChange={(v) => setColFilter('isGoodReview', v)} options={[{ value: 'pending', label: '未好评' }, { value: 'reviewed', label: '已好评' }, { value: 'creating', label: '作图中' }, { value: 'returned', label: '已返图' }]} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <div className="whitespace-nowrap">基础返佣</div>
                <ColumnFilter value={columnFilters['baseCommission'] || ''} onChange={(v) => setColFilter('baseCommission', v)} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <div className="whitespace-nowrap">好评返佣</div>
                <ColumnFilter value={columnFilters['reviewCommission'] || ''} onChange={(v) => setColFilter('reviewCommission', v)} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <div className="whitespace-nowrap">好评返佣日期</div>
                <ColumnFilter value={columnFilters['reviewCommissionDate'] || ''} onChange={(v) => setColFilter('reviewCommissionDate', v)} />
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <div className="whitespace-nowrap">备注</div>
                <ColumnFilter value={columnFilters['remark'] || ''} onChange={(v) => setColFilter('remark', v)} />
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
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={19} className="px-4 py-8 text-center text-muted-foreground">
                  暂无匹配数据
                </td>
              </tr>
            ) : (
              filteredOrders.map((order: any) => (
                <tr key={order.id} className={`table-row-hover table-row-zebra ${selectedIds.has(order.id) ? 'table-row-selected' : ''}`}>
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
                    {order.taker?.wechatId}
                  </td>
                  <td className="px-3 py-2 text-green-600 dark:text-green-400 font-medium">
                    <div title={`实付 ${formatCurrency(order.actualPayment)} + 基础返佣 ${formatCurrency(order.baseCommission)} + 好评返佣 ${formatCurrency(order.reviewCommission)}`}>
                      {renderReadOnlyCell(calculateTotalRefund(order), 'number')}
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
                      <p className="text-xs text-muted-foreground">{order.productId}</p>
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
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-xs"
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
                        <button onClick={handleSave} className="p-1 text-green-600 hover:bg-green-100 rounded">
                          <Save className="h-3 w-3" />
                        </button>
                      </div>
                    ) : order.orderLink ? (
                      <div className="flex items-center gap-1">
                        <a
                          href={order.orderLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
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
                    {renderEditableCell(order, 'baseCommission', 'number')}
                  </td>
                  <td className="px-3 py-2">
                    {renderEditableCell(order, 'reviewCommission', 'number')}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {renderEditableCell(order, 'reviewCommissionDate', 'date')}
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
                        className="p-1 hover:bg-destructive/10 rounded-md"
                        title="删除订单"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
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
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
          >
            上一页
          </button>
          <span className="flex items-center px-3 text-sm">
            第 {page} 页 / 共 {Math.ceil(total / 20)} 页
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(total / 20)}
            className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}

      {/* Order Detail Drawer */}
      <OrderDrawer orderId={drawerOrderId} onClose={() => setDrawerOrderId(null)} />
    </div>
  );
}