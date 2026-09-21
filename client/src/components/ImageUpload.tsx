import { useRef, useState } from 'react';
import { ImagePlus, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { processImageFile, formatBytes } from '@/lib/imageCompress';
import { useToast } from '@/components/Toast';
import ImageZoom from '@/components/ImageZoom';

interface ImageUploadProps {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (v: string | null) => void;
}

/**
 * 单张资质截图上传组件。
 *
 * 支持三种录入方式，共用同一套校验/压缩逻辑（processImageFile）：
 *   1. 点击「选择图片」通过文件选择器选图
 *   2. 拖拽图片到虚线空态区
 *   3. 拖拽图片到已有预览区（直接替换当前图）
 * 复制粘贴入口在父级（Takers 表单）统一处理，同样调用 processImageFile。
 */
export default function ImageUpload({ label, hint, value, onChange }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { error: toastError } = useToast();
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  /** 共用处理：校验 + 压缩 + 体积校验，成功后回填 */
  const processFile = async (file: File) => {
    setBusy(true);
    try {
      const dataUrl = await processImageFile(file);
      onChange(dataUrl);
    } catch (err) {
      toastError((err as Error).message || '图片处理失败');
    } finally {
      setBusy(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 立即清空，保证同一文件再次选择也能触发 change
    e.target.value = '';
    if (!file) return;
    await processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!busy) setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    // 阻止浏览器默认行为（否则会直接打开/下载拖入的图片）
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const approximateBytes = value ? Math.round(value.length * 0.75) : 0;

  return (
    <div>
      <label className="mb-2 block text-sm font-medium">{label}</label>
      {hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {value ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex items-center gap-3 rounded-xl transition-colors ${
            dragOver ? 'ring-2 ring-indigo-500/50 ring-offset-2 ring-offset-background' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => setZoom(true)}
            className="group relative h-[120px] w-[120px] shrink-0 overflow-hidden rounded-xl border border-border/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            title="点击查看大图"
          >
            <img src={value} alt={label} className="h-full w-full object-cover" />
          </button>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              约 {formatBytes(approximateBytes)}
            </span>
            <span className="text-xs text-muted-foreground">拖入图片可直接替换</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-lg border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                更换
              </button>
              <button
                type="button"
                onClick={() => onChange(null)}
                className="inline-flex items-center gap-1 rounded-lg border border-input px-2.5 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          disabled={busy}
          className={`flex h-[120px] w-[120px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground transition-colors disabled:opacity-60 ${
            dragOver
              ? 'border-indigo-500 bg-indigo-500/5 text-indigo-500'
              : 'border-input hover:border-indigo-400 hover:text-indigo-500'
          }`}
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ImagePlus className="h-5 w-5" />
          )}
          <span className="text-xs">{busy ? '处理中...' : '选择 / 拖入图片'}</span>
        </button>
      )}

      {zoom && <ImageZoom src={value} alt={label} onClose={() => setZoom(false)} />}
    </div>
  );
}
