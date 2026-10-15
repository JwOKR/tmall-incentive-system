import { Request, Response } from 'express';
import prisma from '../utils/db';

// 获取所有日志
export const getAllLogs = async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 20, action, orderId, userId, startDate, endDate } = req.query;

    const where: any = {};
    if (action) where.action = action;
    if (orderId) where.orderId = orderId;
    // 按操作人筛选（P2-2）：userId 白名单透传 —— 仅接受非空字符串标量，
    // 数组/对象等结构化输入一律忽略，避免任意结构被注入进 where。
    // 不传 userId 时行为与此前完全一致（不触碰 where）。
    if (typeof userId === 'string' && userId.trim() !== '') {
      where.userId = userId.trim();
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const [logs, total] = await Promise.all([
      prisma.log.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              orderNo: true,
              productId: true,
              productCode: true,
            },
          },
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      }),
      prisma.log.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        list: logs,
        total,
        page: Number(page),
        pageSize: Number(pageSize),
      },
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({
      success: false,
      message: '获取日志列表失败',
    });
  }
};

// 操作人上限保护：用户表膨胀时避免响应过大（同时限制扫描行数）
const OPERATOR_LIST_LIMIT = 1000;

// 获取操作人名单（供操作日志页「操作人」下拉使用，轻量只读）。
//
// 数据来源：User 表（而非从日志表 distinct）。取舍说明：
//   - User 模型**没有 isActive/停用标志**，因此不存在「过滤掉已停用用户」的问题 —— 全部用户都会出现，
//     历史上操作过（有日志）的用户只要账号仍存在就一定在名单里；
//   - 单次查询即可同时拿到 id 与展示名 username，无需 join 日志表；日志由已删除账号留下时其 userId
//     已无对应行（硬删除），这类历史无法从 User 表还原 —— 属已知边界，见报告。
// 安全：显式 select 白名单，**只回 id + username**，绝不返回 password / permissions 等敏感字段。
export const getLogOperators = async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true },
      orderBy: { username: 'asc' },
      take: OPERATOR_LIST_LIMIT,
    });

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Error fetching log operators:', error);
    res.status(500).json({
      success: false,
      message: '获取操作人列表失败',
    });
  }
};