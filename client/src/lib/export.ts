import * as XLSX from 'xlsx';

export interface ExportColumn {
  key: string;
  label: string;
  selected?: boolean;
}

interface ExportOptions {
  filename: string;
  columns: ExportColumn[];
  data: any[];
}

// 默认列配置
export const takerColumns: ExportColumn[] = [
  { key: 'wechatName', label: '微信昵称', selected: true },
  { key: 'wechatId', label: '微信号', selected: true },
  { key: 'taobaoNickname', label: '淘宝昵称', selected: true },
  { key: 'status', label: '状态', selected: true },
  { key: 'totalOrders', label: '总订单', selected: true },
  { key: 'totalAmount', label: '总金额', selected: true },
  { key: 'createdAt', label: '创建时间', selected: true },
  { key: 'registerDate', label: '注册时间', selected: true },
  { key: 'isRealNameVerified', label: '实名认证', selected: true },
  { key: 'creditLevel', label: '信誉等级', selected: true },
  { key: 'weeklyReceiptCount', label: '每周收货次数', selected: true },
  { key: 'monthlyReceiptCount', label: '每月收货次数', selected: true },
];

export const taskColumns: ExportColumn[] = [
  { key: 'productId', label: '商品ID', selected: true },
  { key: 'productCode', label: '产品编号', selected: true },
  { key: 'taoToken', label: '淘口令', selected: true },
  { key: 'price', label: '商品价格', selected: true },
  { key: 'baseCommission', label: '基础返佣', selected: true },
  { key: 'reviewReward', label: '好评返佣', selected: true },
  { key: 'maxOrders', label: '限接人数', selected: true },
  { key: 'currentOrders', label: '已接人数', selected: true },
  { key: 'status', label: '状态', selected: true },
  { key: 'publishDate', label: '发布日期', selected: true },
  { key: 'deadline', label: '截止日期', selected: true }, // P2-5 任务超时提醒
];

export const orderColumns: ExportColumn[] = [
  { key: 'orderDate', label: '接单日期', selected: true },
  { key: 'taker.wechatName', label: '微信昵称', selected: true },
  { key: 'taker.wechatId', label: '微信号', selected: true },
  { key: 'taker.taobaoNickname', label: '淘宝昵称', selected: true },
  { key: 'totalRefund', label: '总返款', selected: true },
  { key: 'isRefunded', label: '是否已返款', selected: true },
  { key: 'refundDate', label: '返款日期', selected: true },
  { key: 'productId', label: '商品ID', selected: true },
  { key: 'productCode', label: '产品编号', selected: true },
  { key: 'orderNo19', label: '19订单号', selected: true },
  { key: 'orderNo', label: '订单编号', selected: true },
  { key: 'orderLink', label: '订单链接', selected: true },
  { key: 'actualPayment', label: '实付', selected: true },
  { key: 'isGoodReview', label: '是否好评', selected: true },
  { key: 'drawingDate', label: '作图时间', selected: true },
  { key: 'baseCommission', label: '基础返佣', selected: true },
  { key: 'isBaseCommissionRefunded', label: '基础返佣已返款', selected: true },
  { key: 'reviewCommission', label: '好评返佣', selected: true },
  { key: 'reviewCommissionDate', label: '好评返佣日期', selected: true },
  { key: 'remark', label: '备注', selected: true },
];

export const repeatDiscountColumns: ExportColumn[] = [
  { key: 'recordDate', label: '日期', selected: true },
  { key: 'grantAmount', label: '发放金额（元）', selected: true },
  { key: 'paymentAmount', label: '支付金额（元）', selected: true },
  { key: 'paymentBuyers', label: '支付买家数（人）', selected: true },
  { key: 'paymentItems', label: '支付件数（件）', selected: true },
];

export const logColumns: ExportColumn[] = [
  { key: 'createdAt', label: '时间', selected: true },
  { key: 'user.username', label: '操作用户', selected: true },
  { key: 'action', label: '操作类型', selected: true },
  { key: 'detail', label: '详细信息', selected: true },
  { key: 'order.orderNo', label: '关联订单', selected: true },
  { key: 'ipAddress', label: 'IP地址', selected: true },
];

// 获取嵌套对象的值
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/** 本地日期 YYYY-MM-DD（避免 toISOString() 的 UTC 跨日偏移：东八区凌晨 0–8 点会得到前一天） */
export function localDateStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 分页循环拉取：每页条数（替代一次性 pageSize: 10000，降低单请求内存并解除 1 万行静默截断） */
export const EXPORT_PAGE_SIZE = 500;

