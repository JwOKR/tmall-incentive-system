/**
 * Standalone test for sortData logic (mirrors ColumnFilter.tsx sortData)
 * Run with: node src/components/__tests__/sortData.standalone.test.mjs
 */

// --- Mirror of sortData from ColumnFilter.tsx ---
function sortData(data, config, getField) {
  if (!config) return data;
  const { field, direction } = config;
  const sorted = [...data].sort((a, b) => {
    const aVal = getField(a, field);
    const bVal = getField(b, field);
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    }
    const aStr = String(aVal ?? '').toLowerCase();
    const bStr = String(bVal ?? '').toLowerCase();
    if (aStr < bStr) return direction === 'asc' ? -1 : 1;
    if (aStr > bStr) return direction === 'asc' ? 1 : -1;
    return 0;
  });
  return sorted;
}

// --- Mirror of getUniqueValues from Orders.tsx ---
function getUniqueValues(orders, field) {
  const values = orders.map((o) => {
    if (field === 'wechatName') return o.taker?.wechatName || '';
    if (field === 'wechatId') return o.taker?.wechatId || '';
    return String(o[field] ?? '');
  }).filter(Boolean);
  return [...new Set(values)].map(v => ({ value: v, label: v }));
}

// --- Mirror of handleSort state machine from Orders.tsx ---
function handleSort(prev, field) {
  if (!prev || prev.field !== field) return { field, direction: 'asc' };
  if (prev.direction === 'asc') return { field, direction: 'desc' };
  return null;
}

// --- Test data ---
const testOrders = [
  { id: '1', orderDate: '2025-01-03', actualPayment: 150, baseCommission: 20, remark: 'banana', taker: { wechatName: 'Zoe', wechatId: 'zoe123' } },
  { id: '2', orderDate: '2025-01-01', actualPayment: 300, baseCommission: 50, remark: 'apple', taker: { wechatName: 'Alice', wechatId: 'alice456' } },
  { id: '3', orderDate: '2025-01-02', actualPayment: 100, baseCommission: 10, remark: 'cherry', taker: { wechatName: 'Bob', wechatId: 'bob789' } },
  { id: '4', orderDate: '2025-01-01', actualPayment: 200, baseCommission: 30, remark: '', taker: { wechatName: 'Alice', wechatId: 'alice456' } },
];

const getField = (item, key) => {
  if (key === 'wechatName') return item.taker?.wechatName || '';
  if (key === 'wechatId') return item.taker?.wechatId || '';
  return item[key];
};

// --- Test runner ---
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.log(`  FAIL: ${message}`);
    failed++;
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson === expectedJson) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.log(`  FAIL: ${message}`);
    console.log(`    Expected: ${expectedJson}`);
    console.log(`    Actual:   ${actualJson}`);
    failed++;
  }
}

// =====================
// TESTS
// =====================

console.log('\n=== sortData Tests ===\n');

// Test 1: config null returns original array
console.log('Test 1: config null returns original array');
const result1 = sortData(testOrders, null, getField);
assertDeepEqual(result1.map(o => o.id), ['1', '2', '3', '4'], 'null config returns original order');

// Test 2: numeric ascending sort
console.log('\nTest 2: numeric ascending sort (actualPayment)');
const result2 = sortData(testOrders, { field: 'actualPayment', direction: 'asc' }, getField);
assertDeepEqual(result2.map(o => o.actualPayment), [100, 150, 200, 300], 'asc sort by actualPayment');

// Test 3: numeric descending sort
console.log('\nTest 3: numeric descending sort (actualPayment)');
const result3 = sortData(testOrders, { field: 'actualPayment', direction: 'desc' }, getField);
assertDeepEqual(result3.map(o => o.actualPayment), [300, 200, 150, 100], 'desc sort by actualPayment');

// Test 4: string ascending sort
console.log('\nTest 4: string ascending sort (remark)');
const result4 = sortData(testOrders, { field: 'remark', direction: 'asc' }, getField);
assertDeepEqual(result4.map(o => o.remark), ['', 'apple', 'banana', 'cherry'], 'asc sort by remark (empty first)');

// Test 5: string descending sort
console.log('\nTest 5: string descending sort (remark)');
const result5 = sortData(testOrders, { field: 'remark', direction: 'desc' }, getField);
assertDeepEqual(result5.map(o => o.remark), ['cherry', 'banana', 'apple', ''], 'desc sort by remark (empty last)');

// Test 6: date string sort
console.log('\nTest 6: date string sort (orderDate asc)');
const result6 = sortData(testOrders, { field: 'orderDate', direction: 'asc' }, getField);
assertDeepEqual(result6.map(o => o.orderDate), ['2025-01-01', '2025-01-01', '2025-01-02', '2025-01-03'], 'asc sort by orderDate');

// Test 7: nested field sort (wechatName)
console.log('\nTest 7: nested field sort (wechatName asc)');
const result7 = sortData(testOrders, { field: 'wechatName', direction: 'asc' }, getField);
assertDeepEqual(result7.map(o => o.taker.wechatName), ['Alice', 'Alice', 'Bob', 'Zoe'], 'asc sort by wechatName');

// Test 8: does not mutate original array
console.log('\nTest 8: does not mutate original array');
const original = [...testOrders];
sortData(testOrders, { field: 'actualPayment', direction: 'asc' }, getField);
assertDeepEqual(testOrders.map(o => o.id), original.map(o => o.id), 'original array unchanged after sort');

