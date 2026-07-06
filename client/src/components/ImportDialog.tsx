import { useState, useRef } from 'react';
import { Upload, X, FileSpreadsheet, AlertCircle, CheckCircle, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '@/components/Toast';

interface ImportColumn {
  key: string;
  label: string;
  required?: boolean;
}

interface ImportDialogProps {
  title: string;
  columns: ImportColumn[];
  onImport: (data: any[]) => Promise<{ success: number; failed: number; duplicates: number }>;
  buttonLabel?: string;
  templateFilename?: string;
  /** create = 新建导入（默认），update = 批量修改（以订单号/19订单号为匹配键，只更新非空字段） */
  mode?: 'create' | 'update';
}

export default function ImportDialog({ title, columns, onImport, buttonLabel = '导入', templateFilename = '导入模板', mode = 'create' }: ImportDialogProps) {
  const { error: toastError } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; failed: number; duplicates: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = () => {
    // 创建模板数据
    const templateData = [
      columns.reduce((acc: any, col) => {
        acc[col.label] = '';
        return acc;
      }, {}),
    ];

    // 创建工作簿
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templateData);

    // 设置列宽
    const colWidths = columns.map(col => ({
      wch: Math.max(col.label.length * 2, 15)
    }));
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    // 下载文件
    XLSX.writeFile(wb, `${templateFilename}.xlsx`);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // 映射列名
        const mappedData = jsonData.map((row: any) => {
          const mapped: any = {};
          columns.forEach(col => {
            // 尝试匹配列名（支持中文和英文），注意不能用||否则false/0会被忽略
            const value = col.label in row ? row[col.label] : (col.key in row ? row[col.key] : '');
            mapped[col.key] = value;
          });
          return mapped;
        });

        setPreviewData(mappedData.slice(0, 10)); // 预览前10条
      } catch (error) {
        toastError('文件解析失败，请检查文件格式');
        setFile(null);
        setPreviewData([]);
      }
    };
    reader.readAsBinaryString(selectedFile);
  };

  const handleImport = async () => {
    if (!file || previewData.length === 0) return;

    setImporting(true);
    try {
      // 重新读取完整数据
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = event.target?.result;
          const workbook = XLSX.read(data, { type: 'binary', raw: true });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // 获取表头行
          const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
          const headers: string[] = [];
          for (let col = range.s.c; col <= range.e.c; col++) {
            const cell = worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: col })];
            headers.push(cell ? String(cell.v) : '');
          }
          
          // 手动解析数据行，保留长数字的精度
          const jsonData: any[] = [];
          for (let row = range.s.r + 1; row <= range.e.r; row++) {
            const rowData: any = {};
            let hasData = false;
            for (let col = range.s.c; col <= range.e.c; col++) {
              const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
              const cell = worksheet[cellRef];
              const header = headers[col - range.s.c];
              if (cell) {
                // 如果是数字且超过15位，使用格式化后的文本值
                if (cell.t === 'n' && cell.w && String(cell.v).length > 15) {
                  rowData[header] = cell.w;
                } else {
                  rowData[header] = cell.v;
                }
                hasData = true;
              } else {
                rowData[header] = '';
              }
            }
            if (hasData) jsonData.push(rowData);
          }

          const mappedData = jsonData.map((row: any) => {
            const mapped: any = {};
            columns.forEach(col => {
              let value = col.label in row ? row[col.label] : (col.key in row ? row[col.key] : '');
              // 确保数字类型的字段转换为字符串
              if (typeof value === 'number' && ['orderNo', 'orderNo19', 'productId', 'productCode'].includes(col.key)) {
                value = String(value);
              }
              mapped[col.key] = value;
            });
            return mapped;
          });

          const importResult = await onImport(mappedData);
          setResult(importResult);
        } catch (error) {
          toastError('导入失败：' + (error as Error).message);
        } finally {
          setImporting(false);
        }
      };
      reader.readAsBinaryString(file);
    } catch (error) {
      toastError('导入失败：' + (error as Error).message);
      setImporting(false);
    }
  };

  const handleClose = () => {
    setShowDialog(false);
    setFile(null);
    setPreviewData([]);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
      >
        <Upload className="h-4 w-4" />
        {buttonLabel}
      </button>
      
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-xl bg-card p-6 shadow-xl border border-border/50 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{title}</h3>
              <button
                onClick={handleClose}
                className="p-1 hover:bg-accent rounded-md"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* 文件选择 */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">选择文件</label>
              <div className="flex items-center gap-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  选择文件
                </button>
                <button
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent text-primary"
                >
                  <Download className="h-4 w-4" />
                  下载模板
                </button>
                {file && (
                  <span className="text-sm text-muted-foreground">
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                支持 .xlsx, .xls, .csv 格式 | 建议先下载模板填写
              </p>
            </div>

            {/* 列映射说明 */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">列名映射</label>
              <div className="grid grid-cols-2 gap-2">
                {columns.map(col => (
                  <div key={col.key} className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">•</span>
                    <span>{col.label}</span>
                    {col.required && <span className="text-destructive">*</span>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {mode === 'update'
                  ? '批量修改模式：必须包含订单编号或19订单号作为匹配键，其余字段留空则不修改'
                  : '请确保Excel文件的第一行为列名，且包含上述字段'}
              </p>
            </div>

            {/* 预览数据 */}
            {previewData.length > 0 && (
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">
                  数据预览 (前10条)
                </label>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="table-header">
                        {columns.map(col => (
                          <th key={col.key} className="px-3 py-2 text-left font-medium">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((row, index) => (
                        <tr key={index} className="table-row-hover">
                          {columns.map(col => (
                            <td key={col.key} className="px-3 py-2">
                              {row[col.key] || '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  共 {previewData.length} 条数据待导入
                </p>
              </div>
            )}

            {/* 导入结果 */}
            {result && (
              <div className="mb-6 p-4 rounded-lg bg-muted/50">
                <h4 className="font-medium mb-2">
                  {mode === 'update' ? '修改结果' : '导入结果'}
                </h4>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span>
                      {mode === 'update' ? `成功修改: ${result.success} 条` : `成功导入: ${result.success} 条`}
                    </span>
                  </div>
                  {result.duplicates > 0 && (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                      <span>
                        {mode === 'update'
                          ? `未找到订单: ${result.duplicates} 条（订单号不存在）`
                          : `重复数据: ${result.duplicates} 条（已跳过）`}
                      </span>
                    </div>
                  )}
                  {result.failed > 0 && (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <span>
                        {mode === 'update' ? `修改失败: ${result.failed} 条` : `导入失败: ${result.failed} 条`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
              >
                {result ? '关闭' : '取消'}
              </button>
              {!result && (
                <button
                  onClick={handleImport}
                  disabled={!file || previewData.length === 0 || importing}
                  className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {importing
                    ? (mode === 'update' ? '修改中...' : '导入中...')
                    : (mode === 'update' ? `批量修改 (${previewData.length} 条)` : `导入 (${previewData.length} 条)`)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}