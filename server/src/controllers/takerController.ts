import { Request, Response } from 'express';
import prisma from '../utils/db';
import { createAuditLog } from '../utils/auditLog';

// 获取所有接单人
export const getAllTakers = async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 10, status, search } = req.query;
    
    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { wechatName: { contains: search as string } },
        { wechatId: { contains: search as string } },
      ];
    }

    const [takers, total] = await Promise.all([
      prisma.orderTaker.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.orderTaker.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        list: takers,
        total,
        page: Number(page),
        pageSize: Number(pageSize),
      },
    });
  } catch (error) {
    console.error('Error fetching takers:', error);
    res.status(500).json({
      success: false,
      message: '获取接单人列表失败',
    });
  }
};

// 获取单个接单人详情
export const getTakerById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const taker = await prisma.orderTaker.findUnique({
      where: { id },
      include: {
        orders: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!taker) {
      return res.status(404).json({
        success: false,
        message: '接单人不存在',
      });
    }

    res.json({
      success: true,
      data: taker,
    });
  } catch (error) {
    console.error('Error fetching taker:', error);
    res.status(500).json({
      success: false,
      message: '获取接单人详情失败',
    });
  }
};

// 创建接单人
export const createTaker = async (req: Request, res: Response) => {
  try {
    const { wechatName, wechatId } = req.body;

    // 检查微信号是否已存在
    const existing = await prisma.orderTaker.findUnique({
      where: { wechatId },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: '该微信号已存在',
      });
    }

    const taker = await prisma.orderTaker.create({
      data: {
        wechatName,
        wechatId,
      },
    });

    await createAuditLog({
      userId: taker.id,
      action: 'create',
      detail: `创建接单人: ${wechatName} (${wechatId})`,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: taker,
    });
  } catch (error) {
    console.error('Error creating taker:', error);
    res.status(500).json({
      success: false,
      message: '创建接单人失败',
    });
  }
};

// 更新接单人
export const updateTaker = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { wechatName, wechatId, status } = req.body;

    const existingTaker = await prisma.orderTaker.findUnique({
      where: { id },
    });

    if (!existingTaker) {
      return res.status(404).json({
        success: false,
        message: '接单人不存在',
      });
    }

    // 检查微信号是否被其他人使用
    if (wechatId && wechatId !== existingTaker.wechatId) {
      const duplicate = await prisma.orderTaker.findUnique({
        where: { wechatId },
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: '该微信号已被使用',
        });
      }
    }

    const taker = await prisma.orderTaker.update({
      where: { id },
      data: {
        wechatName,
        wechatId,
        status,
      },
    });

    await createAuditLog({
      userId: id,
      action: 'update',
      detail: `更新接单人: ${wechatName}`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: taker,
    });
  } catch (error) {
    console.error('Error updating taker:', error);
    res.status(500).json({
      success: false,
      message: '更新接单人失败',
    });
  }
};

// 批量导入接单人
export const batchCreateTakers = async (req: Request, res: Response) => {
  try {
    const { takers } = req.body;
    
    if (!Array.isArray(takers) || takers.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供接单人列表',
      });
    }

    let success = 0;
    let failed = 0;
    let duplicates = 0;
    const errors: string[] = [];

    for (const taker of takers) {
      try {
        // 检查微信号是否已存在
        const existing = await prisma.orderTaker.findUnique({
          where: { wechatId: taker.wechatId },
        });

        if (existing) {
          duplicates++;
          continue;
        }

        await prisma.orderTaker.create({
          data: {
            wechatName: taker.wechatName,
            wechatId: taker.wechatId,
          },
        });
        success++;
      } catch (error) {
        failed++;
        errors.push(`${taker.wechatName}: ${(error as Error).message}`);
      }
    }

    await createAuditLog({
      action: 'batch_create',
      detail: `批量导入接单人: 成功${success}条，重复${duplicates}条，失败${failed}条`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        success,
        failed,
        duplicates,
        errors: errors.slice(0, 10), // 最多返回10条错误
      },
      message: `导入完成: 成功${success}条，重复${duplicates}条，失败${failed}条`,
    });
  } catch (error) {
    console.error('Error batch creating takers:', error);
    res.status(500).json({
      success: false,
      message: '批量导入接单人失败',
    });
  }
};

// 删除接单人
export const deleteTaker = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existingTaker = await prisma.orderTaker.findUnique({
      where: { id },
      include: {
        orders: true,
      },
    });

    if (!existingTaker) {
      return res.status(404).json({
        success: false,
        message: '接单人不存在',
      });
    }

    if (existingTaker.orders.length > 0) {
      return res.status(400).json({
        success: false,
        message: '该接单人有关联订单，无法删除',
      });
    }

    await prisma.orderTaker.delete({
      where: { id },
    });

    await createAuditLog({
      userId: id,
      action: 'delete',
      detail: `删除接单人: ${existingTaker.wechatName} (${existingTaker.wechatId})`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('Error deleting taker:', error);
    res.status(500).json({
      success: false,
      message: '删除接单人失败',
    });
  }
};