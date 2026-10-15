import { Pencil, Trash2, Eye, Ban, ShieldOff, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDate } from '@/lib/utils';
import { COMPLIANCE_META, type ComplianceStatus } from '@/lib/takerConstants';

interface TakerRowProps {
  taker: any;
  onEdit: (taker: any) => void;
  /** 打开「拉黑 / 风控」弹窗 */
  onOpenRisk: (taker: any) => void;
  /** 解除风控 / 拉黑 */
  onReleaseRisk: (taker: any) => void;
  onDelete: (id: string) => void;
}

/**
 * 接单人列表的桌面表格行。
 *
 * 无内部 state / 无 hook，纯展示 + 事件上抛，父组件持有全部业务逻辑。
 */
export default function TakerRow({ taker, onEdit, onOpenRisk, onReleaseRisk, onDelete }: TakerRowProps) {
  const status = (taker.compliance?.status as ComplianceStatus) || 'incomplete';
  const meta = COMPLIANCE_META[status];
  const fails: string[] = taker.compliance?.fails || [];
  return (
    <tr className="table-row-hover table-row-zebra">
      <td className="px-4 py-3 text-sm font-medium">
        <Link to={`/takers/${taker.id}`} className="hover:text-indigo-500 hover:underline transition-colors">
          {taker.wechatName}
        </Link>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{taker.wechatId}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{taker.taobaoNickname || '—'}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{taker.payeeName || '—'}</td>
      <td className="px-4 py-3 text-sm">
        <div className="flex flex-col items-start gap-1">
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
              taker.status === 'suspended'
                ? 'badge-danger'
                : taker.status === 'active'
                  ? 'badge-success'
                  : 'badge-neutral'
            }`}
          >
            {taker.status === 'suspended' ? '已拉黑' : taker.status === 'active' ? '活跃' : '停用'}
          </span>
          {taker.risk?.riskFlag && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium badge-warning"
              title={taker.blacklistReason || '风控标记：无法快速接单'}
            >
              <AlertTriangle className="h-3 w-3" />
              风控
            </span>
          )}
        </div>
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
          onClick={() => onEdit(taker)}
          className="p-1 hover:bg-accent rounded-lg"
        >
          <Pencil className="h-4 w-4" />
        </button>
        {taker.risk?.blocked ? (
          <button
            onClick={() => onReleaseRisk(taker)}
            className="p-1 hover:bg-emerald-500/10 rounded-lg ml-1"
            title="解除风控 / 拉黑"
          >
            <ShieldOff className="h-4 w-4 text-emerald-600" />
          </button>
        ) : (
          <button
            onClick={() => onOpenRisk(taker)}
            className="p-1 hover:bg-amber-500/10 rounded-lg ml-1"
            title="拉黑 / 风控（拦截快速接单）"
          >
            <Ban className="h-4 w-4 text-amber-600" />
          </button>
        )}
        <button
          onClick={() => onDelete(taker.id)}
          className="p-1 hover:bg-rose-500/10 rounded-lg ml-1"
        >
          <Trash2 className="h-4 w-4 text-rose-500" />
        </button>
      </td>
    </tr>
  );
}
