/**
 * computeVirtualWindow 单元测试（自带断言，零依赖）。
 *
 * 本仓库前端未安装 vitest（见 pages/__tests__/copyToClipboard.test.ts 的同类说明），
 * 故沿用 lib/__tests__/dateInput.test.ts 的「自带断言」独立脚本风格：
 * 直接 import 真实实现（非镜像拷贝），保持 tsc 零报错。
 *
 * 运行（Node 22.18+ 原生支持 TS 类型擦除，无需额外依赖）：
 *   node client/src/lib/__tests__/virtualList.test.ts
 */
import { computeVirtualWindow } from '../virtualList.ts';

let passed = 0;
let failed = 0;

/** 断言工具：失败时打印用例名、期望值与实际值 */
function check(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(
      `  FAIL  ${name}\n        expected=${JSON.stringify(expected)}\n        actual  =${JSON.stringify(actual)}`
    );
  }
}

/** 从窗口结果中抽取会被断言的关键字段，避免依赖对象键顺序 */
function pick(w: {
  startIndex: number;
  endIndex: number;
  padTop: number;
  padBottom: number;
  totalHeight: number;
}): {
  startIndex: number;
  endIndex: number;
  padTop: number;
  padBottom: number;
  totalHeight: number;
} {
  return {
    startIndex: w.startIndex,
    endIndex: w.endIndex,
    padTop: w.padTop,
    padBottom: w.padBottom,
    totalHeight: w.totalHeight,
  };
}

// 1. 空列表：全部归零，不产生 NaN
check(
  '空列表',
  pick(computeVirtualWindow({ itemCount: 0, rowHeight: 44, scrollTop: 0, viewportHeight: 300 })),
  { startIndex: 0, endIndex: 0, padTop: 0, padBottom: 0, totalHeight: 0 }
);

// 2. 顶部：渲染首屏 + 1 行余量，底部占满剩余高度
//    10 行 × 44 = 440；viewport 220 → visibleCount = ceil(220/44)+1 = 6
check(
  '顶部窗口',
  pick(computeVirtualWindow({ itemCount: 10, rowHeight: 44, scrollTop: 0, viewportHeight: 220 })),
  { startIndex: 0, endIndex: 6, padTop: 0, padBottom: 176, totalHeight: 440 }
);

// 3. 底部：scrollTop 被夹到 maxScrollTop，末行恰好落在可视区内，底部占位为 0
//    1000 行 × 44 = 44000；viewport 440 → maxScrollTop = 43560 → firstVisible = 990
check(
  '底部窗口',
  pick(computeVirtualWindow({ itemCount: 1000, rowHeight: 44, scrollTop: 43560, viewportHeight: 440 })),
  { startIndex: 990, endIndex: 1000, padTop: 43560, padBottom: 0, totalHeight: 44000 }
);

// 4. 超出底部最大滚动量：被夹回底部，不得出现 endIndex > itemCount
check(
  'scrollTop 超界夹回底部',
  pick(computeVirtualWindow({ itemCount: 1000, rowHeight: 44, scrollTop: 999999, viewportHeight: 440 })),
  { startIndex: 990, endIndex: 1000, padTop: 43560, padBottom: 0, totalHeight: 44000 }
);

// 5. 负 scrollTop：按 0 处理
check(
  '负 scrollTop 归零',
  pick(computeVirtualWindow({ itemCount: 30, rowHeight: 40, scrollTop: -100, viewportHeight: 200 })),
  { startIndex: 0, endIndex: 6, padTop: 0, padBottom: 960, totalHeight: 1200 }
);

// 6. overscan 缓冲：上下各多渲染 2 行
//    scrollTop=440 → firstVisible=10；viewport 176 → visibleCount = ceil(176/44)+1 = 5
//    start = 10-2 = 8；end = min(100, 10+5+2) = 17
check(
  'overscan 缓冲',
  pick(computeVirtualWindow({ itemCount: 100, rowHeight: 44, scrollTop: 440, viewportHeight: 176, overscan: 2 })),
  { startIndex: 8, endIndex: 17, padTop: 352, padBottom: 3652, totalHeight: 4400 }
);

// 7. 可视区高于列表总高：全量渲染，无占位
check(
  '可视区高于列表',
  pick(computeVirtualWindow({ itemCount: 5, rowHeight: 44, scrollTop: 0, viewportHeight: 600 })),
  { startIndex: 0, endIndex: 5, padTop: 0, padBottom: 0, totalHeight: 220 }
);

// 8. 非法行高（0/NaN）：回退为 1，不产生 NaN / Infinity
check(
  '行高非法回退为 1',
  pick(computeVirtualWindow({ itemCount: 4, rowHeight: 0, scrollTop: 0, viewportHeight: 4 })),
  { startIndex: 0, endIndex: 4, padTop: 0, padBottom: 0, totalHeight: 4 }
);
check(
  '行高 NaN 回退为 1',
  pick(computeVirtualWindow({ itemCount: 4, rowHeight: Number.NaN, scrollTop: 0, viewportHeight: 4 })),
  { startIndex: 0, endIndex: 4, padTop: 0, padBottom: 0, totalHeight: 4 }
);

// 9. itemCount 为 NaN / 负数：归零处理
check(
  'itemCount 非法归零',
  pick(computeVirtualWindow({ itemCount: Number.NaN, rowHeight: 44, scrollTop: 100, viewportHeight: 300 })),
  { startIndex: 0, endIndex: 0, padTop: 0, padBottom: 0, totalHeight: 0 }
);
check(
  'itemCount 负数归零',
  pick(computeVirtualWindow({ itemCount: -7, rowHeight: 44, scrollTop: 100, viewportHeight: 300 })),
  { startIndex: 0, endIndex: 0, padTop: 0, padBottom: 0, totalHeight: 0 }
);

// 10. 不变量：占位之和 + 已渲染区高度 == 总高度（任意位置都成立）
for (const scrollTop of [0, 1, 43, 44, 45, 1000, 5000, 43560]) {
  const w = computeVirtualWindow({ itemCount: 1000, rowHeight: 44, scrollTop, viewportHeight: 440, overscan: 3 });
  const rendered = (w.endIndex - w.startIndex) * 44;
  check(
    `占位守恒 scrollTop=${scrollTop}`,
    w.padTop + rendered + w.padBottom,
    w.totalHeight
  );
  check(
    `区间合法 scrollTop=${scrollTop}`,
    0 <= w.startIndex && w.startIndex <= w.endIndex && w.endIndex <= 1000,
    true
  );
}

console.log(`virtualList: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
