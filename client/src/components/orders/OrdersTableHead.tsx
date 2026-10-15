import { CheckSquare, Square, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import ColumnFilter from '@/components/ColumnFilter';

// 桌面表头（原样提取自 pages/Orders.tsx 的 <thead>）。
// 排序按钮 + 列筛选器，JSX 逐字复制，未改 className / 文案 / 逻辑。

export interface OrdersTableHeadProps {
  onSelectAll: () => void;
  /** 已选行数 */
  selectedCount: number;
  /** 当前列表行数 */
  totalCount: number;
  sortConfig: { field: string; direction: 'asc' | 'desc' } | null;
  onSort: (field: string) => void;
  columnFilters: Record<string, string>;
  onColFilter: (key: string, value: string) => void;
  getUniqueValues: (field: string) => { value: string; label: string }[];
}

export default function OrdersTableHead({
  onSelectAll,
  selectedCount,
  totalCount,
  sortConfig,
  onSort,
  columnFilters,
  onColFilter,
  getUniqueValues,
}: OrdersTableHeadProps) {
  const allSelected = selectedCount === totalCount && totalCount > 0;
  const selectAllTitle = selectedCount === totalCount ? '取消全选' : '全选';
  return (
    <thead>
      <tr className="table-header">
        <th className="px-3 py-3 text-left">
          <button
            onClick={onSelectAll}
            className="p-1 hover:bg-accent rounded"
            title={selectAllTitle}
          >
            {allSelected ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </th>
        <th className="px-3 py-2 text-left font-medium">
          <button onClick={() => onSort('orderDate')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
            接单日期
            {sortConfig?.field === 'orderDate' ? (
              sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )}
          </button>
          <ColumnFilter type="date" value={columnFilters['orderDate'] || ''} onChange={(v) => onColFilter('orderDate', v)} />
        </th>
        <th className="px-3 py-2 text-left font-medium">
          <button onClick={() => onSort('wechatName')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
            微信昵称
            {sortConfig?.field === 'wechatName' ? (
              sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )}
          </button>
          <ColumnFilter value={columnFilters['wechatName'] || ''} onChange={(v) => onColFilter('wechatName', v)} options={getUniqueValues('wechatName')} />
        </th>
        <th className="px-3 py-2 text-left font-medium">
          <button onClick={() => onSort('taobaoNickname')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
            淘宝昵称
            {sortConfig?.field === 'taobaoNickname' ? (
              sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )}
          </button>
          <ColumnFilter value={columnFilters['taobaoNickname'] || ''} onChange={(v) => onColFilter('taobaoNickname', v)} options={getUniqueValues('taobaoNickname')} />
        </th>
        <th className="px-3 py-2 text-left font-medium"><div className="whitespace-nowrap">总返款</div></th>
        <th className="px-3 py-2 text-left font-medium">
          <button onClick={() => onSort('isRefunded')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
            返款状态
            {sortConfig?.field === 'isRefunded' ? (
              sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )}
          </button>
          <ColumnFilter type="select" value={columnFilters['isRefunded'] || ''} onChange={(v) => onColFilter('isRefunded', v)} options={[{ value: 'true', label: '已返款' }, { value: 'false', label: '未返款' }]} />
        </th>
        <th className="px-3 py-2 text-left font-medium">
          <button onClick={() => onSort('refundDate')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
            返款日期
            {sortConfig?.field === 'refundDate' ? (
              sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )}
          </button>
          <ColumnFilter type="date" value={columnFilters['refundDate'] || ''} onChange={(v) => onColFilter('refundDate', v)} />
        </th>
        <th className="px-3 py-2 text-left font-medium">
          <button onClick={() => onSort('productId')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
            商品ID
            {sortConfig?.field === 'productId' ? (
              sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )}
          </button>
          <ColumnFilter value={columnFilters['productId'] || ''} onChange={(v) => onColFilter('productId', v)} options={getUniqueValues('productId')} />
        </th>
        <th className="px-3 py-2 text-left font-medium">
          <button onClick={() => onSort('productCode')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
            产品编号
            {sortConfig?.field === 'productCode' ? (
              sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )}
          </button>
          <ColumnFilter value={columnFilters['productCode'] || ''} onChange={(v) => onColFilter('productCode', v)} options={getUniqueValues('productCode')} />
        </th>
        <th className="px-3 py-2 text-left font-medium">
          <button onClick={() => onSort('orderNo19')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
            19订单号
            {sortConfig?.field === 'orderNo19' ? (
              sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )}
          </button>
          <ColumnFilter value={columnFilters['orderNo19'] || ''} onChange={(v) => onColFilter('orderNo19', v)} options={getUniqueValues('orderNo19')} />
        </th>
        <th className="px-3 py-2 text-left font-medium">
          <button onClick={() => onSort('orderNo')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
            订单编号
            {sortConfig?.field === 'orderNo' ? (
              sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )}
          </button>
          <ColumnFilter value={columnFilters['orderNo'] || ''} onChange={(v) => onColFilter('orderNo', v)} options={getUniqueValues('orderNo')} />
        </th>
        <th className="px-3 py-2 text-left font-medium"><div className="whitespace-nowrap">订单链接</div></th>
        <th className="px-3 py-2 text-left font-medium">
          <button onClick={() => onSort('actualPayment')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
            实付
            {sortConfig?.field === 'actualPayment' ? (
              sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )}
          </button>
          <ColumnFilter value={columnFilters['actualPayment'] || ''} onChange={(v) => onColFilter('actualPayment', v)} options={getUniqueValues('actualPayment')} />
        </th>
        <th className="px-3 py-2 text-left font-medium">
          <button onClick={() => onSort('isGoodReview')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
            好评状态
            {sortConfig?.field === 'isGoodReview' ? (
              sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )}
          </button>
          <ColumnFilter type="select" value={columnFilters['isGoodReview'] || ''} onChange={(v) => onColFilter('isGoodReview', v)} options={[{ value: 'pending', label: '未好评' }, { value: 'reviewed', label: '已好评' }, { value: 'creating', label: '作图中' }, { value: 'returned', label: '已返图' }]} />
        </th>
        <th className="px-3 py-2 text-left font-medium">
          <button onClick={() => onSort('baseCommission')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
            基础返佣
            {sortConfig?.field === 'baseCommission' ? (
              sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )}
          </button>
          <ColumnFilter type="select" value={columnFilters['isBaseCommissionRefunded'] || ''} onChange={(v) => onColFilter('isBaseCommissionRefunded', v)} options={[{ value: 'true', label: '已返款' }, { value: 'false', label: '未返款' }]} />
        </th>
        <th className="px-3 py-2 text-left font-medium">
          <button onClick={() => onSort('reviewCommission')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
            好评返佣
            {sortConfig?.field === 'reviewCommission' ? (
              sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )}
          </button>
          <ColumnFilter value={columnFilters['reviewCommission'] || ''} onChange={(v) => onColFilter('reviewCommission', v)} options={getUniqueValues('reviewCommission')} />
        </th>
        <th className="px-3 py-2 text-left font-medium">
          <button onClick={() => onSort('drawingDate')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
            作图时间
            {sortConfig?.field === 'drawingDate' ? (
              sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )}
          </button>
          <ColumnFilter type="date" value={columnFilters['drawingDate'] || ''} onChange={(v) => onColFilter('drawingDate', v)} />
        </th>
        <th className="px-3 py-2 text-left font-medium">
          <button onClick={() => onSort('reviewCommissionDate')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
            好评返佣日期
            {sortConfig?.field === 'reviewCommissionDate' ? (
              sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )}
          </button>
          <ColumnFilter type="date" value={columnFilters['reviewCommissionDate'] || ''} onChange={(v) => onColFilter('reviewCommissionDate', v)} />
        </th>
        <th className="px-3 py-2 text-left font-medium">
          <button onClick={() => onSort('remark')} className="flex items-center gap-0.5 hover:text-primary whitespace-nowrap">
            备注
            {sortConfig?.field === 'remark' ? (
              sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )}
          </button>
          <ColumnFilter value={columnFilters['remark'] || ''} onChange={(v) => onColFilter('remark', v)} options={getUniqueValues('remark')} />
        </th>
        <th className="px-3 py-2 text-right font-medium"><div className="whitespace-nowrap">操作</div></th>
      </tr>
    </thead>
  );
}
