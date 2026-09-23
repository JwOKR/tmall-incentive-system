import { createPortal } from 'react-dom';

interface ImageZoomProps {
  /** 要放大的图片 dataURL / URL；为空时不渲染 */
  src: string | null;
  alt?: string;
  onClose: () => void;
}

/**
 * 全屏图片查看遮罩（点击遮罩或图片外部关闭）。
 * 供 ImageUpload 预览与详情页截图查看复用。
 *
 * 必须 portal 到 document.body：ImageUpload 的唯一使用点在接单人表单弹窗
 * （Takers.tsx 的 .modal-content）内部，带 transform 或 overflow 的祖先会成为
 * position: fixed 的包含块并裁剪它，导致「点截图出不来全屏遮罩，被缩到弹窗盒子
 * 大小并裁掉」。挂到 body 后遮罩始终相对视口定位，不受任何祖先影响。
 */
export default function ImageZoom({ src, alt = '截图预览', onClose }: ImageZoomProps) {
  if (!src) return null;
  return createPortal(
    <div
      // 挂到 body 后与 #root 内的弹窗处于同一层叠上下文，需高于所有弹窗：
      // .modal-overlay(z-index:50!important) / .modal-content(51)。
      // 注意 ConfirmDialog 写了 inline `zIndex: 9998`，但内联样式没有 !important，
      // 会被 .modal-overlay 的 `z-index: 50 !important` 覆盖，实际生效的同样是 50。
      // 取 9997：稳居各弹窗之上，且低于 Toast 的 z-[9999]。
      className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/70 p-4 animate-in fade-in"
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}
