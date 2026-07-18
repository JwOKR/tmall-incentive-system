import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { takersApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Plus, Pencil, Trash2, Search, Eye, X, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import ExportDialog from '@/components/ExportDialog';
import ImportDialog from '@/components/ImportDialog';
import ColumnFilter, { filterData } from '@/components/ColumnFilter';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { takerColumns } from '@/lib/export';
import { usePermissions, NoPermission } from '@/lib/permissions';

export default function Takers() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const { canView, canEdit } = usePermissions();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingTaker, setEditingTaker] = useState<any>(null);
  const formModalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showForm && formModalRef.current) formModalRef.current.focus();
  }, [showForm]);
  const [formData, setFormData] = useState({
    wechatName: '',
    wechatId: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['takers', page, debouncedSearch],
    queryFn: () => takersApi.getAll({ page, pageSize: 20, search: debouncedSearch }),
  });

  const createMutation = useMutation({
    mutationFn: takersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['takers'] });
      setShowForm(false);
      setFormData({ wechatName: '', wechatId: '' });
      toastSuccess('创建成功');
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message || '创建接单人失败');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => takersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['takers'] });
      setShowForm(false);
      setEditingTaker(null);
      setFormData({ wechatName: '', wechatId: '' });
      toastSuccess('更新成功');
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message || '更新接单人失败');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: takersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['takers'] });
      toastSuccess('删除成功');
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message || '删除接单人失败');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTaker) {
      updateMutation.mutate({ id: editingTaker.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (taker: any) => {
    setEditingTaker(taker);
    setFormData({
      wechatName: taker.wechatName,
      wechatId: taker.wechatId,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (await confirm({ message: '确定要删除这个接单人吗？', variant: 'danger', confirmText: '删除' })) {
      deleteMutation.mutate(id);
    }
  };

  const takers = (data as any)?.data?.list || [];
  const total = (data as any)?.data?.total || 0;

  const filteredTakers = useMemo(() => {
    return filterData(takers, columnFilters, (item: any, key: string) => {
      if (key === 'createdAt') return item.createdAt ? formatDate(item.createdAt) : '';
      if (key === 'totalAmount') return item.totalAmount ? formatCurrency(item.totalAmount) : '';
      return String(item[key] ?? '');
    });
  }, [takers, columnFilters]);

  const setColFilter = (key: string, value: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  };

  if (!canView('takers')) return <NoPermission module="takers" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight apple-text-title-1">接单人管理</h2>
          <p className="text-muted-foreground mt-1">管理所有接单人信息</p>
        </div>
        <div className="flex gap-2">
          <ExportDialog
            title="导出接单人数据"
            filename="接单人数据"
            columns={takerColumns}
            data={takers}
            buttonLabel="导出"
            fetchData={async () => {
              const res: any = await takersApi.getAll({ pageSize: 99999, search });
              return res?.data?.list || [];
            }}
          />
          <ImportDialog
            title="导入接单人数据"
            templateFilename="接单人导入模板"
            columns={[
              { key: 'wechatName', label: '微信昵称', required: true },
              { key: 'wechatId', label: '微信号', required: true },
            ]}
            onImport={async (data) => {
              try {
                const result = await takersApi.batchCreate(data);
                queryClient.invalidateQueries({ queryKey: ['takers'] });
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
            onClick={() => {
              setEditingTaker(null);
              setFormData({ wechatName: '', wechatId: '' });
              setShowForm(true);
            }}
            className="apple-btn inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 transition-colors shadow-sm shadow-indigo-500/20"
          >
            <Plus className="h-4 w-4" />
            添加接单人
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索接单人..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="apple-input rounded-lg pl-10"
          />
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div
          className="modal-overlay"
          onClick={() => { setShowForm(false); setEditingTaker(null); }}
          onKeyDown={(e) => e.key === 'Escape' && (setShowForm(false), setEditingTaker(null))}
          tabIndex={-1}
          ref={formModalRef}
        >
          <div
            className="modal-content modal-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">
                    {editingTaker ? '编辑接单人' : '添加接单人'}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {editingTaker ? '修改接单人信息' : '添加新的接单人到系统'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowForm(false); setEditingTaker(null); }}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all duration-200 hover:scale-105 active:scale-95"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  微信昵称
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.wechatName}
                  onChange={(e) => setFormData({ ...formData, wechatName: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                  placeholder="请输入微信昵称"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2">
                  <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                  微信号
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.wechatId}
                  onChange={(e) => setFormData({ ...formData, wechatId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                  placeholder="请输入微信号"
                />
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingTaker(null); }}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-medium shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:from-indigo-600 hover:to-violet-700 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {editingTaker ? '更新信息' : '添加接单人'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl apple-card">
        <table className="w-full">
          <thead>
            <tr className="table-header">
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>微信昵称</div>
                <ColumnFilter value={columnFilters['wechatName'] || ''} onChange={(v) => setColFilter('wechatName', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>微信号</div>
                <ColumnFilter value={columnFilters['wechatId'] || ''} onChange={(v) => setColFilter('wechatId', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>状态</div>
                <ColumnFilter type="select" value={columnFilters['status'] || ''} onChange={(v) => setColFilter('status', v)} options={[{ value: 'active', label: '活跃' }, { value: 'inactive', label: '停用' }]} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>总订单</div>
                <ColumnFilter value={columnFilters['totalOrders'] || ''} onChange={(v) => setColFilter('totalOrders', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>总金额</div>
                <ColumnFilter value={columnFilters['totalAmount'] || ''} onChange={(v) => setColFilter('totalAmount', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>创建时间</div>
                <ColumnFilter value={columnFilters['createdAt'] || ''} onChange={(v) => setColFilter('createdAt', v)} />
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium"><div>操作</div></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : filteredTakers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  暂无匹配数据
                </td>
              </tr>
            ) : (
              filteredTakers.map((taker: any) => (
                <tr key={taker.id} className="table-row-hover table-row-zebra">
                  <td className="px-4 py-3 text-sm font-medium">
                    <Link to={`/takers/${taker.id}`} className="hover:text-indigo-500 hover:underline transition-colors">
                      {taker.wechatName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{taker.wechatId}</td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        taker.status === 'active'
                          ? 'badge-success'
                          : 'badge-neutral'
                      }`}
                    >
                      {taker.status === 'active' ? '活跃' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums">{taker.totalOrders}</td>
                  <td className="px-4 py-3 text-sm tabular-nums">{formatCurrency(taker.totalAmount)}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">
                    {formatDate(taker.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/takers/${taker.id}`}
                      className="p-1 hover:bg-accent rounded-lg inline-block"
                      title="查看详情"
                    >
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </Link>
                    <button
                      onClick={() => handleEdit(taker)}
                      className="p-1 hover:bg-accent rounded-lg"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(taker.id)}
                      className="p-1 hover:bg-rose-500/10 rounded-lg ml-1"
                    >
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </button>
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
            className="rounded-xl border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-accent transition-colors"
          >
            上一页
          </button>
          <span className="flex items-center px-3 text-sm tabular-nums">
            第 {page} 页 / 共 {Math.ceil(total / 20)} 页
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(total / 20)}
            className="rounded-xl border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-accent transition-colors"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
