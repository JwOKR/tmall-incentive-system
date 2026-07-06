import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { exportToExcel, ExportColumn } from '@/lib/export';
import { useToast } from '@/components/Toast';

interface ExportDialogProps {
  title: string;
  filename: string;
  columns: ExportColumn[];
  data: any[];
  buttonLabel?: string;
  /** 可选：导出时调用的异步函数，返回全量数据（解决分页问题） */
  fetchData?: () => Promise<any[]>;
}

export default function ExportDialog({ title, filename, columns, data, buttonLabel = '导出', fetchData }: ExportDialogProps) {
  const { error: toastError } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<ExportColumn[]>(
    columns.map(col => ({ ...col }))
  );
  const [exporting, setExporting] = useState(false);

  const handleToggleColumn = (key: string) => {
    setSelectedColumns(prev =>
      prev.map(col =>
        col.key === key ? { ...col, selected: !col.selected } : col
      )
    );
  };

  const handleSelectAll = () => {
    setSelectedColumns(prev =>
      prev.map(col => ({ ...col, selected: true }))
    );
  };

  const handleDeselectAll = () => {
    setSelectedColumns(prev =>
      prev.map(col => ({ ...col, selected: false }))
    );
  };

  const handleExport = async () => {
    const selected = selectedColumns.filter(col => col.selected);
    if (selected.length === 0) {
      toastError('请至少选择一列');
      return;
    }

    setExporting(true);
    try {
      // 生成带日期的文件名
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const datedFilename = `${dateStr}_${filename}`;

      // 如果提供了 fetchData，优先获取全量数据（解决分页导出不全问题）
      const exportData = fetchData ? await fetchData() : data;

      exportToExcel({
        filename: datedFilename,
        columns: selected,
        data: exportData,
      });

      setShowDialog(false);
    } catch (error) {
      console.error('导出失败:', error);
      toastError('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
      >
        <Download className="h-4 w-4" />
        {buttonLabel}
      </button>
      
      {showDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowDialog(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowDialog(false)}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div
            className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl border border-border/50 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{title}</h3>
              <button
                onClick={() => setShowDialog(false)}
                className="p-1 hover:bg-accent rounded-md"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">
                已选择 {selectedColumns.filter(c => c.selected).length} / {selectedColumns.length} 列
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleSelectAll}
                  className="px-3 py-1 text-xs border rounded hover:bg-accent"
                >
                  全选
                </button>
                <button
                  onClick={handleDeselectAll}
                  className="px-3 py-1 text-xs border rounded hover:bg-accent"
                >
                  全不选
                </button>
              </div>
            </div>
            
            <div className="space-y-2 mb-6">
              {selectedColumns.map(col => (
                <label
                  key={col.key}
                  className="flex items-center gap-3 p-2 hover:bg-accent rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={col.selected}
                    onChange={() => handleToggleColumn(col.key)}
                    className="rounded w-4 h-4"
                  />
                  <span className="text-sm">{col.label}</span>
                </label>
              ))}
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDialog(false)}
                className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
              >
                取消
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {exporting ? '正在获取数据并导出...' : `导出 (${selectedColumns.filter(c => c.selected).length} 列)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}