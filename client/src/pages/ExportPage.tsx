import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, ChevronDown, ChevronRight, CalendarRange } from 'lucide-react';
import { takersApi, tasksApi, ordersApi, logsApi, repeatDiscountApi } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { usePermissions } from '@/lib/permissions';
import {
  exportCombined,
  sheetColumnMap,
  pickColumns,
  fetchAllPages,
  EXPORT_PAGE_SIZE,
  localDateStr,
} from '@/lib/export';

// 各 sheet 对应的权限模块（与后端模块名 / Settings 勾选列表一致）
const SHEETS = [
  { key: 'takers', label: '接单人', module: 'takers' },
  { key: 'tasks', label: '任务', module: 'tasks' },
  { key: 'orders', label: '接单明细', module: 'orders' },
  { key: 'repeatDiscounts', label: '回头客立减', module: 'repeatDiscounts' },
  { key: 'logs', label: '操作日志', module: 'logs' },
] as const;

type SheetKey = (typeof SHEETS)[number]['key'];

/**
 * 日期范围筛选的真实支持情况（已逐一核对后端实现，未臆造参数名）：
 * - orders: orderService.getOrderList 支持 startDate/endDate（按 orderDate 过滤）✔
 * - repeatDiscounts: repeatDiscountService 支持 startDate/endDate（按 recordDate 过滤）✔
 * - logs: logController.getAllLogs 支持 startDate/endDate（按 createdAt 过滤）✔
 * - takers: getAllTakers 仅支持 status/search，无日期参数 ✘
 * - tasks: getAllTasks 仅支持 status/search，无日期参数 ✘
 */
const DATE_SUPPORTED: Record<SheetKey, boolean> = {
  orders: true,
  repeatDiscounts: true,
  logs: true,
  takers: false,
  tasks: false,
};

