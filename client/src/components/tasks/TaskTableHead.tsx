import { CheckSquare, Square } from 'lucide-react';
import ColumnFilter from '@/components/ColumnFilter';

interface TaskTableHeadProps {
  selectedIds: Set<string>;
  filteredTasks: any[];
  handleSelectAll: () => void;
  columnFilters: Record<string, string>;
  setColFilter: (key: string, value: string) => void;
}

export default function TaskTableHead({ selectedIds, filteredTasks, handleSelectAll, columnFilters, setColFilter }: TaskTableHeadProps) {
  return (
    <thead>
      <tr className="table-header">
        <th className="px-4 py-3 text-left">
          <button
            onClick={handleSelectAll}
            className="p-1 hover:bg-accent rounded"
            title={selectedIds.size === filteredTasks.length ? '取消全选' : '全选'}
          >
            {selectedIds.size === filteredTasks.length && filteredTasks.length > 0 ? (
              <CheckSquare className="h-4 w-4 text-indigo-500" />
            ) : (
              <Square className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </th>
        <th className="px-4 py-2 text-left text-sm font-medium">
          <div>商品ID</div>
          <ColumnFilter value={columnFilters['productId'] || ''} onChange={(v) => setColFilter('productId', v)} />
        </th>
        <th className="px-4 py-2 text-left text-sm font-medium">
          <div>产品编号</div>
          <ColumnFilter value={columnFilters['productCode'] || ''} onChange={(v) => setColFilter('productCode', v)} />
        </th>
        <th className="px-4 py-2 text-left text-sm font-medium">
          <div>淘口令</div>
          <ColumnFilter value={columnFilters['taoToken'] || ''} onChange={(v) => setColFilter('taoToken', v)} />
        </th>
        <th className="px-4 py-2 text-left text-sm font-medium">
          <div>价格</div>
          <ColumnFilter value={columnFilters['price'] || ''} onChange={(v) => setColFilter('price', v)} />
        </th>
        <th className="px-4 py-2 text-left text-sm font-medium">
          <div>基础返佣</div>
          <ColumnFilter value={columnFilters['baseCommission'] || ''} onChange={(v) => setColFilter('baseCommission', v)} />
        </th>
        <th className="px-4 py-2 text-left text-sm font-medium">
          <div>好评返佣</div>
          <ColumnFilter value={columnFilters['reviewReward'] || ''} onChange={(v) => setColFilter('reviewReward', v)} />
        </th>
        <th className="px-4 py-2 text-left text-sm font-medium">
          <div>限接人数</div>
          <ColumnFilter value={columnFilters['maxOrders'] || ''} onChange={(v) => setColFilter('maxOrders', v)} />
        </th>
        <th className="px-4 py-2 text-left text-sm font-medium">
          <div>已接人数</div>
          <ColumnFilter value={columnFilters['currentOrders'] || ''} onChange={(v) => setColFilter('currentOrders', v)} />
        </th>
        <th className="px-4 py-2 text-left text-sm font-medium">
          <div>状态</div>
          <ColumnFilter type="select" value={columnFilters['status'] || ''} onChange={(v) => setColFilter('status', v)} options={[{ value: 'pending', label: '待接单' }, { value: 'active', label: '进行中' }, { value: 'refunded', label: '已返款' }, { value: 'completed', label: '已完成' }, { value: 'cancelled', label: '已取消' }]} />
        </th>
        <th className="px-4 py-2 text-left text-sm font-medium">
          <div>发布日期</div>
          <ColumnFilter value={columnFilters['publishDate'] || ''} onChange={(v) => setColFilter('publishDate', v)} />
        </th>
        <th className="px-4 py-2 text-left text-sm font-medium">
          <div>截止日期</div>
          <ColumnFilter value={columnFilters['deadline'] || ''} onChange={(v) => setColFilter('deadline', v)} />
        </th>
        <th className="px-4 py-2 text-right text-sm font-medium"><div>操作</div></th>
      </tr>
    </thead>
  );
}
