interface ImageZoomProps {
  /** 要放大的图片 dataURL / URL；为空时不渲染 */
  src: string | null;
  alt?: string;
  onClose: () => void;
}

/**
 * 全屏图片查看遮罩（点击遮罩或图片外部关闭）。
 * 供 ImageUpload 预览与详情页截图查看复用。
 */
export default function ImageZoom({ src, alt = '截图预览', onClose }: ImageZoomProps) {
  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in"
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
