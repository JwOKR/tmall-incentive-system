import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { repeatDiscountApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Plus, Pencil, Trash2, TrendingDown, DollarSign, Users, Package, Calendar, Loader2, Save, X } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';

interface FormData {
  recordDate: string;
  grantAmount: string;
  paymentAmount: string;
  paymentBuyers: string;
  paymentItems: string;
}

const emptyForm: FormData = {
  recordDate: '',
  grantAmount: '',
  paymentAmount: '',
  paymentBuyers: '',
  paymentItems: '',
};

export default function RepeatDiscounts() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const { confirm } = useConfirm();

  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);

  // 列表数据
  const { data, isLoading } = useQuery({
    queryKey: ['repeatDiscounts', page, startDate, endDate],
    queryFn: () => repeatDiscountApi.getAll({ page, pageSize: 20, startDate: startDate || undefined, endDate: endDate || undefined }),
  });

  // 汇总数据
  const { data: summaryData } = useQuery({
    queryKey: ['repeatDiscountSummary', startDate, endDate],
    queryFn: () => repeatDiscountApi.getSummary({ startDate: startDate || undefined, endDate: endDate || undefined }),
  });

  // 新增
  const createMutation = useMutation({
    mutationFn: repeatDiscountApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repeatDiscounts'] });
      queryClient.invalidateQueries({ queryKey: ['repeatDiscountSummary'] });
      toastSuccess('创建成功');
      resetForm();
    },
    onError: (error: any) => toastError(error?.response?.data?.message || '创建失败'),
  });

  // 编辑
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => repeatDiscountApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repeatDiscounts'] });
      queryClient.invalidateQueries({ queryKey: ['repeatDiscountSummary'] });
      toastSuccess('更新成功');
      resetForm();
    },
    onError: (error: any) => toastError(error?.response?.data?.message || '更新失败'),
  });

  // 删除
  const deleteMutation = useMutation({
    mutationFn: repeatDiscountApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repeatDiscounts'] });
      queryClient.invalidateQueries({ queryKey: ['repeatDiscountSummary'] });
      toastSuccess('删除成功');
    },
    onError: (error: any) => toastError(error?.response?.data?.message || '删除失败'),
  });

  const resetForm = () => {
    setForm(emptyForm);
    setShowForm(false);
    setEditingId(null);
  };

  const handleSubmit = () => {
    if (!form.recordDate) return toastError('请选择日期');

    const payload = {
      recordDate: form.recordDate,
      grantAmount: parseFloat(form.grantAmount) || 0,
      paymentAmount: parseFloat(form.paymentAmount) || 0,
      paymentBuyers: parseInt(form.paymentBuyers) || 0,
      paymentItems: parseInt(form.paymentItems) || 0,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setForm({
      recordDate: item.recordDate.split('T')[0],
      grantAmount: String(item.grantAmount),
      paymentAmount: String(item.paymentAmount),
      paymentBuyers: String(item.paymentBuyers),
      paymentItems: String(item.paymentItems),
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string, date: string) => {
    const ok = await confirm({ title: '确认删除', message: `确定删除 ${date} 的记录吗？` });
    if (ok) deleteMutation.mutate(id);
  };

  const summary = (summaryData as any)?.data;
  const list = (data as any)?.data?.list || [];
  const total = (data as any)?.data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  const fmt = (v: number) => v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">回头客立减</h2>
          <p className="text-muted-foreground">每日立减数据录入与统计</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? '关闭' : '新增记录'}
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Calendar className="h-3.5 w-3.5" />
              记录天数
            </div>
            <p className="text-2xl font-bold">{summary.totalDays}</p>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingDown className="h-3.5 w-3.5" />
              发放金额
            </div>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">¥{fmt(summary.totalGrantAmount)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <DollarSign className="h-3.5 w-3.5" />
              支付金额
            </div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">¥{fmt(summary.totalPaymentAmount)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Users className="h-3.5 w-3.5" />
              支付买家数
            </div>
            <p className="text-2xl font-bold">{summary.totalPaymentBuyers.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Package className="h-3.5 w-3.5" />
              支付件数
            </div>
            <p className="text-2xl font-bold">{summary.totalPaymentItems.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="rounded-lg border bg-card p-6 shadow-sm animate-in slide-in-from-top-2 duration-200">
          <h3 className="text-lg font-semibold mb-4">{editingId ? '编辑记录' : '新增记录'}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="text-sm font-medium">日期 *</label>
              <input
                type="date"
                value={form.recordDate}
                onChange={(e) => setForm(f => ({ ...f, recordDate: e.target.value }))}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">发放金额（元）</label>
              <input
                type="number"
                step="0.01"
                value={form.grantAmount}
                onChange={(e) => setForm(f => ({ ...f, grantAmount: e.target.value }))}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium">支付金额（元）</label>
              <input
                type="number"
                step="0.01"
                value={form.paymentAmount}
                onChange={(e) => setForm(f => ({ ...f, paymentAmount: e.target.value }))}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium">支付买家数（人）</label>
              <input
                type="number"
                value={form.paymentBuyers}
                onChange={(e) => setForm(f => ({ ...f, paymentBuyers: e.target.value }))}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-sm font-medium">支付件数（件）</label>
              <input
                type="number"
                value={form.paymentItems}
                onChange={(e) => setForm(f => ({ ...f, paymentItems: e.target.value }))}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {(createMutation.isPending || updateMutation.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {editingId ? '保存修改' : '创建'}
            </button>
            <button onClick={resetForm} className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">
              取消
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">起始日期</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">结束日期</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        {(startDate || endDate) && (
          <button
            onClick={() => { setStartDate(''); setEndDate(''); setPage(1); }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            清除筛选
          </button>
        )}
        <span className="text-sm text-muted-foreground ml-auto">共 {total} 条</span>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">日期</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">发放金额</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">支付金额</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">支付买家数</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">支付件数</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    加载中...
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">
                    暂无数据
                  </td>
                </tr>
              ) : (
                list.map((item: any) => (
                  <tr key={item.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {formatDate(item.recordDate)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-orange-600 dark:text-orange-400 font-medium">
                      ¥{fmt(item.grantAmount)}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400 font-medium">
                      ¥{fmt(item.paymentAmount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.paymentBuyers.toLocaleString()} 人
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.paymentItems.toLocaleString()} 件
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          title="编辑"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id, formatDate(item.recordDate))}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
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
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-md border text-sm disabled:opacity-50 hover:bg-accent"
            >
              上一页
            </button>
            <span className="text-sm text-muted-foreground">
              第 {page} / {totalPages} 页
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-md border text-sm disabled:opacity-50 hover:bg-accent"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
