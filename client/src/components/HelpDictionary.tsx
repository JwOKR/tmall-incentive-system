import { X, BookOpen, ShieldCheck, Clock, ListChecks, AlertTriangle } from 'lucide-react';

interface HelpDictionaryProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 数据字典 / 帮助浮层（P2-10）。
 *
 * 内容全部为静态产品规则常量，来源（与代码逐一核对，勿凭记忆增删）：
 * - 信誉等级与资质判定：server/src/utils/takerCompliance.ts
 *   （CREDIT_LEVELS 15 级、CREDIT_LEVEL_MIN_RANK=3、WEEKLY_RECEIPT_MAX=5、
 *    MONTHLY_RECEIPT_MAX=20、SCREENSHOT_TARGET=3，evaluateTakerCompliance 三项核心判定）
 * - 7 天接单间隔与 force 语义：server/src/controllers/taskController.ts quickOrder
 *   （全局 7 天间隔、首次接单不受限、force 仅绕过间隔、不绕过风控/资质）
 * - 状态枚举：server/prisma/schema.prisma 字段注释
 *   （OrderTaker.status / Task.status / Order.isGoodReview / Log.action）
 *
 * 特别注意（与 takerCompliance.ts 头注释一致）：
 * 周/月收货次数与 3 张资质截图 **不参与资质判定**，仅登记与展示。
 */
