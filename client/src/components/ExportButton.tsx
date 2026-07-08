import { useState } from 'react';
import { Download, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { exportToExcel, ExportColumn } from '@/lib/export';
import { useToast } from '@/components/Toast';

interface ExportButtonProps {
  filename: string;
  columns: ExportColumn[];
  data: any[];
  label?: string;
}

export default function ExportButton({ filename, columns, data, label = '导出' }: ExportButtonProps) {
  const { error: toastError } = useToast();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showColumnSelect, setShowColumnSelect] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<ExportColumn[]>(
    columns.map(col => ({ ...col }))
  );

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

  const getDateFilename = (base: string) => {
    const dateStr = new Date().toISOString().split('T')[0];
    return `${dateStr}_${base}`;
  };

  const handleExport = () => {
    const selected = selectedColumns.filter(col => col.selected);
    if (selected.length === 0) {
      toastError('请至少选择一列');
      return;
    }

    exportToExcel({
      filename: getDateFilename(filename),
      columns: selected,
      data,
    });

    setShowDropdown(false);
    setShowColumnSelect(false);
  };

  const handleQuickExport = () => {
    exportToExcel({
      filename: getDateFilename(filename),
      columns: columns.filter(col => col.selected !== false),
      data,
    });
    setShowDropdown(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
      >
        <Download className="h-4 w-4" />
        {label}
        <ChevronDown className="h-4 w-4" />
      </button>
      
      {showDropdown && (
        <div className="absolute right-0 mt-2 w-56 rounded-md border bg-card shadow-lg z-50">
          <div className="p-2">
            <button
              onClick={handleQuickExport}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded-md"
            >
              <FileSpreadsheet className="h-4 w-4" />
              快速导出（默认列）
            </button>
            <button
              onClick={() => setShowColumnSelect(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded-md"
            >
              <FileSpreadsheet className="h-4 w-4" />
              自定义列导出...
            </button>
          </div>
        </div>
      )}
      
      {showColumnSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">选择导出列</h3>
            
            <div className="flex gap-2 mb-4">
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
            
            <div className="space-y-2 mb-4">
              {selectedColumns.map(col => (
                <label
                  key={col.key}
                  className="flex items-center gap-2 p-2 hover:bg-accent rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={col.selected}
                    onChange={() => handleToggleColumn(col.key)}
                    className="rounded"
                  />
                  <span className="text-sm">{col.label}</span>
                </label>
              ))}
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowColumnSelect(false);
                  setShowDropdown(false);
                }}
                className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
              >
                取消
              </button>
              <button
                onClick={handleExport}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
              >
                导出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}