// Test 9: case insensitive string sort
console.log('\nTest 9: case insensitive string sort');
const caseTestData = [
  { id: '1', name: 'Banana' },
  { id: '2', name: 'apple' },
  { id: '3', name: 'Cherry' },
];
const caseGetField = (item, key) => item[key];
const result9 = sortData(caseTestData, { field: 'name', direction: 'asc' }, caseGetField);
assertDeepEqual(result9.map(o => o.name), ['apple', 'Banana', 'Cherry'], 'case insensitive asc sort');

// Test 10: undefined/null values
console.log('\nTest 10: undefined/null values in sort');
const nullTestData = [
  { id: '1', val: 100 },
  { id: '2', val: null },
  { id: '3', val: 50 },
  { id: '4', val: undefined },
];
const nullGetField = (item, key) => item[key];
const result10 = sortData(nullTestData, { field: 'val', direction: 'asc' }, nullGetField);
// null and undefined both become '' via String(val ?? ''), so they are equal.
// Stable sort preserves original array order between equal elements (id '2' before id '4').
assertDeepEqual(result10.map(o => o.id), ['2', '4', '3', '1'], 'null/undefined treated as empty string, sorted first (stable)');

console.log('\n=== handleSort Three-State Tests ===\n');

// Test 11: first click -> asc
console.log('Test 11: first click -> asc');
let sortConfig = null;
sortConfig = handleSort(sortConfig, 'actualPayment');
assertDeepEqual(sortConfig, { field: 'actualPayment', direction: 'asc' }, 'first click sets asc');

// Test 12: second click same column -> desc
console.log('\nTest 12: second click same column -> desc');
sortConfig = handleSort(sortConfig, 'actualPayment');
assertDeepEqual(sortConfig, { field: 'actualPayment', direction: 'desc' }, 'second click sets desc');

// Test 13: third click same column -> null
console.log('\nTest 13: third click same column -> null');
sortConfig = handleSort(sortConfig, 'actualPayment');
assertDeepEqual(sortConfig, null, 'third click resets to null');

// Test 14: click different column -> asc
console.log('\nTest 14: click different column -> asc');
sortConfig = handleSort(null, 'actualPayment');
sortConfig = handleSort(sortConfig, 'remark');
assertDeepEqual(sortConfig, { field: 'remark', direction: 'asc' }, 'different column sets asc');

// Test 15: full cycle null -> asc -> desc -> null -> asc
console.log('\nTest 15: full cycle null -> asc -> desc -> null -> asc');
sortConfig = null;
sortConfig = handleSort(sortConfig, 'orderDate');
assertDeepEqual(sortConfig, { field: 'orderDate', direction: 'asc' }, 'step 1: asc');
sortConfig = handleSort(sortConfig, 'orderDate');
assertDeepEqual(sortConfig, { field: 'orderDate', direction: 'desc' }, 'step 2: desc');
sortConfig = handleSort(sortConfig, 'orderDate');
assertDeepEqual(sortConfig, null, 'step 3: null');
sortConfig = handleSort(sortConfig, 'orderDate');
assertDeepEqual(sortConfig, { field: 'orderDate', direction: 'asc' }, 'step 4: asc again');

console.log('\n=== getUniqueValues Tests ===\n');

// Test 16: getUniqueValues for regular field
console.log('Test 16: getUniqueValues for orderDate');
const uv1 = getUniqueValues(testOrders, 'orderDate');
assertDeepEqual(uv1, [
  { value: '2025-01-03', label: '2025-01-03' },
  { value: '2025-01-01', label: '2025-01-01' },
  { value: '2025-01-02', label: '2025-01-02' },
], 'unique orderDate values extracted');

// Test 17: getUniqueValues for nested field (wechatName)
console.log('\nTest 17: getUniqueValues for wechatName (nested)');
const uv2 = getUniqueValues(testOrders, 'wechatName');
assertDeepEqual(uv2, [
  { value: 'Zoe', label: 'Zoe' },
  { value: 'Alice', label: 'Alice' },
  { value: 'Bob', label: 'Bob' },
], 'unique wechatName values (deduplicated Alice)');

// Test 18: getUniqueValues filters out empty/falsy values
console.log('\nTest 18: getUniqueValues filters empty values (remark)');
const uv3 = getUniqueValues(testOrders, 'remark');
assertDeepEqual(uv3, [
  { value: 'banana', label: 'banana' },
  { value: 'apple', label: 'apple' },
  { value: 'cherry', label: 'cherry' },
], 'empty remark filtered out');

// Test 19: getUniqueValues for numeric field converts to string
console.log('\nTest 19: getUniqueValues for numeric field (actualPayment)');
const uv4 = getUniqueValues(testOrders, 'actualPayment');
assertDeepEqual(uv4, [
  { value: '150', label: '150' },
  { value: '300', label: '300' },
  { value: '100', label: '100' },
  { value: '200', label: '200' },
], 'numeric values converted to string');

console.log('\n=== Combined Filter + Sort Tests ===\n');

// Test 20: filter then sort
console.log('Test 20: filter then sort (simulate filteredOrders -> sortedOrders)');
const filters = { wechatName: 'alice' };
const filtered = testOrders.filter(o => {
  return o.taker?.wechatName?.toLowerCase().includes('alice');
});
const sorted = sortData(filtered, { field: 'actualPayment', direction: 'asc' }, getField);
assertDeepEqual(sorted.map(o => o.id), ['4', '2'], 'filter by alice, sort by actualPayment asc');

// =====================
// SUMMARY
// =====================
console.log('\n=========================');
console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('=========================');
process.exit(failed > 0 ? 1 : 0);