export default function ExportPage() {
  const { error: toastError } = useToast();
  const { canView } = usePermissions();
  const [selectedSheets, setSelectedSheets] = useState({
    takers: canView('takers'),
    tasks: canView('tasks'),
    orders: canView('orders'),
    logs: false,
    repeatDiscounts: false,
  });
  const [filename, setFilename] = useState('天猫激励数据导出');
  const [exporting, setExporting] = useState(false);

  // 日期范围（可选，默认全量）；仅对 DATE_SUPPORTED 的 sheet 生效
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 每个sheet要导出的列（默认全选）
  const [columnSelection, setColumnSelection] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    SHEETS.forEach(s => {
      init[s.key] = (sheetColumnMap[s.key] ?? []).map(c => c.key);
    });
    return init;
  });
  const [openColumnSheet, setOpenColumnSheet] = useState<SheetKey | null>(null);

  // 预览用查询：pageSize: 1 只为取 total（避免 react-query 缓存里常驻 5×10000 行数据）。
  // 真正的导出数据在 handleExport 里分页循环拉取。
  const { data: takersData } = useQuery({
    queryKey: ['takers-export-count'],
    queryFn: () => takersApi.getAll({ page: 1, pageSize: 1 }),
    enabled: selectedSheets.takers && canView('takers'),
  });

  const { data: tasksData } = useQuery({
    queryKey: ['tasks-export-count'],
    queryFn: () => tasksApi.getAll({ page: 1, pageSize: 1 }),
    enabled: selectedSheets.tasks && canView('tasks'),
  });

  const { data: ordersData } = useQuery({
    queryKey: ['orders-export-count', startDate, endDate],
    queryFn: () =>
      ordersApi.getAll({
        page: 1,
        pageSize: 1,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    enabled: selectedSheets.orders && canView('orders'),
  });

  const { data: logsData } = useQuery({
    queryKey: ['logs-export-count', startDate, endDate],
    queryFn: () =>
      logsApi.getAll({
        page: 1,
        pageSize: 1,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    enabled: selectedSheets.logs && canView('logs'),
  });

  const { data: repeatDiscountsData } = useQuery({
    queryKey: ['repeatDiscounts-export-count', startDate, endDate],
    queryFn: () =>
      repeatDiscountApi.getAll({
        page: 1,
        pageSize: 1,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    enabled: selectedSheets.repeatDiscounts && canView('repeatDiscounts'),
  });

  const handleToggleSheet = (sheet: SheetKey) => {
    setSelectedSheets(prev => ({ ...prev, [sheet]: !prev[sheet] }));
  };

  const toggleColumn = (sheetKey: SheetKey, colKey: string) => {
    setColumnSelection(prev => {
      const current = prev[sheetKey] ?? [];
      const next = current.includes(colKey)
        ? current.filter(k => k !== colKey)
        : [...current, colKey];
      return { ...prev, [sheetKey]: next };
    });
  };

  // 各 sheet 的分页拉取器（仅 DATE_SUPPORTED 的 sheet 透传日期参数）
  const buildFetcher = (sheetKey: SheetKey, page: number) => {
    const withDate = DATE_SUPPORTED[sheetKey];
    const dateParams = withDate
      ? { startDate: startDate || undefined, endDate: endDate || undefined }
      : {};
    switch (sheetKey) {
      case 'takers':
        return takersApi.getAll({ page, pageSize: EXPORT_PAGE_SIZE, ...dateParams });
      case 'tasks':
        return tasksApi.getAll({ page, pageSize: EXPORT_PAGE_SIZE, ...dateParams });
      case 'orders':
        return ordersApi.getAll({ page, pageSize: EXPORT_PAGE_SIZE, ...dateParams });
      case 'repeatDiscounts':
        return repeatDiscountApi.getAll({ page, pageSize: EXPORT_PAGE_SIZE, ...dateParams });
      case 'logs':
        return logsApi.getAll({ page, pageSize: EXPORT_PAGE_SIZE, ...dateParams });
      default:
        return Promise.resolve(null);
    }
  };

  const handleExport = async () => {
    const selected = SHEETS.filter(s => selectedSheets[s.key] && canView(s.module));
    if (selected.length === 0) {
      toastError('请至少选择一个表格');
      return;
    }

    setExporting(true);
    try {
      const sheets: { name: string; columns: any[]; data: any[] }[] = [];

      for (const sheet of selected) {
        // 分页循环拉取（每页 500），替代一次性 pageSize: 10000
        const rows = await fetchAllPages(async page => {
          const res: any = await buildFetcher(sheet.key, page);
          return res?.data ?? {};
        });
        const allCols = sheetColumnMap[sheet.key] ?? [];
        const selectedKeys = columnSelection[sheet.key] ?? allCols.map(c => c.key);
        sheets.push({
          name: sheet.label,
          columns: pickColumns(allCols, selectedKeys),
          data: rows,
        });
      }

      if (sheets.every(s => s.data.length === 0)) {
        toastError('所选表格在当前筛选条件下没有数据');
        return;
      }

      // 生成带日期的文件名（本地日期，避免 UTC 跨日偏移）
      const finalFilename = `${localDateStr()}_${filename || '天猫激励数据导出'}`;
      exportCombined({ filename: finalFilename, sheets });
    } catch {
      toastError('导出失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  };

  const counts: Record<string, number> = {
    takers: (takersData as any)?.data?.total || 0,
    tasks: (tasksData as any)?.data?.total || 0,
    orders: (ordersData as any)?.data?.total || 0,
    repeatDiscounts: (repeatDiscountsData as any)?.data?.total || 0,
    logs: (logsData as any)?.data?.total || 0,
  };
  const sheetRows = SHEETS.map(s => ({ ...s, count: counts[s.key], permitted: canView(s.module) }));
  const checkedSheets = sheetRows.filter(s => selectedSheets[s.key as SheetKey]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight apple-text-title-1">数据导出</h2>
        <p className="text-muted-foreground mt-1">选择要导出的表格、日期范围和数据列</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Export Settings */}
        <div className="rounded-2xl apple-card p-6">
          <h3 className="text-lg font-semibold mb-4">导出设置</h3>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">文件名</label>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="apple-input rounded-lg mt-1"
                placeholder="输入导出文件名"
              />
            </div>

            {/* 日期范围（仅对后端真实支持日期参数的 sheet 生效） */}
            <div>
              <label className="text-sm font-medium flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-muted-foreground" />
                日期范围（可选，默认全量）
              </label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="apple-input rounded-lg"
                />
                <span className="text-muted-foreground text-sm">至</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="apple-input rounded-lg"
                />
                {(startDate || endDate) && (
                  <button
                    onClick={() => { setStartDate(''); setEndDate(''); }}
                    className="text-sm text-muted-foreground hover:text-rose-500 transition-colors whitespace-nowrap"
                  >
                    清除
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                适用于：接单明细（按接单日期）、回头客立减（按记录日期）、操作日志（按时间）。
                接单人与任务的后端接口暂不支持日期参数，导出时忽略日期范围。
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-3 block">选择要导出的表格</label>
              <div className="space-y-3">
                {sheetRows.map(sheet => (
                  <label
                    key={sheet.key}
                    className={`flex items-center justify-between p-3 border rounded-xl transition-colors ${sheet.permitted ? 'hover:bg-accent cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedSheets[sheet.key as SheetKey]}
                        onChange={() => handleToggleSheet(sheet.key as SheetKey)}
                        disabled={!sheet.permitted}
                        className="rounded w-4 h-4 accent-indigo-500"
                      />
                      <div>
                        <span className="font-medium">{sheet.label}</span>
                        {sheet.permitted ? (
                          <span className="text-xs text-muted-foreground ml-2 tabular-nums">
                            {sheet.count}条数据
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600 dark:text-amber-400 ml-2">无权限</span>
                        )}
                      </div>
                    </div>
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  </label>
                ))}
              </div>
            </div>

            {/* 列勾选（每个 sheet 默认全选） */}
            {checkedSheets.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-2 block">导出列（默认全选）</label>
                <div className="space-y-2">
                  {checkedSheets.map(sheet => {
                    const key = sheet.key as SheetKey;
                    const allCols = sheetColumnMap[key] ?? [];
                    const selectedCols = columnSelection[key] ?? [];
                    const isOpen = openColumnSheet === key;
                    return (
                      <div key={key} className="border rounded-xl overflow-hidden">
                        <button
                          onClick={() => setOpenColumnSheet(isOpen ? null : key)}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors"
                        >
                          <span className="flex items-center gap-1.5">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            {sheet.label}
                          </span>
                          <span className={`text-xs tabular-nums ${selectedCols.length === 0 ? 'text-rose-500' : 'text-muted-foreground'}`}>
                            {selectedCols.length}/{allCols.length} 列
                          </span>
                        </button>
                        {isOpen && (
                          <div className="px-3 pb-3 grid grid-cols-2 gap-2">
                            {allCols.map(col => (
                              <label key={col.key} className="flex items-center gap-2 text-xs cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedCols.includes(col.key)}
                                  onChange={() => toggleColumn(key, col.key)}
                                  className="rounded w-3.5 h-3.5 accent-indigo-500"
                                />
                                <span className={selectedCols.includes(col.key) ? '' : 'text-muted-foreground'}>
                                  {col.label}
                                </span>
                              </label>
                            ))}
                            <div className="col-span-2 flex gap-3 pt-1 border-t">
                              <button
                                onClick={() => setColumnSelection(prev => ({ ...prev, [key]: allCols.map(c => c.key) }))}
                                className="text-xs text-indigo-500 hover:underline"
                              >
                                全选
                              </button>
                              <button
                                onClick={() => setColumnSelection(prev => ({ ...prev, [key]: [] }))}
                                className="text-xs text-muted-foreground hover:underline"
                              >
                                清空
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-2xl apple-card p-6">
          <h3 className="text-lg font-semibold mb-4">导出预览</h3>

          <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-xl">
              <p className="text-sm text-muted-foreground mb-2">文件名</p>
              <p className="font-medium">{localDateStr()}_{filename || '天猫激励数据导出'}.xlsx</p>
            </div>

            <div className="p-4 bg-muted/50 rounded-xl">
              <p className="text-sm text-muted-foreground mb-2">包含工作表</p>
              <div className="space-y-1">
                {checkedSheets.map(sheet => {
                  const key = sheet.key as SheetKey;
                  const cols = (columnSelection[key] ?? []).length;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                      <span>{sheet.label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        ({sheet.count}条{DATE_SUPPORTED[key] && (startDate || endDate) ? '·按日期' : ''}·{cols}列)
                      </span>
                    </div>
                  );
                })}
                {checkedSheets.length === 0 && (
                  <p className="text-muted-foreground">未选择任何表格</p>
                )}
              </div>
            </div>

            <div className="p-4 bg-muted/50 rounded-xl">
              <p className="text-sm text-muted-foreground mb-2">导出说明</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• 导出格式为 Excel (.xlsx)</li>
                <li>• 每个表格作为独立的工作表</li>
                <li>• 分页拉取（每页 {EXPORT_PAGE_SIZE} 条），避免一次性载入全部数据</li>
                <li>• 金额字段自动格式化</li>
                <li>• 日期字段自动转换为本地格式</li>
                <li>• 布尔值转换为"是/否"</li>
              </ul>
            </div>

            <button
              onClick={handleExport}
              disabled={exporting || checkedSheets.length === 0}
              className="apple-btn w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3 text-sm font-medium text-white hover:shadow-lg hover:shadow-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {exporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
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
