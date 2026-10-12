import prisma from '../utils/db';

/**
 * 备份数据快照服务
 *
 * 目的：把「取全库数据」的逻辑抽成**唯一一份**，供两条路径共用：
 *   1. 手动导出（backupController.exportBackup —— HTTP 下载）
 *   2. 定时自动备份（utils/scheduler.runAutoBackupOnce —— 落盘）
 * 禁止在两处各写一份查询，避免口径分叉（手动导出与自动备份内容不一致）。
 *
 * 注意：本模块是纯数据函数，不关心 HTTP / 文件系统，便于复用与单元测试。
 */

/** 备份数据结构（与历史 v1.1 备份格式保持一致） */
export interface BackupSnapshot {
  version: string;
  exportedAt: string;
  data: {
    users: unknown[];
    orderTakers: unknown[];
    tasks: unknown[];
    orders: unknown[];
    logs: unknown[];
    repeatDiscounts: unknown[];
  };
  summary: {
    users: number;
    takers: number;
    tasks: number;
    orders: number;
    logs: number;
    repeatDiscounts: number;
  };
}

/**
 * 构建全库数据快照。
 *
 * - users 不导出密码（统一置 [REDACTED]）；
 * - 其余表整表导出；
 * - 各表并行查询。
 *
 * @returns 备份快照对象（可直接 JSON.stringify 落盘或作为响应体返回）
 */
export async function buildBackupSnapshot(): Promise<BackupSnapshot> {
  const [users, takers, tasks, orders, logs, repeatDiscounts] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, username: true, role: true, createdAt: true },
    }),
    prisma.orderTaker.findMany(),
    prisma.task.findMany(),
    prisma.order.findMany(),
    prisma.log.findMany(),
    prisma.repeatDiscount.findMany(),
  ]);

  return {
    version: '1.1',
    exportedAt: new Date().toISOString(),
    data: {
      // 保持与原 exportBackup 一致：Prisma Client 未生成时 findMany 返回值类型退化，
      // 此处沿用隐式 any 回调（不顺手加类型标注，避免改动既有 tsc 报错口径）。
      users: users.map(u => ({ ...u, password: '[REDACTED]' })), // 不导出密码
      orderTakers: takers,
      tasks,
      orders,
      logs,
      repeatDiscounts,
    },
    summary: {
      users: users.length,
      takers: takers.length,
      tasks: tasks.length,
      orders: orders.length,
      logs: logs.length,
      repeatDiscounts: repeatDiscounts.length,
    },
  };
}
