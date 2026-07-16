import { Request, Response } from 'express';
import prisma from '../utils/db';

// 获取所有日志
export const getAllLogs = async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 20, action, orderId, startDate, endDate } = req.query;
    
    const where: any = {};
    if (action) where.action = action;
    if (orderId) where.orderId = orderId;
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