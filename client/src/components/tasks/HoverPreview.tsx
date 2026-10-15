import { useState, useRef, useLayoutEffect } from 'react';
import type React from 'react';
import { createPortal } from 'react-dom';
import { PREVIEW_SAFE_MARGIN, PREVIEW_TRIGGER_OFFSET } from '@/lib/taskPreview';

/**
 * 悬停预览组件（淘口令等长文本）。
 *
 * 定位策略：先以 (0,0) 渲染一帧但保持 visibility:hidden（visibility:hidden 的元素
 * 依然参与布局，因此可以测到真实尺寸），随后在 useLayoutEffect 中读取浮层实际
 * getBoundingClientRect() 做二次校正，把四边都 clamp 进视口安全边距内，
 * 浏览器绘制前完成，用户看不到定位跳变。
 *
 * 另外：浮层通过 createPortal 挂到 document.body，而不是留在原地。原因是
 * .apple-card:hover 会施加 transform: translateY(-2px)，带 transform 的祖先会成为
 * position: fixed 的包含块，同时表格外层还有 overflow-x-auto —— 浮层会被重新锚定到
 * 卡片坐标系并被裁掉（这正是淘口令预览「超出/被截断」的根因之一）。
 */
export default function HoverPreview({ content, children, className = '' }: { content: string; children: React.ReactNode; className?: string }) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [positioned, setPositioned] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    setPositioned(false);
    setShow(true);
  };

  const handleMouseLeave = () => {
    setShow(false);
    setPositioned(false);
  };

  // 渲染后实测浮层真实尺寸再校正位置，避免用估算值判断导致溢出视口
  useLayoutEffect(() => {
    if (!show) return;
    const triggerEl = triggerRef.current;
    const previewEl = previewRef.current;
    if (!triggerEl || !previewEl) return;

    const triggerRect = triggerEl.getBoundingClientRect();
    // 量浮层自身必须用 offsetWidth/offsetHeight（布局盒），不能用 getBoundingClientRect：
    // 浮层带 animate-in zoom-in-95，首帧 transform: scale(.95)，而 getBoundingClientRect
    // 返回的是**变换后**的视觉矩形，会量到 95% 尺寸；动画还原到 100% 后底部会多溢出约 5%
    // （320px 高的浮层约 16px）。offsetWidth/offsetHeight 不受 transform 影响。
    const previewWidth = previewEl.offsetWidth;
    const previewHeight = previewEl.offsetHeight;
    // 用 clientWidth/clientHeight 而非 innerWidth/innerHeight，排除滚动条占位
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    /** 把坐标限制在 [SAFE_MARGIN, max] 区间内 */
    const clamp = (value: number, max: number): number =>
      Math.min(Math.max(PREVIEW_SAFE_MARGIN, value), Math.max(PREVIEW_SAFE_MARGIN, max));

    // 纵向：默认在触发元素下方展开；下方放不下则翻到上方；上下都放不下则贴住视口
    let y = triggerRect.bottom + PREVIEW_TRIGGER_OFFSET;
    if (y + previewHeight > viewportHeight - PREVIEW_SAFE_MARGIN) {
      const above = triggerRect.top - PREVIEW_TRIGGER_OFFSET - previewHeight;
      y = above >= PREVIEW_SAFE_MARGIN ? above : viewportHeight - PREVIEW_SAFE_MARGIN - previewHeight;
    }

    // 横向：默认与触发元素左对齐；右侧放不下则改为右对齐
    let x = triggerRect.left;
    if (x + previewWidth > viewportWidth - PREVIEW_SAFE_MARGIN) {
      x = viewportWidth - PREVIEW_SAFE_MARGIN - previewWidth;
    }

    setPosition({
      x: clamp(x, viewportWidth - PREVIEW_SAFE_MARGIN - previewWidth),
      y: clamp(y, viewportHeight - PREVIEW_SAFE_MARGIN - previewHeight),
    });
    setPositioned(true);
  }, [show, content]);

  if (!content) return <>{children}</>;

  // 尺寸上限用与上面 clamp 完全相同的口径（documentElement.clientWidth/Height，
  // 不含经典滚动条）。若这里改用 CSS 的 100vw（含滚动条），两个口径会差一个滚动条
  // 宽度，窄窗口下浮层右边缘会被推出 layout viewport。
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const previewMaxWidth = Math.max(120, Math.min(400, viewportWidth - PREVIEW_SAFE_MARGIN * 2));
  const previewMaxHeight = Math.max(80, Math.min(320, Math.floor(viewportHeight * 0.5)));

  return (
    <div ref={triggerRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} className={`relative ${className}`}>
      {children}
      {show && createPortal(
        <div
          ref={previewRef}
          className="fixed z-[60] overflow-y-auto overscroll-contain p-3 bg-popover border rounded-xl shadow-lg text-sm break-all animate-in fade-in-0 zoom-in-95"
          style={{
            left: position.x,
            top: position.y,
            maxWidth: previewMaxWidth,
            maxHeight: previewMaxHeight,
            visibility: positioned ? 'visible' : 'hidden',
          }}
        >
          {content}
        </div>,
        document.body,
      )}
    </div>
  );
}
