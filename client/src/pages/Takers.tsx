import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { takersApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Plus, Search, X, Ban } from 'lucide-react';
import ExportDialog from '@/components/ExportDialog';
import ImportDialog from '@/components/ImportDialog';
import ColumnFilter, { filterData } from '@/components/ColumnFilter';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { takerColumns } from '@/lib/export';
import { parseFlexibleDate } from '@/lib/dateInput';
import TakerFormDialog from '@/components/takers/TakerFormDialog';
import TakerRow from '@/components/takers/TakerRow';
import { EMPTY_FORM, toDateInputValue, countToInput, type TakerFormState } from '@/lib/takerForm';

export default function Takers() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingTaker, setEditingTaker] = useState<any>(null);
  /** 「拉黑/风控」弹窗目标接单人（null = 未打开） */
  const [riskTarget, setRiskTarget] = useState<any>(null);
  /** 拉黑/风控原因输入 */
  const [riskReasonInput, setRiskReasonInput] = useState('');
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
    // 预填未完成时禁止提交：此时截图字段还是空值，提交会把已存截图清空
    if (prefilling) return;

    // 注册时间：空 → null；非空则按柔性格式解析，失败给出提示并中止提交
    let registerDate: string | null = null;
    const rawRegisterDate = formData.registerDate.trim();
    if (rawRegisterDate) {
      const parsed = parseFlexibleDate(rawRegisterDate);
      if (!parsed) {
        toastError('注册时间格式不正确，支持 2024-05-01 / 2024/5/1 / 2024年5月1日 等');
        return;
      }
      registerDate = parsed;
    }

    const payload = {
      wechatName: formData.wechatName,
      wechatId: formData.wechatId,
      taobaoNickname: formData.taobaoNickname.trim() || null,
      registerDate,
      isRealNameVerified: formData.isRealNameVerified,
      creditLevel: formData.creditLevel || null,
      weeklyReceiptCount: formData.weeklyReceiptCount === '' ? null : Number(formData.weeklyReceiptCount),
      monthlyReceiptCount: formData.monthlyReceiptCount === '' ? null : Number(formData.monthlyReceiptCount),
      avatarScreenshot: formData.avatarScreenshot,
      securityScreenshot: formData.securityScreenshot,
      reviewScreenshot: formData.reviewScreenshot,
      // 收款信息：空 → null
      payeeName: formData.payeeName.trim() || null,
      payeeAccount: formData.payeeAccount.trim() || null,
      // 风控：riskFlag 是真布尔（false 是合法值），blacklistReason 空 → null
      riskFlag: formData.riskFlag,
      blacklistReason: formData.blacklistReason.trim() || null,
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
        taobaoNickname: full.taobaoNickname ?? '',
        registerDate: toDateInputValue(full.registerDate),
        isRealNameVerified: !!full.isRealNameVerified,
        creditLevel: full.creditLevel ?? '',
        weeklyReceiptCount: countToInput(full.weeklyReceiptCount),
        monthlyReceiptCount: countToInput(full.monthlyReceiptCount),
        avatarScreenshot: full.avatarScreenshot ?? null,
        securityScreenshot: full.securityScreenshot ?? null,
        reviewScreenshot: full.reviewScreenshot ?? null,
        payeeName: full.payeeName ?? '',
        payeeAccount: full.payeeAccount ?? '',
        riskFlag: !!full.riskFlag,
        blacklistReason: full.blacklistReason ?? '',
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

  /** 打开「拉黑/风控」弹窗（预填已有原因） */
  const openRiskModal = (taker: any) => {
    setRiskTarget(taker);
    setRiskReasonInput(taker.blacklistReason ?? '');
  };

  const closeRiskModal = () => {
    setRiskTarget(null);
    setRiskReasonInput('');
  };

  /** 提交拉黑：status='suspended' + riskFlag=true + blacklistReason（硬拦截快速接单） */
  const submitBlacklist = () => {
    if (!riskTarget) return;
    updateMutation.mutate({
      id: riskTarget.id,
      data: {
        wechatName: riskTarget.wechatName,
        wechatId: riskTarget.wechatId,
        status: 'suspended',
        riskFlag: true,
        blacklistReason: riskReasonInput.trim() || null,
      },
    });
    closeRiskModal();
  };

  /** 解除风控/拉黑：status='active' + riskFlag=false + blacklistReason=null */
  const releaseRisk = async (taker: any) => {
    if (!(await confirm({ message: `确定解除「${taker.wechatName}」的风控/拉黑吗？`, confirmText: '解除' }))) return;
    updateMutation.mutate({
      id: taker.id,
      data: {
        wechatName: taker.wechatName,
        wechatId: taker.wechatId,
        status: 'active',
        riskFlag: false,
        blacklistReason: null,
      },
    });
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
              { key: 'taobaoNickname', label: '淘宝昵称', required: false },
              { key: 'registerDate', label: '注册时间' },
              { key: 'isRealNameVerified', label: '实名认证' },
              { key: 'creditLevel', label: '信誉等级' },
              { key: 'weeklyReceiptCount', label: '每周收货次数' },
              { key: 'monthlyReceiptCount', label: '每月收货次数' },
              { key: 'payeeName', label: '收款人姓名' },
              { key: 'payeeAccount', label: '收款账号' },
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
        <TakerFormDialog
          editingTaker={editingTaker}
          formData={formData}
          setFormData={setFormData}
          prefilling={prefilling}
          onSubmit={handleSubmit}
          onClose={closeForm}
        />
      )}

      {/* 拉黑 / 风控 Modal */}
      {riskTarget && (
        <div
          className="modal-overlay"
          onClick={closeRiskModal}
          onKeyDown={(e) => e.key === 'Escape' && closeRiskModal()}
          tabIndex={-1}
        >
          <div className="modal-content modal-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center shadow-sm">
                  <Ban className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">拉黑 / 风控</h3>
                  <p className="text-xs text-muted-foreground">
                    将「{riskTarget.wechatName}」标记为风控并拉黑，之后无法快速接单
                  </p>
                </div>
              </div>
              <button
                onClick={closeRiskModal}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all duration-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">黑名单 / 风控原因</label>
                <textarea
                  value={riskReasonInput}
                  onChange={(e) => setRiskReasonInput(e.target.value)}
                  className="apple-input min-h-[80px]"
                  placeholder="如：多次恶意退款 / 虚假好评 / 失联"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  原因非必填，但建议填写以便追溯；解除风控会同时清空此原因与风控标记。
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={closeRiskModal}
                className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitBlacklist}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-white text-sm font-medium shadow-lg shadow-rose-500/25 hover:from-amber-600 hover:to-rose-600 transition-all duration-200"
              >
                确认拉黑
              </button>
            </div>
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
                <div>淘宝昵称</div>
                <ColumnFilter value={columnFilters['taobaoNickname'] || ''} onChange={(v) => setColFilter('taobaoNickname', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>收款人</div>
                <ColumnFilter value={columnFilters['payeeName'] || ''} onChange={(v) => setColFilter('payeeName', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>状态</div>
                <ColumnFilter type="select" value={columnFilters['status'] || ''} onChange={(v) => setColFilter('status', v)} options={[{ value: 'active', label: '活跃' }, { value: 'inactive', label: '停用' }, { value: 'suspended', label: '已拉黑' }]} />
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
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : filteredTakers.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  暂无匹配数据
                </td>
              </tr>
            ) : (
              filteredTakers.map((taker: any) => (
                <TakerRow
                  key={taker.id}
                  taker={taker}
                  onEdit={handleEdit}
                  onOpenRisk={openRiskModal}
                  onReleaseRisk={releaseRisk}
                  onDelete={handleDelete}
                />
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
