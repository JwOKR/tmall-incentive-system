/**
 * parseFlexibleDate / parseFlexibleDateDetail 单元测试（自带断言，零依赖）
 *
 * 覆盖：支持的各类手写格式、日缺省按 1 日、补零规范、
 * 月份/天数/闰年合法性校验，以及非法输入返回 null。
 *
 * 说明：本仓库前端未安装 vitest（见 copyToClipboard.test.ts 的同类说明），
 * 故此测试写成「自带断言」的独立脚本，不 import vitest，保持 tsc 零报错；
 * 待后续引入 vitest 时可平滑改为 describe/it 形式。
 *
 * 手动运行（在 server/ 目录复用其 ts-node；client 为 ESM 包，
 * 相对导入需带 .ts 扩展名，tsconfig 已开启 allowImportingTsExtensions）：
 *   node node_modules/ts-node/dist/bin.js --transpile-only ../client/src/lib/__tests__/dateInput.test.ts
 */
import { parseFlexibleDate, parseFlexibleDateDetail } from '../dateInput.ts';

let passed = 0;
let failed = 0;

/** 断言工具：与 server/tests 风格一致，失败时打印期望/实际 */
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

// 场景 1：完整日期格式（个位月/日补零）
const fullCases: [string, string][] = [
  ['2024-05-01', '2024-05-01'],
  ['2024-5-1', '2024-05-01'],
  ['2024/5/1', '2024-05-01'],
  ['2024.5.1', '2024-05-01'],
  ['2024年5月1日', '2024-05-01'],
  ['20240501', '2024-05-01'],
];
fullCases.forEach(([input, expected]) =>
  check(`parseFlexibleDate(${JSON.stringify(input)})`, parseFlexibleDate(input), expected)
);

// 场景 2：前后空白自动 trim
check('parseFlexibleDate(前后空白 trim)', parseFlexibleDate('  2024-05-01 '), '2024-05-01');

// 场景 3：只到月的格式（日缺省按 1 日）
const monthOnlyCases: [string, string][] = [
  ['2024-05', '2024-05-01'],
  ['2024/5', '2024-05-01'],
  ['2024.05', '2024-05-01'],
  ['2024年5月', '2024-05-01'],
  ['202405', '2024-05-01'],
];
monthOnlyCases.forEach(([input, expected]) =>
  check(`parseFlexibleDate(只到月 ${JSON.stringify(input)})`, parseFlexibleDate(input), expected)
);

// 场景 4：合法性校验（闰年）
check('parseFlexibleDate(2024-02-29 闰年合法)', parseFlexibleDate('2024-02-29'), '2024-02-29');
check('parseFlexibleDate(20240229 闰年合法)', parseFlexibleDate('20240229'), '2024-02-29');

// 场景 5：合法性校验（平年 2/29、月/日越界、天数越界）
const illegalCases: string[] = [
  '2023-02-29', // 平年无 2 月 29 日
  '2023/2/29',
  '2024-13-01', // 月份越界
  '2024-00-10',
  '2024-05-00',
  '2024-05-32',
  '2024-06-31', // 6 月只有 30 天
  '2024年13月1日',
];
illegalCases.forEach((input) =>
  check(`parseFlexibleDate(${JSON.stringify(input)}) 应为 null`, parseFlexibleDate(input), null)
);

// 场景 6：非法 / 无法解析输入
const unparsableCases: string[] = [
  '202405011', // 9 位数字
  '20240', // 5 位数字
  '24-5-1', // 年份不足 4 位
  'abc',
  '2024-05-01T10:00',
  '',
  '   ',
];
unparsableCases.forEach((input) =>
  check(`parseFlexibleDate(${JSON.stringify(input)}) 应为 null`, parseFlexibleDate(input), null)
);

// 场景 7：parseFlexibleDateDetail - dayMissing 标记
check('detail(2024-05-01) 完整日期不标记缺日', parseFlexibleDateDetail('2024-05-01'), {
  date: '2024-05-01',
  dayMissing: false,
});
check('detail(2024年5月1日) 完整日期不标记缺日', parseFlexibleDateDetail('2024年5月1日'), {
  date: '2024-05-01',
  dayMissing: false,
});
check('detail(2024-05) 标记缺日', parseFlexibleDateDetail('2024-05'), {
  date: '2024-05-01',
  dayMissing: true,
});
check('detail(202405) 标记缺日', parseFlexibleDateDetail('202405'), {
  date: '2024-05-01',
  dayMissing: true,
});
check('detail(2024年5月) 标记缺日', parseFlexibleDateDetail('2024年5月'), {
  date: '2024-05-01',
  dayMissing: true,
});
check('detail(2024-13-01) 不合法返回 null', parseFlexibleDateDetail('2024-13-01'), null);

console.log(`\n========== dateInput 结果：PASS=${passed}  FAIL=${failed} ==========`);
if (failed > 0) {
  throw new Error(`dateInput 单元测试存在 ${failed} 个失败用例`);
}
