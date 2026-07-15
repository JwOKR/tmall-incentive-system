import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet } from 'lucide-react';
import { takersApi, tasksApi, ordersApi, logsApi, repeatDiscountApi } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { takerColumns, taskColumns, orderColumns, logColumns, repeatDiscountColumns, exportCombined } from '@/lib/export';
import { usePermissions, NoPermission } from '@/lib/permissions';

export default function ExportPage() {
  const { error: toastError } = useToast();
  const { canView } = usePermissions();
  const [selectedSheets, setSelectedSheets] = useState({
    takers: true,
    tasks: true,
    orders: true,
    logs: false,
    repeatDiscounts: false,
  });
  const [filename, setFilename] = useState('天猫激励数据导出');
  const [exporting, setExporting] = useState(false);

  const { data: takersData } = useQuery({
    queryKey: ['takers-export'],
    queryFn: () => takersApi.getAll({ pageSize: 10000 }),
    enabled: selectedSheets.takers,
  });

  const { data: tasksData } = useQuery({
    queryKey: ['tasks-export'],
    queryFn: () => tasksApi.getAll({ pageSize: 10000 }),
    enabled: selectedSheets.tasks,
  });

  const { data: ordersData } = useQuery({
    queryKey: ['orders-export'],
    queryFn: () => ordersApi.getAll({ pageSize: 10000 }),
    enabled: selectedSheets.orders,
  });

  const { data: logsData } = useQuery({
    queryKey: ['logs-export'],
    queryFn: () => logsApi.getAll({ pageSize: 10000 }),
    enabled: selectedSheets.logs,
  });

  const { data: repeatDiscountsData } = useQuery({
    queryKey: ['repeatDiscounts-export'],
    queryFn: () => repeatDiscountApi.getAll({ pageSize: 10000 }),
    enabled: selectedSheets.repeatDiscounts,
  });

  const handleToggleSheet = (sheet: keyof typeof selectedSheets) => {
    setSelectedSheets(prev => ({
      ...prev,
      [sheet]: !prev[sheet],
    }));
  };

  const handleExport = () => {
    const sheets: { name: string; columns: any[]; data: any[] }[] = [];

    if (selectedSheets.takers && takersData) {
      sheets.push({
        name: '接单人',
        columns: takerColumns,
        data: (takersData as any)?.data?.list || [],
      });
    }

    if (selectedSheets.tasks && tasksData) {
      sheets.push({
        name: '任务',
        columns: taskColumns,
        data: (tasksData as any)?.data?.list || [],
      });
    }

    if (selectedSheets.orders && ordersData) {
      sheets.push({
        name: '接单明细',
        columns: orderColumns,
        data: (ordersData as any)?.data?.list || [],
      });
    }

    if (selectedSheets.logs && logsData) {
      sheets.push({
        name: '操作日志',
        columns: logColumns,
        data: (logsData as any)?.data?.list || [],
      });
    }

    if (selectedSheets.repeatDiscounts && repeatDiscountsData) {
      sheets.push({
        name: '回头客立减',
        columns: repeatDiscountColumns,
        data: (repeatDiscountsData as any)?.data?.list || [],
      });
    }

    if (sheets.length === 0) {
      toastError('请至少选择一个表格');
      return;
    }

    setExporting(true);

    // 生成带日期的文件名
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const finalFilename = `${dateStr}_${filename || '天猫激励数据导出'}`;

    setTimeout(() => {
      exportCombined({
        filename: finalFilename,
        sheets,
      });
      setExporting(false);
    }, 500);
  };

  const sheets = [
    { key: 'takers', label: '接单人', count: (takersData as any)?.data?.total || 0 },
    { key: 'tasks', label: '任务', count: (tasksData as any)?.data?.total || 0 },
    { key: 'orders', label: '接单明细', count: (ordersData as any)?.data?.total || 0 },
    { key: 'repeatDiscounts', label: '回头客立减', count: (repeatDiscountsData as any)?.data?.total || 0 },
    { key: 'logs', label: '操作日志', count: (logsData as any)?.data?.total || 0 },
  ];

  if (!canView('export')) return <NoPermission module="export" />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">数据导出</h2>
        <p className="text-muted-foreground">选择要导出的表格和数据</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Export Settings */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">导出设置</h3>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">文件名</label>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="输入导出文件名"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-3 block">选择要导出的表格</label>
              <div className="space-y-3">
                {sheets.map(sheet => (
                  <label
                    key={sheet.key}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedSheets[sheet.key as keyof typeof selectedSheets]}
                        onChange={() => handleToggleSheet(sheet.key as keyof typeof selectedSheets)}
                        className="rounded w-4 h-4"
                      />
                      <div>
                        <span className="font-medium">{sheet.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {sheet.count}条数据
                        </span>
                      </div>
                    </div>
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">导出预览</h3>

          <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">文件名</p>
              <p className="font-medium">{new Date().toISOString().split('T')[0]}_{filename || '天猫激励数据导出'}.xlsx</p>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">包含工作表</p>
              <div className="space-y-1">
                {sheets
                  .filter(sheet => selectedSheets[sheet.key as keyof typeof selectedSheets])
                  .map(sheet => (
                    <div key={sheet.key} className="flex items-center gap-2">
                      <span className="text-green-600 dark:text-green-400">✓</span>
                      <span>{sheet.label}</span>
                      <span className="text-xs text-muted-foreground">({sheet.count}条)</span>
                    </div>
                  ))}
                {!Object.values(selectedSheets).some(v => v) && (
                  <p className="text-muted-foreground">未选择任何表格</p>
                )}
              </div>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">导出说明</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• 导出格式为 Excel (.xlsx)</li>
                <li>• 每个表格作为独立的工作表</li>
                <li>• 金额字段自动格式化</li>
                <li>• 日期字段自动转换为本地格式</li>
                <li>• 布尔值转换为"是/否"</li>
              </ul>
            </div>

            <button
              onClick={handleExport}
              disabled={exporting || !Object.values(selectedSheets).some(v => v)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                  导出中...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  开始导出
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
