/**
 * 接单人账号资质合规判定规则回归测试
 *
 * 用法（在 server/ 目录下）：npm test
 *
 * 这些规则是「接单账号要求」的核心业务规则：
 *   1. 注册时间一年以上
 *   2. 完成实名认证
 *   3. 信誉等级 3 心（含）以上
 * 每周 / 每月收货次数已降级为「参考信息」：照常登记与展示，超限时仅标红提醒，
 * 既不产生 fails，也不造成「待完善」。另需上传的 3 张资质截图同样不参与判定。
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
// 周 / 月收货次数已降级为参考项：超限时仍返回 weeklyOk / monthlyOk = false 供前端标红，
// 但不再产生 fails、不再改变 status
check('周6 → 仍为合格（周收货不参与判定）', evaluateTakerCompliance({ ...GOOD, weeklyReceiptCount: 6 }).status, 'qualified');
check('周6 fails 为空', evaluateTakerCompliance({ ...GOOD, weeklyReceiptCount: 6 }).fails, []);
check('周6 weeklyOk = false（仅展示标红）', evaluateTakerCompliance({ ...GOOD, weeklyReceiptCount: 6 }).weeklyOk, false);
check('月21 → 仍为合格（月收货不参与判定）', evaluateTakerCompliance({ ...GOOD, monthlyReceiptCount: 21 }).status, 'qualified');
check('月21 fails 为空', evaluateTakerCompliance({ ...GOOD, monthlyReceiptCount: 21 }).fails, []);
check('月21 monthlyOk = false（仅展示标红）', evaluateTakerCompliance({ ...GOOD, monthlyReceiptCount: 21 }).monthlyOk, false);
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

console.log('\n=== 8. 多项同时不通过 → fails 累积（周/月超限已不计入）===');
const multi = evaluateTakerCompliance({
  ...GOOD,
  isRealNameVerified: false,
  creditLevel: '1心',
  weeklyReceiptCount: 9,
  monthlyReceiptCount: 30,
});
check('status = unqualified', multi.status, 'unqualified');
check('fails 仅两项核心（周9 / 月30 不再计入）', multi.fails, [
  '未完成实名认证',
  '信誉等级不足3心',
]);
check('weeklyOk = false（仍返回，供展示标红）', multi.weeklyOk, false);
check('monthlyOk = false（仍返回，供展示标红）', multi.monthlyOk, false);

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

console.log('\n=== 13. 截图不参与「合格」判定（回归保护，防止将来再被加回）===');
// 用户决策：截图是证据类材料，Excel 批量导入必然为空，纳入判定会导致批量导入恒为「待完善」。
// screenshotsComplete 字段仍返回（前端展示「截图 x/3」用），只是不影响 status。
check('数据齐但截图 0/3 → qualified', evaluateTakerCompliance({ ...GOOD, screenshotCount: 0 }).status, 'qualified');
check('截图 2/3 → qualified', evaluateTakerCompliance({ ...GOOD, screenshotCount: 2 }).status, 'qualified');
check('截图 3/3 → qualified', evaluateTakerCompliance({ ...GOOD, screenshotCount: 3 }).status, 'qualified');
check(
  'screenshotsComplete 仍正确返回 false（0/3，仅展示用）',
  evaluateTakerCompliance({ ...GOOD, screenshotCount: 0 }).screenshotsComplete,
  false
);
check(
  'screenshotsComplete 仍正确返回 true（3/3）',
  evaluateTakerCompliance({ ...GOOD, screenshotCount: 3 }).screenshotsComplete,
  true
);
check(
  '数据齐 + 3/3 + 实名否 → unqualified（截图不豁免实名硬门槛）',
  evaluateTakerCompliance({ ...GOOD, isRealNameVerified: false }).status,
  'unqualified'
);

console.log('\n=== 14. 判定只看三项核心（注册时间 / 实名 / 信誉等级），周月收货次数仅作参考 ===');
/** 三项核心全达标；截图为 0（截图不参与判定） */
const CORE = {
  registerDate: new Date(now - 500 * DAY),
  isRealNameVerified: true,
  creditLevel: '3心',
  screenshotCount: 0,
};

