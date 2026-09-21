import { useRef, useState } from 'react';
import { ImagePlus, Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { compressImage, formatBytes } from '@/lib/imageCompress';
import { useToast } from '@/components/Toast';
import ImageZoom from '@/components/ImageZoom';

interface ImageUploadProps {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (v: string | null) => void;
}

/** 单张截图 base64 字符串长度上限（与后端 MAX_SCREENSHOT_LENGTH 相呼应） */
const MAX_DATAURL_LENGTH = 1_500_000;

/**
 * 单张资质截图上传组件。
 *
 * 选图后在前端压缩为 JPEG base64 dataURL，超过体积上限则拒绝并提示。
 */
export default function ImageUpload({ label, hint, value, onChange }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { error: toastError } = useToast();
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 立即清空，保证同一文件再次选择也能触发 change
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toastError('请选择图片文件');
      return;
    }

    setBusy(true);
    try {
      const dataUrl = await compressImage(file);
      if (dataUrl.length > MAX_DATAURL_LENGTH) {
        toastError('图片过大，请选择更小的图片');
        return;
      }
      onChange(dataUrl);
    } catch (err) {
      toastError((err as Error).message || '图片处理失败');
    } finally {
      setBusy(false);
    }
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
        <div className="flex items-center gap-3">
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
          disabled={busy}
          className="flex h-[120px] w-[120px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input text-muted-foreground transition-colors hover:border-indigo-400 hover:text-indigo-500 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ImagePlus className="h-5 w-5" />
          )}
          <span className="text-xs">{busy ? '处理中...' : '选择图片'}</span>
        </button>
      )}

      {zoom && <ImageZoom src={value} alt={label} onClose={() => setZoom(false)} />}
    </div>
  );
}