export default function HelpDictionary({ open, onClose }: HelpDictionaryProps) {
  // 无 Hook：早退不涉及 Hook 顺序问题
  if (!open) return null;

  const creditLevels = [
    { group: '心级', levels: ['1心', '2心', '3心', '4心', '5心'] },
    { group: '钻级', levels: ['1钻', '2钻', '3钻', '4钻', '5钻'] },
    { group: '冠级', levels: ['1冠', '2冠', '3冠', '4冠', '5冠'] },
  ];

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} tabIndex={-1}>
      <div className="modal-content modal-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-500" />
            数据字典 / 新手帮助
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded-md" title="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* 信誉等级 */}
          <section className="rounded-xl border p-4">
            <h4 className="font-medium mb-2 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-indigo-500" />
              信誉等级（共 15 级，心 &lt; 钻 &lt; 冠）
            </h4>
            <div className="space-y-2 text-sm">
              {creditLevels.map((g) => (
                <div key={g.group} className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground w-10 shrink-0">{g.group}</span>
                  {g.levels.map((lv) => (
                    <span
                      key={lv}
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                        lv === '3心' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-medium' : 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'
                      }`}
                    >
                      {lv}
                    </span>
                  ))}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                资质判定要求信誉等级达到 <strong>3 心（含）以上</strong>；等级无法识别时该项判空。
              </p>
            </div>
          </section>

          {/* 资质判定 */}
          <section className="rounded-xl border p-4">
            <h4 className="font-medium mb-2 flex items-center gap-1.5">
              <ListChecks className="h-4 w-4 text-indigo-500" />
              接单人资质判定（只有三项核心条件参与判定）
            </h4>
            <div className="space-y-2 text-sm">
              <p className="text-xs text-muted-foreground mb-1">合格 = 三项全部通过；三项：①注册满一年 ②完成实名认证 ③信誉 ≥ 3 心</p>
              <div className="grid gap-1.5">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 mt-0.5">✓</span>
                  <span><strong>注册满一年</strong>：淘宝账号注册时间早于（含）一年前的今天；未填写判空。</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 mt-0.5">✓</span>
                  <span><strong>实名认证</strong>：硬性门槛，必须显式确认为「是」，未确认即视为不通过。</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 mt-0.5">✓</span>
                  <span><strong>信誉 ≥ 3 心</strong>：低于 3 心不通过。</span>
                </div>
              </div>
              <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    以下为<strong>参考信息，不参与资质判定</strong>，不会导致「不合格」：
                    ①每周收货次数（参考上限 5，超出仅详情页标红）；②每月收货次数（参考上限 20，超出仅详情页标红）；
                    ③资质截图 0-3 张（头像 / 账号与安全 / 待评价，证据类材料，仅展示「截图 x/3」，Excel 批量导入必然为空）。
                  </span>
                </p>
              </div>
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">资质状态取值：</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="badge-success inline-flex rounded-full px-2 py-0.5 text-xs">qualified 合格</span>
                  <span className="badge-danger inline-flex rounded-full px-2 py-0.5 text-xs">unqualified 不合格</span>
                  <span className="badge-warning inline-flex rounded-full px-2 py-0.5 text-xs">incomplete 待完善</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                判定顺序：从未登记过任何资质信息 → 「待完善」（历史数据不会被误判为不合格）；有核心不通过项 → 「不合格」；必填项（注册时间 / 信誉等级）缺失 → 「待完善」；否则「合格」。
              </p>
              <p className="text-xs text-muted-foreground">
                门槛生效范围：仅「快速接单」入口；Excel 批量导入订单属历史数据补录通道，不受资质门槛限制。
              </p>
            </div>
          </section>

          {/* 接单间隔 */}
          <section className="rounded-xl border p-4">
            <h4 className="font-medium mb-2 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-indigo-500" />
              接单间隔规则（全局 7 天）
            </h4>
            <div className="space-y-2 text-sm">
              <p>①同一接单人 <strong>7 天内</strong>已接过任何订单（全局，不区分任务/商品）→ 再次「快速接单」会被拦截。</p>
              <p>②<strong>首次接单不受限制</strong>（没有任何历史订单时直接放行）。</p>
              <p>③被拦截时提示的「下次可接单时间」= 最近一单接单时间 + 7 天。</p>
              <p>
                ④「强制接单」（<code className="px-1 rounded bg-muted text-xs">force</code>）<strong>仅用于绕过 7 天接单间隔</strong>；
                不能绕过风控/黑名单拦截，也不能绕过资质门槛——即便 force = true，不合格/被风控的接单人依然会被拒绝。
              </p>
              <p>⑤间隔限制同样只作用于「快速接单」入口，Excel 批量导入不受限。</p>
            </div>
          </section>

          {/* 风控/黑名单 */}
          <section className="rounded-xl border p-4">
            <h4 className="font-medium mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              风控 / 黑名单
            </h4>
            <p className="text-sm">
              被标记风控（riskFlag = true）或账号状态为「暂停（suspended）」的接单人，快速接单一律硬拦截（403），
              且<strong>无法用强制接单绕过</strong>；拦截原因取自黑名单/风控原因（blacklistReason）。
              收款账号（payeeAccount）属敏感信息，仅接单人详情 / 单条接口返回，不进列表。
            </p>
          </section>

          {/* 状态枚举 */}
          <section className="rounded-xl border p-4">
            <h4 className="font-medium mb-2 flex items-center gap-1.5">
              <ListChecks className="h-4 w-4 text-indigo-500" />
              状态枚举速查
            </h4>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-1">接单人账号状态（OrderTaker.status）：</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="badge-success inline-flex rounded-full px-2 py-0.5 text-xs">active 正常</span>
                  <span className="badge-neutral inline-flex rounded-full px-2 py-0.5 text-xs">inactive 停用</span>
                  <span className="badge-danger inline-flex rounded-full px-2 py-0.5 text-xs">suspended 暂停（快速接单硬拦截）</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">任务状态（Task.status）：</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="badge-warning inline-flex rounded-full px-2 py-0.5 text-xs">pending 待接单</span>
                  <span className="badge-info inline-flex rounded-full px-2 py-0.5 text-xs">active 进行中</span>
                  <span className="badge-success inline-flex rounded-full px-2 py-0.5 text-xs">refunded 已返款</span>
                  <span className="badge-success inline-flex rounded-full px-2 py-0.5 text-xs">completed 已完成</span>
                  <span className="badge-neutral inline-flex rounded-full px-2 py-0.5 text-xs">cancelled 已取消</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">订单好评状态（Order.isGoodReview）：</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="badge-neutral inline-flex rounded-full px-2 py-0.5 text-xs">pending 未好评</span>
                  <span className="badge-success inline-flex rounded-full px-2 py-0.5 text-xs">reviewed 已好评</span>
                  <span className="badge-warning inline-flex rounded-full px-2 py-0.5 text-xs">creating 作图中</span>
                  <span className="badge-info inline-flex rounded-full px-2 py-0.5 text-xs">returned 已返图</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">操作日志动作（Log.action）：</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="badge-success inline-flex rounded-full px-2 py-0.5 text-xs">create 创建</span>
                  <span className="badge-info inline-flex rounded-full px-2 py-0.5 text-xs">update 更新</span>
                  <span className="badge-danger inline-flex rounded-full px-2 py-0.5 text-xs">delete 删除</span>
                  <span className="badge-warning inline-flex rounded-full px-2 py-0.5 text-xs">status_change 状态变更</span>
                  <span className="badge-violet inline-flex rounded-full px-2 py-0.5 text-xs">assign 分配</span>
                  <span className="badge-success inline-flex rounded-full px-2 py-0.5 text-xs">batch_create 批量创建</span>
                  <span className="badge-info inline-flex rounded-full px-2 py-0.5 text-xs">batch_update 批量更新</span>
                </div>
              </div>
            </div>
          </section>

          <p className="text-xs text-muted-foreground">
            本页内容为产品规则静态说明，与系统判定逻辑保持一致；如规则调整请以系统实际拦截提示为准。
          </p>
        </div>
      </div>
    </div>
  );
}
