import { CheckSquare, Square, ExternalLink, Copy, Save, Eye, Trash2 } from 'lucide-react';
import { formatCurrency, formatDate, calcDisplayTotalRefund } from '@/lib/utils';
import type {
  OrderCellRenderers,
  OrderRowActions,
  OrderRowEditing,
  OrderStatusOptions,
} from './types';

// 桌面表格行（原样提取自 pages/Orders.tsx tbody 内的 <tr>）。
// JSX 逐字复制，未改 className / 文案 / 逻辑；组内解构回页面原名以保证与原文一致。
// 虚拟滚动（P1-11）在虚拟模式下给行加固定高度，与非虚拟模式共用同一段 JSX。

export interface OrderRowProps {
  order: any;
  selected: boolean;
  /** 是否处于虚拟滚动模式（>VIRTUALIZE_THRESHOLD 行时为真，当前分页上限 100 故恒为假） */
  virtualize: boolean;
  /** VIRTUAL_ROW_HEIGHT */
  rowHeight: number;
  editing: OrderRowEditing;
  cells: OrderCellRenderers;
  statusOptions: OrderStatusOptions;
  actions: OrderRowActions;
}

export default function OrderRow({
  order,
  selected,
  virtualize,
  rowHeight: VIRTUAL_ROW_HEIGHT,
  editing,
  cells,
  statusOptions,
  actions,
}: OrderRowProps) {
  const { renderEditableCell, renderReadOnlyCell, renderStatusSelect, renderBaseCommissionCell } = cells;
  const { onSelectOne, onOpenDrawer, onDelete, onCopy, onCellClick } = actions;
  const { isEditing, value: editValue, onChange: setEditValue, onSave: handleSave, onKeyDown: handleKeyDown, inputRef } = editing;
  const { refundOptions, reviewOptions } = statusOptions;
  return (
    <tr key={order.id} style={virtualize ? { height: VIRTUAL_ROW_HEIGHT } : undefined} className={`table-row-hover table-row-zebra ${selected ? 'table-row-selected' : ''}`}>
      <td className="px-3 py-2">
        <button
          onClick={() => onSelectOne(order.id)}
          className="p-1 hover:bg-accent rounded"
        >
          {selected ? (
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
        {order.taker?.taobaoNickname || '-'}
      </td>
      <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400 font-medium">
        <div title={order.isBaseCommissionRefunded
          ? `实付 ${formatCurrency(order.actualPayment)} + 好评返佣 ${formatCurrency(order.reviewCommission)} + 基础返佣 ${formatCurrency(order.baseCommission)}`
          : `实付 ${formatCurrency(order.actualPayment)} + 好评返佣 ${formatCurrency(order.reviewCommission)}（基础返佣 ${formatCurrency(order.baseCommission)} 未返款，未计入）`}>
          {renderReadOnlyCell(calcDisplayTotalRefund(order), 'number')}
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
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{order.productId}</span>
            {order.productId && (
              <a
                href={`https://detail.tmall.com/item.htm?id=${order.productId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                title="在天猫查看"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
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
              className="text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 text-xs"
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
            <button onClick={handleSave} className="p-1 text-emerald-600 hover:bg-emerald-100 rounded">
              <Save className="h-3 w-3" />
            </button>
          </div>
        ) : order.orderLink ? (
          <div className="flex items-center gap-1">
            <a
              href={order.orderLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-600 dark:text-sky-400 hover:underline text-xs"
              title="点击打开链接"
            >
              打开
            </a>
            <button
              onClick={() => onCopy(order.orderLink)}
              className="text-muted-foreground hover:text-foreground text-xs"
              title="点击复制链接"
            >
              <Copy className="h-3 w-3" />
            </button>
            <button
              onClick={() => onCellClick(order.id, 'orderLink', order.orderLink)}
              className="text-muted-foreground hover:text-foreground text-xs"
              title="点击编辑"
            >
              ✎
            </button>
          </div>
        ) : (
          <button
            onClick={() => onCellClick(order.id, 'orderLink', '')}
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
        {renderBaseCommissionCell(order)}
      </td>
      <td className="px-3 py-2">
        {renderEditableCell(order, 'reviewCommission', 'number')}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {renderEditableCell(order, 'drawingDate', 'datetime')}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {renderEditableCell(order, 'reviewCommissionDate', 'datetime')}
      </td>
      <td className="px-3 py-2">
        {renderEditableCell(order, 'remark', 'text')}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => onOpenDrawer(order.id)}
            className="p-1 hover:bg-accent rounded-md"
            title="查看详情"
          >
            <Eye className="h-4 w-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => onDelete(order.id)}
            className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-md"
            title="删除订单"
          >
            <Trash2 className="h-4 w-4 text-rose-500" />
          </button>
        </div>
      </td>
    </tr>
  );
}
