/**
 * parseExcelDate 日期解析回归测试
 *
 * 用法（在 server/ 目录下）：npm test
 *
 * 重点覆盖 Excel 日期序列号分支：旧实现用本地纪元（new Date(1900, 0, 1)）导致
 * 在 Asia/Shanghai 等时区下日期早 1 天。此处以「本地日历日」为判定口径，
 * 保证任何时区下解析结果的日期部分都等于 Excel 中的日期。
 */
import { parseExcelDate } from '../src/utils/parseExcelDate';

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(
      `  FAIL  ${name}\n        expected=${JSON.stringify(expected)}\n        actual  =${JSON.stringify(actual)}`
    );
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 取本地日历日 YYYY-MM-DD（Excel 序列号分支的结果即本地日期） */
function ymd(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

console.log('\n=== 1. Excel 序列号锚点（不得早 1 天）===');
check('44562 → 2022-01-01', ymd(parseExcelDate(44562)), '2022-01-01');
check('44561 → 2021-12-31', ymd(parseExcelDate(44561)), '2021-12-31');
check('25569 → 1970-01-01', ymd(parseExcelDate(25569)), '1970-01-01');
check('2 → 1900-01-01', ymd(parseExcelDate(2)), '1900-01-01');

console.log('\n=== 2. 边界与非法输入 ===');
check('空字符串 → null', parseExcelDate(''), null);
check('null → null', parseExcelDate(null), null);
check('undefined → null', parseExcelDate(undefined), null);
check('NaN 数字 → null', parseExcelDate(NaN), null);
check('Infinity → null', parseExcelDate(Infinity), null);
check('非法字符串 → null', parseExcelDate('not-a-date'), null);

console.log('\n=== 3. 字符串 / Date 分支保持原语义 ===');
const iso = parseExcelDate('2022-01-01');
check('ISO 字符串解析成功', iso instanceof Date && !isNaN(iso.getTime()), true);
check(
  'ISO 字符串日期正确',
  iso ? `${iso.getUTCFullYear()}-${pad(iso.getUTCMonth() + 1)}-${pad(iso.getUTCDate())}` : null,
  '2022-01-01'
);
const inst = new Date(2022, 5, 15);
check('Date 实例原样返回', parseExcelDate(inst) === inst, true);

console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
process.exit(failed > 0 ? 1 : 0);
