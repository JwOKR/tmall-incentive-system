import { useState, useRef, useEffect } from 'react';
import { Upload, X, FileSpreadsheet, AlertCircle, CheckCircle, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '@/components/Toast';

interface ImportColumn {
  key: string;
  label: string;
  required?: boolean;
}

type RowStatus = 'ok' | 'dup' | 'invalid';

interface ValidateRow {
  row: number;
  status: RowStatus;
  reason?: string;
}

interface ValidateResult {
  rows: ValidateRow[];
  summary: { total: number; ok: number; dup: number; invalid: number };
}

interface ImportDetail {
  row?: number;
  orderNo?: string | null;
  orderNo19?: string | null;
  status?: string;
  reason?: string;
  changes?: string;
  taker?: string;
  task?: string;
}

interface ImportErrorItem {
  row?: number;
  orderNo?: string | null;
  message: string;
}

interface ImportResult {
  success: number;
  failed: number;
  duplicates: number;
  details?: ImportDetail[];
  /** 兼容：部分批量接口历史上返回字符串数组 */
  errors?: Array<ImportErrorItem | string>;
}

interface ImportDialogProps {
  title: string;
  columns: ImportColumn[];
  onImport: (data: any[]) => Promise<ImportResult>;
  /**
   * 可选：服务端只读预校验（导入前调用，不写库）。
   * 未传时（如 Takers / Tasks）退化为「仅本地校验」。
   */
  onValidate?: (rows: any[]) => Promise<ValidateResult>;
  buttonLabel?: string;
  templateFilename?: string;
  /** create = 新建导入（默认），update = 批量修改（以订单号/19订单号为匹配键，只更新非空字段） */
  mode?: 'create' | 'update';
}

/** 预览行：excelRow 为 Excel 中的真实行号（表头占第 1 行）；status/reason 为校验结果 */
interface PreviewRow {
  excelRow: number;
  data: any;
  status: RowStatus;
  reason?: string;
}

const STATUS_LABEL: Record<string, string> = {
  success: '成功',
  skipped: '跳过',
  not_found: '未找到',
  failed: '失败',
  ok: '正常',
  dup: '重复',
  invalid: '非法',
};

const PREVIEW_STATUS_LABEL: Record<RowStatus, string> = {
  ok: '正常',
  dup: '重复',
  invalid: '非法',
};

function detailReason(d: ImportDetail): string {
  if (d.reason) return d.reason;
  if (d.changes) return d.changes;
  if (d.taker || d.task) return `接单人: ${d.taker || '未匹配'} / 任务: ${d.task || '未匹配'}`;
  return '-';
}

export default function ImportDialog({
  title,
  columns,
  onImport,
  onValidate,
  buttonLabel = '导入',
  templateFilename = '导入模板',
  mode = 'create',
}: ImportDialogProps) {
  const { error: toastError } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showDialog && dialogRef.current) dialogRef.current.focus();
  }, [showDialog]);

  const importableRows = previewRows.filter(r => r.status === 'ok');
  const problemCount = previewRows.length - importableRows.length;

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
      wch: Math.max(col.label.length * 2, 15),
    }));
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    // 下载文件
    XLSX.writeFile(wb, `${templateFilename}.xlsx`);
  };

  /**
   * 单一解析函数（handleFileSelect 与 handleImport 共用，消除历史上两份解析逻辑的不一致）。
   * 逐单元格读取以保留长数字（>15 位）精度：数字单元格用格式化文本 cell.w 而非 cell.v。
   * 返回 excelRow（Excel 真实行号）+ 映射后的行数据；整行全空的行在此丢弃（不计入总行数）。
   */
  const parseFile = async (f: File): Promise<{ excelRow: number; data: any }[]> => {
    const buf = await f.arrayBuffer();
    const workbook = XLSX.read(buf, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return [];

    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    const headers: string[] = [];
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: col })];
      headers.push(cell ? String(cell.v) : '');
    }

    const out: { excelRow: number; data: any }[] = [];
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const rowData: any = {};
      let hasData = false;
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cell = worksheet[XLSX.utils.encode_cell({ r, c: col })];
        const header = headers[col - range.s.c];
        if (cell) {
          if (cell.t === 'n' && cell.w && String(cell.v).length > 15) {
            rowData[header] = cell.w; // 长数字：用格式化文本保精度
          } else {
            rowData[header] = cell.v;
          }
          hasData = true;
        } else {
          rowData[header] = '';
        }
      }
      if (!hasData) continue; // 整行全空 → 不计入总行数

      const mapped: any = {};
      columns.forEach(col => {
        const value = col.label in rowData ? rowData[col.label] : (col.key in rowData ? rowData[col.key] : '');
        mapped[col.key] =
          typeof value === 'number' && ['orderNo', 'orderNo19', 'productId', 'productCode'].includes(col.key)
            ? String(value)
            : value;
      });
      // r 为 0-based 行下标，+1 得到 Excel 行号
      out.push({ excelRow: r + 1, data: mapped });
    }
    return out;
  };

  /** 本地校验（不依赖后端）：required 列为空 → invalid；本文件内单号重复 → dup */
  const localValidate = (parsed: { excelRow: number; data: any }[]): ValidateRow[] => {
    const seen = new Map<string, number>();
    return parsed.map(({ excelRow, data }) => {
      for (const col of columns) {
        if (!col.required) continue;
        const v = data[col.key];
        if (v === undefined || v === null || String(v).trim() === '') {
          return { row: excelRow, status: 'invalid' as RowStatus, reason: `${col.label}不能为空` };
        }
      }
      const no = data.orderNo !== undefined && data.orderNo !== null ? String(data.orderNo).trim() : '';
      const no19 = data.orderNo19 !== undefined && data.orderNo19 !== null ? String(data.orderNo19).trim() : '';
      if (no && seen.has(no)) {
        return { row: excelRow, status: 'dup' as RowStatus, reason: `本文件内重复（第 ${seen.get(no)} 行已出现）` };
      }
      if (no19 && seen.has(no19)) {
        return { row: excelRow, status: 'dup' as RowStatus, reason: `本文件内重复（第 ${seen.get(no19)} 行已出现）` };
      }
      if (no && !seen.has(no)) seen.set(no, excelRow);
      if (no19 && !seen.has(no19)) seen.set(no19, excelRow);
      return { row: excelRow, status: 'ok' as RowStatus };
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setResult(null);

    try {
      const parsed = await parseFile(selectedFile);
      const local = localValidate(parsed);
      let rows: PreviewRow[] = parsed.map((p, i) => ({
        excelRow: p.excelRow,
        data: p.data,
        status: local[i].status,
        reason: local[i].reason,
      }));

      // 服务端只读预校验（若组件传入了 onValidate）；服务端结果优先覆盖本地对同一行（按顺序）的判定
      if (onValidate && parsed.length > 0) {
        setValidating(true);
        try {
          const res = await onValidate(parsed.map(p => p.data));
          const served = res?.rows;
          if (Array.isArray(served) && served.length === rows.length) {
            rows = rows.map((r, i) => ({
              ...r,
              status: served[i]?.status ?? r.status,
              reason: served[i]?.reason ?? r.reason,
            }));
          }
        } catch {
          // 服务端校验不可用 → 保留本地校验结果，不阻断用户流程
        } finally {
          setValidating(false);
        }
      }

      setPreviewRows(rows);
    } catch {
      toastError('文件解析失败，请检查文件格式');
      setFile(null);
      setPreviewRows([]);
    }
  };

  const handleImport = async () => {
    const rowsToImport = importableRows.map(r => r.data);
    if (!file || rowsToImport.length === 0) return;

    setImporting(true);
    try {
      const importResult = await onImport(rowsToImport);
      setResult(importResult);
    } catch (error) {
      toastError('导入失败：' + (error as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setShowDialog(false);
    setFile(null);
    setPreviewRows([]);
    setResult(null);
    setValidating(false);
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
        <div
          className="modal-overlay"
          onClick={handleClose}
          onKeyDown={(e) => e.key === 'Escape' && handleClose()}
          tabIndex={-1}
          ref={dialogRef}
        >
          <div
            className="modal-content modal-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
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

            {/* 预览数据（全部行，可滚动） */}
            {previewRows.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">
                    数据预览（共 {previewRows.length} 行）
                  </label>
                  {validating && (
                    <span className="text-xs text-muted-foreground">正在校验…</span>
                  )}
                </div>
                <div className="max-h-[40vh] overflow-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="table-header">
                        <th className="px-3 py-2 text-left font-medium whitespace-nowrap">行号</th>
                        {columns.map(col => (
                          <th key={col.key} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                            {col.label}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-left font-medium whitespace-nowrap">校验</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, index) => (
                        <tr
                          key={index}
                          className={row.status === 'ok' ? 'table-row-hover' : 'bg-destructive/10'}
                        >
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{row.excelRow}</td>
                          {columns.map(col => (
                            <td key={col.key} className="px-3 py-2 whitespace-nowrap">
                              {row.data[col.key] === '' || row.data[col.key] === undefined || row.data[col.key] === null
                                ? '-'
                                : String(row.data[col.key])}
                            </td>
                          ))}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {row.status === 'ok' ? (
                              <span className="text-green-600 dark:text-green-400">
                                {PREVIEW_STATUS_LABEL[row.status]}
                              </span>
                            ) : (
                              <span className="text-destructive">
                                {PREVIEW_STATUS_LABEL[row.status]}
                                {row.reason ? `：${row.reason}` : ''}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  共 {previewRows.length} 行，其中 {problemCount} 行有问题；可导入{' '}
                  <span className="font-medium">{importableRows.length}</span> 行
                  {problemCount > 0 && '（导入时将自动跳过有问题的行）'}
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

                {/* 明细表：行号 / 单号 / 状态 / 原因 */}
                {result.details && result.details.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium mb-1">明细（共 {result.details.length} 条）</p>
                    <div className="max-h-48 overflow-auto border rounded-md bg-background">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-background">
                          <tr className="table-header">
                            <th className="px-2 py-1 text-left font-medium whitespace-nowrap">行号</th>
                            <th className="px-2 py-1 text-left font-medium whitespace-nowrap">单号</th>
                            <th className="px-2 py-1 text-left font-medium whitespace-nowrap">状态</th>
                            <th className="px-2 py-1 text-left font-medium">原因</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.details.map((d, i) => (
                            <tr key={i} className={d.status === 'success' ? '' : 'bg-destructive/10'}>
                              <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">{d.row ?? '-'}</td>
                              <td className="px-2 py-1 whitespace-nowrap">{d.orderNo || d.orderNo19 || '-'}</td>
                              <td className="px-2 py-1 whitespace-nowrap">{d.status ? STATUS_LABEL[d.status] || d.status : '-'}</td>
                              <td className="px-2 py-1">{detailReason(d)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 错误明细 */}
                {result.errors && result.errors.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium mb-1 text-destructive">错误（共 {result.errors.length} 条）</p>
                    <ul className="text-xs space-y-0.5">
                      {result.errors.map((e, i) => (
                        <li key={i} className="text-destructive">
                          {typeof e === 'string'
                            ? e
                            : `第 ${e.row ?? '?'} 行${e.orderNo ? `（${e.orderNo}）` : ''}：${e.message}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
                  disabled={!file || previewRows.length === 0 || importableRows.length === 0 || importing || validating}
                  className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {importing
                    ? (mode === 'update' ? '修改中...' : '导入中...')
                    : problemCount > 0
                      ? `仅导入正常行（${importableRows.length} 条）`
                      : (mode === 'update' ? `批量修改 (${previewRows.length} 条)` : `导入 (${previewRows.length} 条)`)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
