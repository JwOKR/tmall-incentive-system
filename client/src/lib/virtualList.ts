/**
 * 手写、零依赖的列表窗口化（虚拟滚动）计算工具（P1-11）。
 *
 * 设计目标：
 *  - 纯函数，不引入任何第三方依赖，便于单测与跨页复用；
 *  - 只负责「给定滚动位置，应渲染哪一段行、上下各留多高占位」这一纯计算，
 *    不涉及 DOM / React；滚动容器与占位行的渲染由调用方页面负责。
 *
 * 用法约定（重要）：
 *  - 行高固定时（配合单元格 truncate / whitespace-nowrap 裁成单行）占位精确；
 *  - 若行高不固定，请传入「行高上界」，否则占位高度与实际不符会导致滚动跳跃。
 */

/** 窗口化计算结果 */
export interface VirtualWindow {
  /** 应渲染的起始行下标（含） */
  startIndex: number;
  /** 应渲染的结束行下标（不含） */
  endIndex: number;
  /** 顶部占位高度（px），≈ startIndex * rowHeight */
  padTop: number;
  /** 底部占位高度（px），≈ 未渲染行数 * rowHeight */
  padBottom: number;
  /** 全部行的理论总高度（px） */
  totalHeight: number;
}

/** 窗口化计算入参 */
export interface VirtualWindowParams {
  /** 总行数 */
  itemCount: number;
  /** 单行高度（px，须为正数；非法值按 1 处理） */
  rowHeight: number;
  /** 滚动容器当前 scrollTop（px） */
  scrollTop: number;
  /** 滚动容器可视高度（px） */
  viewportHeight: number;
  /** 可视区上下各额外渲染的缓冲行数，默认 0 */
  overscan?: number;
}

/**
 * 计算当前应渲染的行区间与上下占位高度。
 *
 * 所有输入都会被规整（负数归零、非法行高回退为 1、scrollTop 会被夹到
 * [0, totalHeight - viewportHeight]），保证返回值永远可用、不出现 NaN。
 *
 * @param params 计算入参
 * @returns 窗口信息（startIndex/endIndex/padTop/padBottom/totalHeight）
 */
export function computeVirtualWindow(params: VirtualWindowParams): VirtualWindow {
  const rawCount = Math.floor(params.itemCount);
  const itemCount = Number.isFinite(rawCount) && rawCount > 0 ? rawCount : 0;
  const rowHeight = Number.isFinite(params.rowHeight) && params.rowHeight > 0 ? params.rowHeight : 1;
  const rawOverscan = Math.floor(params.overscan ?? 0);
  const overscan = Number.isFinite(rawOverscan) && rawOverscan > 0 ? rawOverscan : 0;
  const totalHeight = itemCount * rowHeight;

  if (itemCount === 0) {
    return { startIndex: 0, endIndex: 0, padTop: 0, padBottom: 0, totalHeight: 0 };
  }

  const viewportHeight =
    Number.isFinite(params.viewportHeight) && params.viewportHeight > 0 ? params.viewportHeight : rowHeight;
  const maxScrollTop = Math.max(0, totalHeight - viewportHeight);
  const rawScrollTop = params.scrollTop;
  const scrollTop = Math.min(Math.max(0, Number.isFinite(rawScrollTop) ? rawScrollTop : 0), maxScrollTop);

  const firstVisible = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + 1;

  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(itemCount, firstVisible + visibleCount + overscan);

  const padTop = startIndex * rowHeight;
  const padBottom = Math.max(0, totalHeight - endIndex * rowHeight);

  return { startIndex, endIndex, padTop, padBottom, totalHeight };
}
