import { CheckSquare, Square, ExternalLink, Copy, Eye, Trash2 } from 'lucide-react';
import { formatCurrency, formatDate, calcDisplayTotalRefund } from '@/lib/utils';
import type {
  OrderCellRenderers,
  OrderRowActions,
  OrderStatusOptions,
} from './types';

// P1-4 移动端卡片视图。
// 原样提取自 pages/Orders.tsx 的 renderOrderCard：JSX 逐字复制，未改 className / 文案 / 逻辑。
// 与桌面表格共用同一份 react-query 数据与全部状态（筛选/分页/批量选择），
// 不新增任何请求，仅按断点切换渲染形态（小屏卡片 md:hidden / 桌面表格 hidden md:block）。
// 组内解构回页面原名，保证移动到本文件的 JSX 与原文逐字一致。

export interface OrderCardProps {
  order: any;
  selected: boolean;
  actions: OrderRowActions;
  cells: OrderCellRenderers;
  statusOptions: OrderStatusOptions;
}

export default function OrderCard({ order, selected, actions, cells, statusOptions }: OrderCardProps) {
  const { onSelectOne, onOpenDrawer, onDelete, onCopy, onCellClick } = actions;
  const { renderEditableCell, renderStatusSelect, renderBaseCommissionCell } = cells;
  const { refundOptions, reviewOptions } = statusOptions;
  return (
    <div
      key={order.id}
      className={`rounded-2xl border bg-card p-4 shadow-sm apple-card space-y-3 ${selected ? 'ring-2 ring-indigo-400/60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => onSelectOne(order.id)}
            className="p-1 -ml-1 hover:bg-accent rounded shrink-0"
            title={selected ? '取消选择' : '选择'}
          >
            {selected ? <CheckSquare className="h-5 w-5 text-primary" /> : <Square className="h-5 w-5 text-muted-foreground" />}
          </button>
          <div className="min-w-0">
            <p className="font-semibold truncate">{order.taker?.wechatName || '-'}</p>
            <p className="text-xs text-muted-foreground truncate">{order.taker?.taobaoNickname || '-'}</p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{formatDate(order.orderDate)}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">总返款</p>
          <p className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(calcDisplayTotalRefund(order))}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">实付</p>
          <p className="font-medium">{formatCurrency(order.actualPayment)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">返款状态</p>
          {renderStatusSelect(order, 'isRefunded', refundOptions)}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">好评状态</p>
          {renderStatusSelect(order, 'isGoodReview', reviewOptions)}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">返款日期</p>
          {renderEditableCell(order, 'refundDate', 'date')}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">基础返佣</p>
          {renderBaseCommissionCell(order)}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">好评返佣</p>
          {renderEditableCell(order, 'reviewCommission', 'number')}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">19订单号</p>
          {renderEditableCell(order, 'orderNo19', 'text')}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">订单编号</p>
          {renderEditableCell(order, 'orderNo', 'text')}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">备注</p>
          {renderEditableCell(order, 'remark', 'text')}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">作图时间</p>
          {renderEditableCell(order, 'drawingDate', 'datetime')}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">好评返佣日期</p>
          {renderEditableCell(order, 'reviewCommissionDate', 'datetime')}
        </div>
      </div>

      <div className="text-sm space-y-1">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs text-muted-foreground shrink-0">商品</span>
          <span className="truncate">{order.task?.productName || '-'}</span>
          {order.productId && (
            <a
              href={`https://detail.tmall.com/item.htm?id=${order.productId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 shrink-0"
              title="在天猫查看"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-1 min-w-0 text-muted-foreground">
          <span className="text-xs shrink-0">ID</span>
          <span className="truncate">{order.productId || '-'}</span>
          <span className="text-xs shrink-0 ml-1">编号</span>
          <span className="truncate">{order.productCode || '-'}</span>
          {order.productCode && (
            <a
              href={`http://web.19buy.com/search.aspx?id=${order.productCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-600 dark:text-sky-400 shrink-0"
              title="查看产品页面"
            >
              ↗
            </a>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t">
        <div className="flex items-center gap-2 min-w-0">
          {order.orderLink ? (
            <>
              <a
                href={order.orderLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-600 dark:text-sky-400 text-xs hover:underline"
              >
                打开订单
              </a>
              <button
                onClick={() => onCopy(order.orderLink)}
                className="text-muted-foreground hover:text-foreground"
                title="复制链接"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onCellClick(order.id, 'orderLink', order.orderLink)}
                className="text-muted-foreground hover:text-foreground text-xs"
                title="编辑链接"
              >
                ✎
              </button>
            </>
          ) : (
            <button
              onClick={() => onCellClick(order.id, 'orderLink', '')}
              className="text-muted-foreground hover:text-foreground text-xs"
              title="点击添加链接"
            >
              + 添加链接
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onOpenDrawer(order.id)}
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
            title="查看详情"
          >
            <Eye className="h-4 w-4" /> 详情
          </button>
          <button
            onClick={() => onDelete(order.id)}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/40 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
            title="删除订单"
          >
            <Trash2 className="h-4 w-4" /> 删除
          </button>
        </div>
      </div>
    </div>
  );
}
