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
import ImageUpload from '@/components/ImageUpload';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { takerColumns } from '@/lib/export';
import { CREDIT_LEVELS, COMPLIANCE_META, type ComplianceStatus } from '@/lib/takerConstants';
import { usePermissions, NoPermission } from '@/lib/permissions';

/** 接单人表单状态 */
interface TakerFormState {
  wechatName: string;
  wechatId: string;
  registerDate: string;
  /** 实名认证是硬性门槛：必须显式确认为「是」，未确认视为不通过 */
  isRealNameVerified: boolean;
  creditLevel: string;
  weeklyReceiptCount: string;
  monthlyReceiptCount: string;
  avatarScreenshot: string | null;
  securityScreenshot: string | null;
  reviewScreenshot: string | null;
}

/** 空表单初始值（新增 / 成功重置 / 关闭重置复用） */
const EMPTY_FORM: TakerFormState = {
  wechatName: '',
  wechatId: '',
  registerDate: '',
  isRealNameVerified: false,
  creditLevel: '',
  weeklyReceiptCount: '',
  monthlyReceiptCount: '',
  avatarScreenshot: null,
  securityScreenshot: null,
  reviewScreenshot: null,
};

/** 将日期值截断为本地 'YYYY-MM-DD'（避免 toISOString 造成时区偏移） */
function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 将可选数值字段转为表单字符串 */
function countToInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

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
  const [formData, setFormData] = useState<TakerFormState>({ ...EMPTY_FORM });
  const [prefilling, setPrefilling] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['takers', page, debouncedSearch],
    queryFn: () => takersApi.getAll({ page, pageSize: 20, search: debouncedSearch }),
  });

  const createMutation = useMutation({
    mutationFn: takersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['takers'] });
      setShowForm(false);
      setFormData({ ...EMPTY_FORM });
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
      setFormData({ ...EMPTY_FORM });
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
    const payload = {
      wechatName: formData.wechatName,
      wechatId: formData.wechatId,
      registerDate: formData.registerDate || null,
      isRealNameVerified: formData.isRealNameVerified,
      creditLevel: formData.creditLevel || null,
      weeklyReceiptCount: formData.weeklyReceiptCount === '' ? null : Number(formData.weeklyReceiptCount),
      monthlyReceiptCount: formData.monthlyReceiptCount === '' ? null : Number(formData.monthlyReceiptCount),
      avatarScreenshot: formData.avatarScreenshot,
      securityScreenshot: formData.securityScreenshot,
      reviewScreenshot: formData.reviewScreenshot,
    };
    if (editingTaker) {
      updateMutation.mutate({ id: editingTaker.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // 列表数据不含截图，需先取完整记录再填表
  const handleEdit = async (taker: any) => {
    setEditingTaker(taker);
    setPrefilling(true);
    setFormData({ ...EMPTY_FORM, wechatName: taker.wechatName ?? '', wechatId: taker.wechatId ?? '' });
    setShowForm(true);
    try {
      const res: any = await takersApi.getById(taker.id);
      const full = res?.data ?? res;
      if (!full) return;
      setFormData({
        wechatName: full.wechatName ?? '',
        wechatId: full.wechatId ?? '',
        registerDate: toDateInputValue(full.registerDate),
        isRealNameVerified: !!full.isRealNameVerified,
        creditLevel: full.creditLevel ?? '',
        weeklyReceiptCount: countToInput(full.weeklyReceiptCount),
        monthlyReceiptCount: countToInput(full.monthlyReceiptCount),
        avatarScreenshot: full.avatarScreenshot ?? null,
        securityScreenshot: full.securityScreenshot ?? null,
        reviewScreenshot: full.reviewScreenshot ?? null,
      });
    } catch (e) {
      toastError('获取接单人资质信息失败');
      // 拿不到完整资质就不该让用户在空表单上提交（否则会把已存截图清空）
      setShowForm(false);
    } finally {
      setPrefilling(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (await confirm({ message: '确定要删除这个接单人吗？', variant: 'danger', confirmText: '删除' })) {
      deleteMutation.mutate(id);
    }
  };

  const openCreate = () => {
    setEditingTaker(null);
    setFormData({ ...EMPTY_FORM });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingTaker(null);
    setPrefilling(false);
  };

  const takers = (data as any)?.data?.list || [];
  const total = (data as any)?.data?.total || 0;

  const filteredTakers = useMemo(() => {
    return filterData(
      takers,
      columnFilters,
      (item: any, key: string) => {
        if (key === 'createdAt') return item.createdAt ? formatDate(item.createdAt) : '';
        if (key === 'totalAmount') return item.totalAmount ? formatCurrency(item.totalAmount) : '';
        if (key === 'compliance') return item.compliance?.status || 'incomplete';
        return String(item[key] ?? '');
      },
      ['compliance', 'status']
    );
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
              { key: 'registerDate', label: '注册时间' },
              { key: 'isRealNameVerified', label: '实名认证' },
              { key: 'creditLevel', label: '信誉等级' },
              { key: 'weeklyReceiptCount', label: '每周收货次数' },
              { key: 'monthlyReceiptCount', label: '每月收货次数' },
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
            onClick={openCreate}
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
          onClick={closeForm}
          onKeyDown={(e) => e.key === 'Escape' && closeForm()}
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
                    {editingTaker ? '修改接单人信息与账号资质' : '添加新的接单人到系统'}
                  </p>
                </div>
              </div>
              <button
                onClick={closeForm}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all duration-200 hover:scale-105 active:scale-95"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
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
                    onChange={(e) => setFormData((prev) => ({ ...prev, wechatName: e.target.value }))}
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
                    onChange={(e) => setFormData((prev) => ({ ...prev, wechatId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                    placeholder="请输入微信号"
                  />
                </div>

                {/* 账号资质登记 */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
                  <h4 className="mb-1 text-sm font-semibold">账号资质登记</h4>
                  <p className="mb-4 text-xs text-muted-foreground">
                    接单要求：注册满一年并完成实名认证、信誉等级 3❤️ 以上、每周收货 ≤5 单、每月收货 ≤20 单
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium">注册时间</label>
                      <input
                        type="date"
                        value={formData.registerDate}
                        onChange={(e) => setFormData((prev) => ({ ...prev, registerDate: e.target.value }))}
                        className="apple-input"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium">实名认证</label>
                      <select
                        value={formData.isRealNameVerified ? 'true' : 'false'}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            isRealNameVerified: e.target.value === 'true',
                          }))
                        }
                        className="apple-input"
                      >
                        <option value="true">是</option>
                        <option value="false">否</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium">信誉等级</label>
                    <select
                      value={formData.creditLevel}
                      onChange={(e) => setFormData((prev) => ({ ...prev, creditLevel: e.target.value }))}
                      className="apple-input"
                    >
                      <option value="">未登记</option>
                      {CREDIT_LEVELS.map((level) => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium">每周收货次数</label>
                      <input
                        type="number"
                        min={0}
                        value={formData.weeklyReceiptCount}
                        onChange={(e) => setFormData((prev) => ({ ...prev, weeklyReceiptCount: e.target.value }))}
                        className="apple-input tabular-nums"
                        placeholder="≤ 5"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium">每月收货次数</label>
                      <input
                        type="number"
                        min={0}
                        value={formData.monthlyReceiptCount}
                        onChange={(e) => setFormData((prev) => ({ ...prev, monthlyReceiptCount: e.target.value }))}
                        className="apple-input tabular-nums"
                        placeholder="≤ 20"
                      />
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    <ImageUpload
                      label="头像截图"
                      hint="我的淘宝 → 点击左上角头像 → 截图"
                      value={formData.avatarScreenshot}
                      onChange={(v) => setFormData((prev) => ({ ...prev, avatarScreenshot: v }))}
                    />
                    <ImageUpload
                      label="账号与安全截图"
                      hint="我的淘宝 → 右上角设置 → 账号与安全 → 截图"
                      value={formData.securityScreenshot}
                      onChange={(v) => setFormData((prev) => ({ ...prev, securityScreenshot: v }))}
                    />
                    <ImageUpload
                      label="待评价截图"
                      hint="我的淘宝 → 待评价 → 截图"
                      value={formData.reviewScreenshot}
                      onChange={(v) => setFormData((prev) => ({ ...prev, reviewScreenshot: v }))}
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={prefilling}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-medium shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:from-indigo-600 hover:to-violet-700 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {prefilling ? '加载中...' : editingTaker ? '更新信息' : '添加接单人'}
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
                <div>账号资质</div>
                <ColumnFilter type="select" value={columnFilters['compliance'] || ''} onChange={(v) => setColFilter('compliance', v)} options={[{ value: 'qualified', label: '合格' }, { value: 'unqualified', label: '不合格' }, { value: 'incomplete', label: '待完善' }]} />
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
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : filteredTakers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  暂无匹配数据
                </td>
              </tr>
            ) : (
              filteredTakers.map((taker: any) => {
                const status = (taker.compliance?.status as ComplianceStatus) || 'incomplete';
                const meta = COMPLIANCE_META[status];
                const fails: string[] = taker.compliance?.fails || [];
                return (
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
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${meta.className}`}
                          title={status === 'unqualified' && fails.length > 0 ? fails.join('、') : undefined}
                        >
                          {meta.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          截图 {taker.screenshotCount ?? 0}/3
                        </span>
                      </div>
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
                );
              })
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
