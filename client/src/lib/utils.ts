import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('zh-CN').format(num)
}

/**
 * 订单页「总返款」的显示口径（注意：与数据库 totalRefund 字段的口径不同！）
 * = 实付金额 + 好评返佣 +（仅当基础返佣已确认返款时，才加上基础返佣）
 * 数据库 totalRefund 始终是 实付+基础返佣+好评返佣 三项之和，不要用这个函数去覆盖它。
 */
export function calcDisplayTotalRefund(order: any): number {
  const actual = Number(order?.actualPayment) || 0;
  const review = Number(order?.reviewCommission) || 0;
  const base = Number(order?.baseCommission) || 0;
  return actual + review + (order?.isBaseCommissionRefunded ? base : 0);
}