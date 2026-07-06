import { useState } from 'react';
import { Download, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { exportCombined, ExportColumn } from '@/lib/export';
import { useToast } from '@/components/Toast';

interface SheetConfig {
  name: string;
  label: string;
  columns: ExportColumn[];
  data: any[];
  selected?: boolean;
}

interface CombinedExportButtonProps {
  sheets: SheetConfig[];
  defaultFilename?: string;
}

export default function CombinedExportButton({ sheets, defaultFilename = '数据导出' }: CombinedExportButtonProps) {
  const { error: toastError } = useToast();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSheetSelect, setShowSheetSelect] = useState(false);
  const [selectedSheets, setSelectedSheets] = useState<SheetConfig[]>(
    sheets.map(sheet => ({ ...sheet, selected: true }))
  );
  const [filename, setFilename] = useState(defaultFilename);

  const handleToggleSheet = (name: string) => {
    setSelectedSheets(prev =>
      prev.map(sheet =>
        sheet.name === name ? { ...sheet, selected: !sheet.selected } : sheet
      )
    );
  };

  const handleSelectAll = () => {
    setSelectedSheets(prev =>
      prev.map(sheet => ({ ...sheet, selected: true }))
    );
  };

  const handleDeselectAll = () => {
    setSelectedSheets(prev =>
      prev.map(sheet => ({ ...sheet, selected: false }))
    );
  };

  const handleExport = () => {
    const selected = selectedSheets.filter(sheet => sheet.selected);
    if (selected.length === 0) {
      toastError('请至少选择一个表格');
      return;
    }
    
    exportCombined({
      filename: filename || defaultFilename,
      sheets: selected.map(sheet => ({
        name: sheet.label,
        columns: sheet.columns.filter(col => col.selected !== false),
        data: sheet.data,
      })),
    });
    
    setShowSheetSelect(false);
    setShowDropdown(false);
  };

  const handleQuickExportAll = () => {
    exportCombined({
      filename: filename || defaultFilename,
      sheets: sheets.map(sheet => ({
        name: sheet.label,
        columns: sheet.columns.filter(col => col.selected !== false),
        data: sheet.data,
      })),
    });
    setShowDropdown(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Download className="h-4 w-4" />
        合并导出
        <ChevronDown className="h-4 w-4" />
      </button>
      
      {showDropdown && (
        <div className="absolute right-0 mt-2 w-64 rounded-md border bg-card shadow-lg z-50">
          <div className="p-2">
            <button
              onClick={handleQuickExportAll}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded-md"
            >
              <FileSpreadsheet className="h-4 w-4" />
              导出所有表格
            </button>
            <button
              onClick={() => setShowSheetSelect(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded-md"
            >
              <FileSpreadsheet className="h-4 w-4" />
              自定义导出...
            </button>
          </div>
        </div>
      )}
      
      {showSheetSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
            <h3 className="text-lg font-semibold mb-4">合并导出设置</h3>
            
            <div className="mb-4">
              <label className="text-sm font-medium">文件名</label>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="输入导出文件名"
              />
            </div>
            
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
              {selectedSheets.map(sheet => (
                <label
                  key={sheet.name}
                  className="flex items-center justify-between p-3 border rounded hover:bg-accent cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={sheet.selected}
                      onChange={() => handleToggleSheet(sheet.name)}
                      className="rounded"
                    />
                    <div>
                      <span className="text-sm font-medium">{sheet.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({sheet.data.length}条)
                      </span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowSheetSelect(false);
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