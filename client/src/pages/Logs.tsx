import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { logsApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Filter, Search, ChevronDown, ChevronRight } from 'lucide-react';
import ColumnFilter, { filterData } from '@/components/ColumnFilter';
import { canView, NoPermission } from '@/lib/permissions';

export default function Logs() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailSearch, setDetailSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['logs', page, actionFilter, startDate, endDate],
    queryFn: () =>
      logsApi.getAll({
        page,
        pageSize: 20,
        action: actionFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
  });

  const logs = (data as any)?.data?.list || [];
  const total = (data as any)?.data?.total || 0;

  // 本地搜索详情
  const searchedLogs = useMemo(() => {
    if (!detailSearch) return logs;
    const q = detailSearch.toLowerCase();
    return logs.filter((log: any) =>
      (log.detail || '').toLowerCase().includes(q) ||
      (log.order?.orderNo || '').toLowerCase().includes(q)
    );
  }, [logs, detailSearch]);

  const filteredLogs = useMemo(() => {
    return filterData(searchedLogs, columnFilters, (item: any, key: string) => {
      if (key === 'createdAt') return item.createdAt ? formatDate(item.createdAt) : '';
      if (key === 'action') return actionLabels[item.action] || item.action || '';
      if (key === 'orderInfo') return item.order ? `${item.order.orderNo || ''} ${item.order.productName || ''}`.trim() : '';
      return String(item[key] ?? '');
    });
  }, [searchedLogs, columnFilters]);

  const setColFilter = (key: string, value: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  };

  const actionColors: Record<string, string> = {
    create: 'badge-success',
    update: 'badge-info',
    delete: 'badge-danger',
    status_change: 'badge-warning',
    assign: 'badge-purple',
    batch_create: 'badge-success',
    batch_update: 'badge-info',
  };

  const actionLabels: Record<string, string> = {
    create: '创建',
    update: '更新',
    delete: '删除',
    status_change: '状态变更',
    assign: '分配',
    batch_create: '批量创建',
    batch_update: '批量更新',
  };

  // 解析详情中的变更项
  const parseChanges = (detail: string) => {
    if (!detail.includes('→')) return null;
    const parts = detail.split(': ');
    if (parts.length < 2) return null;
    const header = parts[0];
    const changes = parts.slice(1).join(': ').split(', ').map(c => {
      const [field, values] = c.split(': ');
      if (!values || !values.includes('→')) return null;
      const [from, to] = values.split(' → ');
      return { field: field?.trim(), from: from?.trim(), to: to?.trim() };
    }).filter(Boolean);
    return changes.length > 0 ? { header, changes } : null;
  };

  if (!canView('logs')) return <NoPermission module="logs" />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">操作日志</h2>
        <p className="text-muted-foreground">系统操作记录，支持筛选和详情查看</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="w-full rounded-md border border-input bg-background pl-10 pr-4 py-2 text-sm"
          >
            <option value="">全部操作</option>
            <option value="create">创建</option>
            <option value="update">更新</option>
            <option value="delete">删除</option>
            <option value="status_change">状态变更</option>
            <option value="assign">分配</option>
            <option value="batch_create">批量创建</option>
            <option value="batch_update">批量更新</option>
          </select>
        </div>
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索详情内容..."
            value={detailSearch}
            onChange={(e) => setDetailSearch(e.target.value)}
            className="w-full rounded-md border border-input bg-background pl-10 pr-4 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <span className="text-muted-foreground text-sm">至</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        {(actionFilter || startDate || endDate || detailSearch) && (
          <button
            onClick={() => { setActionFilter(''); setStartDate(''); setEndDate(''); setDetailSearch(''); setPage(1); }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            清除筛选
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="table-header">
              <th className="px-4 py-2 text-left text-sm font-medium w-8"></th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>时间</div>
                <ColumnFilter value={columnFilters['createdAt'] || ''} onChange={(v) => setColFilter('createdAt', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>操作类型</div>
                <ColumnFilter type="select" value={columnFilters['action'] || ''} onChange={(v) => setColFilter('action', v)} options={[{ value: '创建', label: '创建' }, { value: '更新', label: '更新' }, { value: '删除', label: '删除' }, { value: '状态变更', label: '状态变更' }, { value: '批量创建', label: '批量创建' }, { value: '批量更新', label: '批量更新' }]} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>详细信息</div>
                <ColumnFilter value={columnFilters['detail'] || ''} onChange={(v) => setColFilter('detail', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>关联订单</div>
                <ColumnFilter value={columnFilters['orderInfo'] || ''} onChange={(v) => setColFilter('orderInfo', v)} />
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium">
                <div>IP地址</div>
                <ColumnFilter value={columnFilters['ipAddress'] || ''} onChange={(v) => setColFilter('ipAddress', v)} />
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  暂无匹配数据
                </td>
              </tr>
            ) : (
              filteredLogs.map((log: any) => {
                const isExpanded = expandedId === log.id;
                const changes = parseChanges(log.detail);
                return (
                  <tr key={log.id} className={`table-row-hover table-row-zebra ${isExpanded ? 'bg-primary/5 dark:bg-primary/10' : ''}`}>
                    <td className="px-2 py-3">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className="p-1 hover:bg-accent rounded text-muted-foreground"
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${actionColors[log.action] || 'badge-neutral'}`}>
                        {actionLabels[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm max-w-md">
                      {isExpanded && changes ? (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground mb-1">{changes.header}</p>
                          {changes.changes.map((c: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground w-16 shrink-0">{c.field}</span>
                              <span className="line-through text-muted-foreground">{c.from}</span>
                              <span>→</span>
                              <span className="text-foreground font-medium">{c.to}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="truncate block">{log.detail}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {log.order ? (
                        <span>{log.order.orderNo} - {log.order.productName}</span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {log.ipAddress || '-'}
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
            className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
          >
            上一页
          </button>
          <span className="flex items-center px-3 text-sm">
            第 {page} 页 / 共 {Math.ceil(total / 20)} 页
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(total / 20)}
            className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