/** 分页循环拉取的安全页数上限（防止接口异常导致死循环；500×200 = 10 万行封顶） */
export const EXPORT_MAX_PAGES = 200;

export interface PagedResult {
  list: any[];
  total?: number;
}

/**
 * 分页循环拉取全部数据。
 *
 * 终止条件（任一满足即停）：
 *  1. 某页返回 0 条；
 *  2. 响应带 total 且累计条数 ≥ total；
 *  3. 响应无 total 且某页条数 < pageSize；
 *  4. 达到 maxPages 安全上限。
 *
 * 用 total 兜底而非只看「本页不足 pageSize」，是为了兼容服务端对 pageSize 做钳制的情况
 * （钳制时「本页不足 pageSize」会误判为取完而静默截断）。
 */
export async function fetchAllPages(
  fetchPage: (page: number) => Promise<PagedResult | undefined | null>,
  options?: { pageSize?: number; maxPages?: number }
): Promise<any[]> {
  const pageSize = options?.pageSize ?? EXPORT_PAGE_SIZE;
  const maxPages = options?.maxPages ?? EXPORT_MAX_PAGES;
  const all: any[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchPage(page);
    const list = Array.isArray(res?.list) ? res.list : [];
    const total = typeof res?.total === 'number' ? res.total : undefined;
    all.push(...list);
    if (list.length === 0) break;
    if (total !== undefined && all.length >= total) break;
    if (total === undefined && list.length < pageSize) break;
  }

  return all;
}

/** 各 sheet 的列配置（key 与 ExportPage 的 SHEETS 对应） */
export const sheetColumnMap: Record<string, ExportColumn[]> = {
  takers: takerColumns,
  tasks: taskColumns,
  orders: orderColumns,
  repeatDiscounts: repeatDiscountColumns,
  logs: logColumns,
};

/** 按 key 白名单筛选列（保持原有列顺序；默认全选时传入全部 key） */
export function pickColumns(all: ExportColumn[], selectedKeys: string[]): ExportColumn[] {
  const set = new Set(selectedKeys);
  return all.filter(col => set.has(col.key));
}

// 格式化单元格值
function formatCellValue(value: any, key: string): any {
  if (value === null || value === undefined) return '';
  
  // 布尔值
  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }
  
  // 好评状态
  if (key === 'isGoodReview') {
    const statusMap: Record<string, string> = {
      'pending': '未好评',
      'reviewed': '已好评',
      'creating': '作图中',
      'returned': '已返图',
    };
    return statusMap[String(value)] || String(value);
  }
  
  // 日期 - 返回 Date 对象让 Excel 识别为日期类型
  if (key.includes('Date') || key.includes('date') || key === 'createdAt' || key === 'updatedAt') {
    if (value) {
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d;
    }
    return '';
  }
  
  // 金额 - 返回原始数字类型，保留完整精度
  if (key.includes('price') || key.includes('Amount') || key.includes('Commission') ||
      key.includes('Reward') || key.includes('Refund') || key.includes('Payment') ||
      key.includes('Count')) {
    return Number(value);
  }
  
  return String(value);
}

// 导出为Excel
export function exportToExcel(options: ExportOptions) {
  const { filename, columns, data } = options;
  
  // 准备数据
  const exportData = data.map(row => {
    const newRow: any = {};
    columns.forEach(col => {
      const value = getNestedValue(row, col.key);
      newRow[col.label] = formatCellValue(value, col.key);
    });
    return newRow;
  });
  
  // 创建工作簿
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportData);
  
  // 设置列宽
  const colWidths = columns.map(col => ({
    wch: Math.max(col.label.length * 2, 10)
  }));
  ws['!cols'] = colWidths;
  
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  
  // 导出文件
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// 合并导出多个表格
export function exportCombined(options: {
  filename: string;
  sheets: { name: string; columns: ExportColumn[]; data: any[] }[];
}) {
  const { filename, sheets } = options;
  
  const wb = XLSX.utils.book_new();
  
  sheets.forEach(sheet => {
    const exportData = sheet.data.map(row => {
      const newRow: any = {};
      sheet.columns.forEach(col => {
        const value = getNestedValue(row, col.key);
        newRow[col.label] = formatCellValue(value, col.key);
      });
      return newRow;
    });
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    const colWidths = sheet.columns.map(col => ({
      wch: Math.max(col.label.length * 2, 10)
    }));
    ws['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  });
  
  XLSX.writeFile(wb, `${filename}.xlsx`);
}