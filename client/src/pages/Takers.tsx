import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { takersApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import ExportDialog from '@/components/ExportDialog';
import ImportDialog from '@/components/ImportDialog';
import ColumnFilter, { filterData } from '@/components/ColumnFilter';
import { takerColumns } from '@/lib/export';

export default function Takers() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingTaker, setEditingTaker] = useState<any>(null);
  const [formData, setFormData] = useState({
    wechatName: '',
    wechatId: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['takers', page, search],
    queryFn: () => takersApi.getAll({ page, pageSize: 10, search }),
  });

  const createMutation = useMutation({
    mutationFn: takersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['takers'] });
      setShowForm(false);
      setFormData({ wechatName: '', wechatId: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => takersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['takers'] });
      setShowForm(false);
      setEditingTaker(null);
      setFormData({ wechatName: '', wechatId: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: takersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['takers'] });
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

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这个接单人吗？')) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">接单人管理</h2>
          <p className="text-muted-foreground">管理所有接单人信息</p>
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
                alert(errorMessage);
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
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
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
            className="w-full rounded-md border border-input bg-background pl-10 pr-4 py-2 text-sm"
          />
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl border border-border/50">
            <h3 className="text-lg font-semibold mb-4">
              {editingTaker ? '编辑接单人' : '添加接单人'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">微信昵称 *</label>
                <input
                  type="text"
                  required
                  value={formData.wechatName}
                  onChange={(e) => setFormData({ ...formData, wechatName: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="请输入微信昵称"
                />
              </div>
              <div>
                <label className="text-sm font-medium">微信号 *</label>
                <input
                  type="text"
                  required
                  value={formData.wechatId}
                  onChange={(e) => setFormData({ ...formData, wechatId: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="请输入微信号"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingTaker(null);
                  }}
                  className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                >
                  {editingTaker ? '更新' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-card shadow-sm">
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
                  <td className="px-4 py-3 text-sm font-medium">{taker.wechatName}</td>
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
                  <td className="px-4 py-3 text-sm">{taker.totalOrders}</td>
                  <td className="px-4 py-3 text-sm">{formatCurrency(taker.totalAmount)}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatDate(taker.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleEdit(taker)}
                      className="p-1 hover:bg-accent rounded-md"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(taker.id)}
                      className="p-1 hover:bg-accent rounded-md ml-1"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 10 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
          >
            上一页
          </button>
          <span className="flex items-center px-3 text-sm">
            第 {page} 页 / 共 {Math.ceil(total / 10)} 页
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(total / 10)}
            className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}