// 14.1 三项核心全达标 + 周 / 月双双超出参考上限 → 仍判合格，但 weeklyOk / monthlyOk 返回 false 供标红
const overLimit = evaluateTakerCompliance({
  ...CORE,
  weeklyReceiptCount: 8,
  monthlyReceiptCount: 30,
});
check('周月超限 → status 仍为 qualified', overLimit.status, 'qualified');
check('周月超限 → fails 为空', overLimit.fails, []);
check('周月超限 → weeklyOk = false（供前端标红）', overLimit.weeklyOk, false);
check('周月超限 → monthlyOk = false（供前端标红）', overLimit.monthlyOk, false);
check('周月超限 → fails 不含「每周」', overLimit.fails.some(f => f.includes('每周')), false);
check('周月超限 → fails 不含「每月」', overLimit.fails.some(f => f.includes('每月')), false);

// 14.2 三项核心全达标 + 周 / 月未登记（null）→ 合格，且不再因周月缺失而变成「待完善」
const noReceipt = evaluateTakerCompliance({
  ...CORE,
  weeklyReceiptCount: null,
  monthlyReceiptCount: null,
});
check('周月未登记 → status 仍为 qualified', noReceipt.status, 'qualified');
check('周月未登记 → weeklyOk = null', noReceipt.weeklyOk, null);
check('周月未登记 → monthlyOk = null', noReceipt.monthlyOk, null);

// 14.3 回归：周 / 月正常取值 → 仍合格
const normalReceipt = evaluateTakerCompliance({
  ...CORE,
  weeklyReceiptCount: 5,
  monthlyReceiptCount: 20,
});
check('周月正常 → status = qualified', normalReceipt.status, 'qualified');
check('周月正常 → weeklyOk = true', normalReceipt.weeklyOk, true);
check('周月正常 → monthlyOk = true', normalReceipt.monthlyOk, true);

// 14.4 只填了周 / 月、三项核心全空 → 不能算「登记过资质」，判待完善且 fails 为空
const onlyReceipt = evaluateTakerCompliance({
  registerDate: null,
  isRealNameVerified: false,
  creditLevel: null,
  weeklyReceiptCount: 3,
  monthlyReceiptCount: 10,
  screenshotCount: 0,
});
check('只填周月 → status = incomplete', onlyReceipt.status, 'incomplete');
check('只填周月 → fails 为空', onlyReceipt.fails, []);

// 14.5 三项核心全空（从未登记）→ 待完善
const coreEmpty = evaluateTakerCompliance({
  registerDate: null,
  isRealNameVerified: false,
  creditLevel: null,
  weeklyReceiptCount: null,
  monthlyReceiptCount: null,
  screenshotCount: 0,
});
check('三项核心全空 → status = incomplete', coreEmpty.status, 'incomplete');
check('三项核心全空 → fails 为空', coreEmpty.fails, []);

// 14.6 注册时间 + 信誉等级已登记、实名选「否」→ 不合格，且 fails 恰为实名一项
const realNameNo = evaluateTakerCompliance({ ...CORE, isRealNameVerified: false });
check('已登记 + 实名否 → status = unqualified', realNameNo.status, 'unqualified');
check('已登记 + 实名否 → fails 恰为「未完成实名认证」', realNameNo.fails, ['未完成实名认证']);

// 14.7 三项核心中任一项未填写 + 实名「是」→ 待完善（实名不进 missingRequired）
check(
  '注册时间为空 + 实名是 → incomplete',
  evaluateTakerCompliance({ ...CORE, registerDate: null }).status,
  'incomplete'
);
check(
  '信誉等级为空 + 实名是 → incomplete',
  evaluateTakerCompliance({ ...CORE, creditLevel: null }).status,
  'incomplete'
);

// 14.8 核心项不通过仍然照常判不合格（周月正常取值不影响）
const shortRegister = evaluateTakerCompliance({
  ...CORE,
  registerDate: new Date(now - 100 * DAY),
  weeklyReceiptCount: 5,
  monthlyReceiptCount: 20,
});
check('注册未满一年 → status = unqualified', shortRegister.status, 'unqualified');
check('注册未满一年 → fails 含「注册未满一年」', shortRegister.fails.includes('注册未满一年'), true);

const lowCredit = evaluateTakerCompliance({
  ...CORE,
  creditLevel: '1心',
  weeklyReceiptCount: 5,
  monthlyReceiptCount: 20,
});
check('信誉 1心 → status = unqualified', lowCredit.status, 'unqualified');
check('信誉 1心 → fails 含「信誉等级不足3心」', lowCredit.fails.includes('信誉等级不足3心'), true);

console.log(`\n========== 结果：PASS=${passed}  FAIL=${failed} ==========`);
process.exit(failed > 0 ? 1 : 0);
