import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { logsApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Filter } from 'lucide-react';

export default function Logs() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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

  const actionColors: Record<string, string> = {
    create: 'bg-green-100 text-green-800',
    update: 'bg-blue-100 text-blue-800',
    delete: 'bg-red-100 text-red-800',
    status_change: 'bg-yellow-100 text-yellow-800',
    assign: 'bg-purple-100 text-purple-800',
  };

  const actionLabels: Record<string, string> = {
    create: '创建',
    update: '更新',
    delete: '删除',
    status_change: '状态变更',
    assign: '分配',
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">操作日志</h2>
        <p className="text-muted-foreground">系统操作记录</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full rounded-md border border-input bg-background pl-10 pr-4 py-2 text-sm"
          >
            <option value="">全部操作</option>
            <option value="create">创建</option>
            <option value="update">更新</option>
            <option value="delete">删除</option>
            <option value="status_change">状态变更</option>
            <option value="assign">分配</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="开始日期"
          />
          <span className="text-muted-foreground">至</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="结束日期"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="px-4 py-3 text-left text-sm font-medium">时间</th>
              <th className="px-4 py-3 text-left text-sm font-medium">操作类型</th>
              <th className="px-4 py-3 text-left text-sm font-medium">详细信息</th>
              <th className="px-4 py-3 text-left text-sm font-medium">关联订单</th>
              <th className="px-4 py-3 text-left text-sm font-medium">IP地址</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  暂无日志记录
                </td>
              </tr>
            ) : (
              logs.map((log: any) => (
                <tr key={log.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatDate(log.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        actionColors[log.action] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {actionLabels[log.action] || log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{log.detail}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {log.order ? (
                      <span>
                        {log.order.orderNo} - {log.order.productName}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {log.ipAddress || '-'}
                  </td>
                </tr>
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