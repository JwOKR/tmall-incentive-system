import { useState, useRef, useEffect } from 'react';
import { Users, X, Calendar, Wallet, AlertTriangle } from 'lucide-react';
import ImageUpload from '@/components/ImageUpload';
import { useToast } from '@/components/Toast';
import { CREDIT_LEVELS } from '@/lib/takerConstants';
import { PASTE_SLOTS, type PasteSlot, type TakerFormState } from '@/lib/takerForm';
import { processImageFile } from '@/lib/imageCompress';
import { parseFlexibleDateDetail } from '@/lib/dateInput';

interface TakerFormDialogProps {
  /** 编辑中的接单人；null = 新增 */
  editingTaker: any;
  formData: TakerFormState;
  setFormData: React.Dispatch<React.SetStateAction<TakerFormState>>;
  /** 编辑时正在回填完整资质，此时禁止提交 */
  prefilling: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

/**
 * 接单人「新增 / 编辑」弹窗。
 *
 * 仅负责表单展示与录入交互；提交、mutation、关闭后的状态清理均由父组件持有，
 * 通过 props 传入。本组件只在 showForm 为真时挂载，因此内部的全局 paste 监听
 * 与自动聚焦无需再带 showForm 条件。
 */
export default function TakerFormDialog({
  editingTaker,
  formData,
  setFormData,
  prefilling,
  onSubmit,
  onClose,
}: TakerFormDialogProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const formModalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (formModalRef.current) formModalRef.current.focus();
  }, []);
  /** 注册时间「日缺省按 1 日」提示是否显示 */
  const [registerDateAssumed, setRegisterDateAssumed] = useState(false);
  /** 隐藏的 type=date 输入，供日历图标联动唤起原生日历 */
  const dateInputRef = useRef<HTMLInputElement>(null);
  /** formData 最新镜像：供全局 paste 监听（仅注册一次）读取当前空槽 */
  const formDataRef = useRef(formData);
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);
  /** 防连续粘贴导致的并发压缩 */
  const pastingRef = useRef(false);

  // 表单打开时监听全局 paste：剪贴板含图片则填入第一个空截图槽；无图片则放行（不影响文本粘贴）
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      let file: File | null = null;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          file = item.getAsFile();
          break;
        }
      }
      if (!file) return; // 剪贴板无图片 → 交由默认行为（文本粘贴不受影响）
      const imageFile: File = file;

      // 仅在确有图片时阻止默认，避免影响输入框文本粘贴
      e.preventDefault();
      if (pastingRef.current) return;

      const current = formDataRef.current;
      const slot: PasteSlot | undefined = PASTE_SLOTS.find((s) => !current[s]);
      if (!slot) {
        toastError('三张截图已满，请先删除后再粘贴');
        return;
      }

      pastingRef.current = true;
      try {
        const dataUrl = await processImageFile(imageFile);
        // 函数式更新：压缩 await 期间用户可能已触发新的表单编辑（如继续输入昵称），
        // 基于 React 传入的 prev 合并，避免「快照重建 + 整体替换」把用户刚敲的字符回退掉。
        // updater 为纯计算（仅依赖 prev，不读外部可变状态做分支），StrictMode 双调用幂等；
        // ref 同步回写保留，供全局 paste 监听「同步读取当前空槽」保持一致。
        setFormData((prev) => {
          const next: TakerFormState = { ...prev, [slot]: dataUrl };
          formDataRef.current = next;
          return next;
        });
        toastSuccess('已粘贴截图');
      } catch (err) {
        toastError((err as Error).message || '图片处理失败');
      } finally {
        pastingRef.current = false;
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [toastError, toastSuccess]);

  /** 注册时间失焦：可解析则回写规范化 'YYYY-MM-DD'，并记录「日缺省」提示 */
  const handleRegisterDateBlur = () => {
    const raw = formData.registerDate.trim();
    if (!raw) {
      setRegisterDateAssumed(false);
      return;
    }
    const detail = parseFlexibleDateDetail(raw);
    if (detail) {
      setFormData((prev) => ({ ...prev, registerDate: detail.date }));
      setRegisterDateAssumed(detail.dayMissing);
    }
  };

  /** 唤起原生日历：优先 showPicker；不支持或失败时回退 click 并提示用户手输 */
  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        // 非用户手势等场景下 showPicker 可能抛错，回退到 click
      }
    }
    // 旧浏览器（Chrome<99 / Firefox<101 / Safari<16）无 showPicker：click() 对 type=date
    // 仅聚焦、不会弹出日历，属静默无反应。此处兜底提示，指引用户直接输入日期。
    el.click();
    toastError('当前浏览器不支持日历弹窗，请直接输入日期');
  };

  /** 日历选择后回写（原生 date 输入恒为 'YYYY-MM-DD'） */
  const handleCalendarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, registerDate: e.target.value }));
    setRegisterDateAssumed(false);
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
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
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={onSubmit}>
          <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
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
                  淘宝昵称
                  <span className="text-xs text-muted-foreground">（选填）</span>
                </label>
                <input
                  type="text"
                  value={formData.taobaoNickname}
                  onChange={(e) => setFormData((prev) => ({ ...prev, taobaoNickname: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200"
                  placeholder="请输入淘宝昵称（选填）"
                />
              </div>
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
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formData.registerDate}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, registerDate: e.target.value }));
                        setRegisterDateAssumed(false);
                      }}
                      onBlur={handleRegisterDateBlur}
                      className="apple-input pr-9"
                      placeholder="如 2024-05-01"
                      title="支持 2024-05-01 / 2024/5/1 / 2024年5月1日 等格式"
                    />
                    <button
                      type="button"
                      onClick={openDatePicker}
                      title="选择日期"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-indigo-500"
                    >
                      <Calendar className="h-4 w-4" />
                    </button>
                    {/* 隐藏的原生日期输入，供日历图标联动唤起；选择后回写 */}
                    <input
                      ref={dateInputRef}
                      type="date"
                      tabIndex={-1}
                      aria-hidden="true"
                      value={/^\d{4}-\d{2}-\d{2}$/.test(formData.registerDate) ? formData.registerDate : ''}
                      onChange={handleCalendarPick}
                      className="pointer-events-none absolute left-0 top-full h-0 w-0 opacity-0"
                    />
                  </div>
                  {registerDateAssumed && (
                    <p className="mt-1 text-xs text-muted-foreground">已按 1 日登记</p>
                  )}
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
                  <label className="mb-2 block text-sm font-medium">每周收货次数（参考）</label>
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
                  <label className="mb-2 block text-sm font-medium">每月收货次数（参考）</label>
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

            {/* 收款信息（返款闭环） */}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
              <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                收款信息
              </h4>
              <p className="mb-4 text-xs text-muted-foreground">
                返款转账按此账号进行；收款账号属敏感信息，仅详情页展示，不进入列表接口。
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">收款人姓名</label>
                  <input
                    type="text"
                    value={formData.payeeName}
                    onChange={(e) => setFormData((prev) => ({ ...prev, payeeName: e.target.value }))}
                    className="apple-input"
                    placeholder="如 张三"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">收款账号</label>
                  <input
                    type="text"
                    value={formData.payeeAccount}
                    onChange={(e) => setFormData((prev) => ({ ...prev, payeeAccount: e.target.value }))}
                    className="apple-input"
                    placeholder="支付宝账号 / 银行卡号"
                  />
                </div>
              </div>
            </div>

            {/* 风控 / 黑名单 */}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
              <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                风控 / 黑名单
              </h4>
              <p className="mb-4 text-xs text-muted-foreground">
                勾选「风控标记」或将其拉黑后，该接单人将被硬拦截、无法快速接单。
              </p>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={formData.riskFlag}
                  onChange={(e) => setFormData((prev) => ({ ...prev, riskFlag: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-500/50"
                />
                风控标记（拦截快速接单）
              </label>
              <div className="mt-4">
                <label className="mb-2 block text-sm font-medium">黑名单/风控原因</label>
                <input
                  type="text"
                  value={formData.blacklistReason}
                  onChange={(e) => setFormData((prev) => ({ ...prev, blacklistReason: e.target.value }))}
                  className="apple-input"
                  placeholder="如：多次恶意退款 / 虚假好评"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
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
  );
}
