/**
 * 接单人账号资质合规判定规则回归测试
 *
 * 用法（在 server/ 目录下）：npm test
 *
 * 这些规则是「接单账号要求」的核心业务规则：
 *   1. 注册时间一年以上，且完成实名认证
 *   2. 信誉等级 3 心（含）以上
 *   3. 每周收货次数 <= 5 单，每月收货次数 <= 20 单
 * 规则一旦改动，请同步更新本文件的期望值。
 */
import { evaluateTakerCompliance, creditLevelRank, countScreenshots } from '../src/utils/takerCompliance';

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

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

/** 一份全部达标的资质基线 */
const GOOD = {
  registerDate: new Date(now - 500 * DAY),
  isRealNameVerified: true,
  creditLevel: '3心',
  weeklyReceiptCount: 5,
  monthlyReceiptCount: 20,
  screenshotCount: 3,
  accountInfoUpdatedAt: new Date(now - 10 * DAY),
};

console.log('\n=== 1. creditLevelRank 等级映射 ===');
check('1心 = 1', creditLevelRank('1心'), 1);
check('3心 = 3', creditLevelRank('3心'), 3);
check('5心 = 5', creditLevelRank('5心'), 5);
check('1钻 = 6', creditLevelRank('1钻'), 6);
check('5钻 = 10', creditLevelRank('5钻'), 10);
check('1冠 = 11', creditLevelRank('1冠'), 11);
check('5冠 = 15', creditLevelRank('5冠'), 15);
check('空值 = null', creditLevelRank(null), null);
check('非法值 = null', creditLevelRank('9钻'), null);

console.log('\n=== 2. countScreenshots ===');
check(
  '三张齐全 = 3',
  countScreenshots({ avatarScreenshot: 'a', securityScreenshot: 'b', reviewScreenshot: 'c' }),
  3
);
check(
  '两张 = 2',
  countScreenshots({ avatarScreenshot: 'a', securityScreenshot: 'b', reviewScreenshot: null }),
  2
);
check('全空 = 0', countScreenshots({}), 0);

console.log('\n=== 3. 全新接单人（任何资质都没登记）→ 待完善，不能是不合格 ===');
const fresh = evaluateTakerCompliance({
  registerDate: null,
  isRealNameVerified: false,
  creditLevel: null,
  weeklyReceiptCount: null,
  monthlyReceiptCount: null,
  screenshotCount: 0,
  accountInfoUpdatedAt: null,
});
check('status = incomplete', fresh.status, 'incomplete');
check('fails 为空数组（库默认值不算不通过项）', fresh.fails, []);

console.log('\n=== 4. 历史遗留行（截图计数 0、无 accountInfoUpdatedAt）→ 待完善 ===');
const legacy = evaluateTakerCompliance({ isRealNameVerified: false, screenshotCount: 0 });
check('status = incomplete', legacy.status, 'incomplete');
check('fails 为空数组', legacy.fails, []);

console.log('\n=== 5. 全部达标（含边界 周=5 / 月=20）→ 合格 ===');
const good = evaluateTakerCompliance(GOOD);
check('status = qualified', good.status, 'qualified');
check('fails 为空', good.fails, []);
check('registerOverOneYear = true', good.registerOverOneYear, true);
check('screenshotsComplete = true', good.screenshotsComplete, true);
check('weeklyOk = true（边界 5）', good.weeklyOk, true);
check('monthlyOk = true（边界 20）', good.monthlyOk, true);

console.log('\n=== 6. 信誉等级跨界（1钻 → rank 6，应通过）===');
check('1钻 → qualified', evaluateTakerCompliance({ ...GOOD, creditLevel: '1钻' }).status, 'qualified');
check('5冠 → qualified', evaluateTakerCompliance({ ...GOOD, creditLevel: '5冠' }).status, 'qualified');

console.log('\n=== 7. 单项不通过 ===');
check('2心 → 不合格', evaluateTakerCompliance({ ...GOOD, creditLevel: '2心' }).status, 'unqualified');
check('2心 fails', evaluateTakerCompliance({ ...GOOD, creditLevel: '2心' }).fails, ['信誉等级不足3心']);
check('周6 → 不合格', evaluateTakerCompliance({ ...GOOD, weeklyReceiptCount: 6 }).status, 'unqualified');
check('周6 fails', evaluateTakerCompliance({ ...GOOD, weeklyReceiptCount: 6 }).fails, ['每周收货次数超过5单']);
check('月21 → 不合格', evaluateTakerCompliance({ ...GOOD, monthlyReceiptCount: 21 }).status, 'unqualified');
check('月21 fails', evaluateTakerCompliance({ ...GOOD, monthlyReceiptCount: 21 }).fails, ['每月收货次数超过20单']);
check('未实名 fails', evaluateTakerCompliance({ ...GOOD, isRealNameVerified: false }).fails, ['未完成实名认证']);
check(
  '注册 100 天 → 不合格',
  evaluateTakerCompliance({ ...GOOD, registerDate: new Date(now - 100 * DAY) }).status,
  'unqualified'
);
check(
  '注册 100 天 fails',
  evaluateTakerCompliance({ ...GOOD, registerDate: new Date(now - 100 * DAY) }).fails,
  ['注册未满一年']
);
check(
  '注册 366 天 → 合格',
  evaluateTakerCompliance({ ...GOOD, registerDate: new Date(now - 366 * DAY) }).status,
  'qualified'
);

console.log('\n=== 8. 多项同时不通过 → fails 累积 ===');
const multi = evaluateTakerCompliance({
  ...GOOD,
  isRealNameVerified: false,
  creditLevel: '1心',
  weeklyReceiptCount: 9,
  monthlyReceiptCount: 30,
});
check('status = unqualified', multi.status, 'unqualified');
check('fails 四项', multi.fails, [
  '未完成实名认证',
  '信誉等级不足3心',
  '每周收货次数超过5单',
  '每月收货次数超过20单',
]);

console.log('\n=== 9. 部分登记（缺 信誉/周/月）→ 待完善 ===');
const partial = evaluateTakerCompliance({
  registerDate: new Date(now - 500 * DAY),
  isRealNameVerified: true,
  creditLevel: null,
  weeklyReceiptCount: null,
  monthlyReceiptCount: null,
  screenshotCount: 0,
  accountInfoUpdatedAt: new Date(),
});
check('status = incomplete', partial.status, 'incomplete');
check('fails 为空', partial.fails, []);

console.log('\n=== 10. screenshotsComplete 回退：无 screenshotCount 时用三个截图字段算 ===');
check(
  'screenshotsComplete = true（回退计算）',
  evaluateTakerCompliance({
    ...GOOD,
    screenshotCount: undefined,
    avatarScreenshot: 'a',
    securityScreenshot: 'b',
    reviewScreenshot: 'c',
  }).screenshotsComplete,
  true
);
check(
  'screenshotsComplete = false（回退计算）',
  evaluateTakerCompliance({
    ...GOOD,
    screenshotCount: undefined,
    avatarScreenshot: 'a',
    securityScreenshot: null,
    reviewScreenshot: null,
  }).screenshotsComplete,
  false
);

console.log('\n=== 11. registerDate 字符串入参也能解析 ===');
check(
  'ISO 字符串 → registerOverOneYear = true',
  evaluateTakerCompliance({ ...GOOD, registerDate: new Date(now - 800 * DAY).toISOString() })
    .registerOverOneYear,
  true
);
check(
  '非法字符串 → registerOverOneYear = null',
  evaluateTakerCompliance({ ...GOOD, registerDate: 'not-a-date' }).registerOverOneYear,
  null
);

console.log('\n=== 12. F1 回归：全空载荷（前端无条件提交全部字段但为空）不得判为不合格 ===');
// 真实 UI 写入路径：只填微信昵称/微信号，其余资质字段为空，服务端仍会盖 accountInfoUpdatedAt
const emptyButStamped = evaluateTakerCompliance({
  registerDate: null,
  isRealNameVerified: false,
  creditLevel: null,
  weeklyReceiptCount: null,
  monthlyReceiptCount: null,
  screenshotCount: 0,
  accountInfoUpdatedAt: new Date(),
});
check('status = incomplete（不能是 unqualified）', emptyButStamped.status, 'incomplete');
check('fails 为空数组', emptyButStamped.fails, []);

// 只有 wechatName + wechatId 的新增场景（无任何 accountInfoUpdatedAt）
const onlyNames = evaluateTakerCompliance({
  registerDate: null,
  isRealNameVerified: false,
  creditLevel: null,
  weeklyReceiptCount: null,
  monthlyReceiptCount: null,
  screenshotCount: 0,
  accountInfoUpdatedAt: null,
});
check('仅名称新增 → incomplete', onlyNames.status, 'incomplete');
check('仅名称新增 → fails 为空', onlyNames.fails, []);

// 实质性登记但实名选「否」→ 不合格，且仅含实名一项
const substantiveNoRealName = evaluateTakerCompliance({
  registerDate: new Date(now - 500 * DAY),
  isRealNameVerified: false,
  creditLevel: '3心',
  weeklyReceiptCount: 1,
  monthlyReceiptCount: 1,
  screenshotCount: 3,
  accountInfoUpdatedAt: new Date(),
});
check('资质齐全但未实名 → unqualified', substantiveNoRealName.status, 'unqualified');
check('失败项仅「未完成实名认证」', substantiveNoRealName.fails, ['未完成实名认证']);

console.log('\n=== 13. F2 回归：3 张截图未传齐 → 待完善（不是合格，也不是不合格）===');
const dataOnlyNoShots = evaluateTakerCompliance({ ...GOOD, screenshotCount: 0 });
check('数据齐但截图 0/3 → incomplete', dataOnlyNoShots.status, 'incomplete');
check('截图未齐 → fails 为空（不是不合格）', dataOnlyNoShots.fails, []);
check('截图 2/3 → incomplete', evaluateTakerCompliance({ ...GOOD, screenshotCount: 2 }).status, 'incomplete');
check('截图 3/3 → qualified', evaluateTakerCompliance({ ...GOOD, screenshotCount: 3 }).status, 'qualified');

console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
process.exit(failed > 0 ? 1 : 0);
