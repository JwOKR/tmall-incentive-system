import { Request, Response } from 'express';
import prisma from '../utils/db';
import { createAuditLog, getClientIp } from '../utils/auditLog';
import { parseExcelDate } from '../utils/parseExcelDate';
import { AuthRequest } from '../middleware/auth';

// 获取所有任务
export const getAllTasks = async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 10, status, search } = req.query;
    
    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { productId: { contains: search as string } },
        { productCode: { contains: search as string } },
      ];
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              orders: true,
            },
          },
        },
      }),
      prisma.task.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        list: tasks,
        total,
        page: Number(page),
        pageSize: Number(pageSize),
      },
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({
      success: false,
      message: '获取任务列表失败',
    });
  }
};

// 获取单个任务详情
export const getTaskById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        orders: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            taker: true,
          },
        },
      },
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在',
      });
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({
      success: false,
      message: '获取任务详情失败',
    });
  }
};

// 创建任务
export const createTask = async (req: AuthRequest, res: Response) => {
  try {
    const {
      productId,
      productCode,
      taoToken,
      price,
      baseCommission,
      reviewReward,
      maxOrders,
    } = req.body;

    // 验证淘口令唯一性（仅在提供了非空淘口令时）
    const cleanTaoToken = taoToken && String(taoToken).trim() ? String(taoToken).trim() : null;
    if (cleanTaoToken) {
      const existingTask = await prisma.task.findUnique({
        where: { taoToken: cleanTaoToken },
      });
      if (existingTask) {
        return res.status(400).json({
          success: false,
          message: '淘口令已存在，不能重复',
        });
      }
    }

    const task = await prisma.task.create({
      data: {
        productId: productId || '',
        productCode: productCode || '',
        taoToken: cleanTaoToken,
        price: price ? Number(price) : 0,
        baseCommission: baseCommission ? Number(baseCommission) : 5,
        reviewReward: reviewReward ? Number(reviewReward) : 0,
        maxOrders: maxOrders ? Number(maxOrders) : 1,
      },
    });

    await createAuditLog({
      action: 'create',
      detail: `创建任务: ${productId || '未填写'} (${productCode || '未填写'})`,
      ipAddress: getClientIp(req),
      userId: req.userId,
    });

    res.status(201).json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({
      success: false,
      message: '创建任务失败',
    });
  }
};

// 批量创建任务（按商品编号）
export const batchCreateTasks = async (req: AuthRequest, res: Response) => {
  try {
    const { tasks } = req.body;
    
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供任务列表',
      });
    }

    const createdTasks = await prisma.task.createMany({
      data: tasks.map((task: any) => ({
        publishDate: parseExcelDate(task.publishDate) || new Date(),
        productId: task.productId ? String(task.productId).trim() : '',
        productCode: task.productCode ? String(task.productCode).trim() : '',
        taoToken: task.taoToken ? String(task.taoToken).trim() : null,
        price: Number(task.price) || 0,
        baseCommission: Number(task.baseCommission) || 5,
        reviewReward: Number(task.reviewReward) || 0,
        maxOrders: Number(task.maxOrders) || 1,
      })),
    });

    await createAuditLog({
      action: 'create',
      detail: `批量创建任务: ${createdTasks.count}个`,
      ipAddress: getClientIp(req),
      userId: req.userId,
    });

    res.status(201).json({
      success: true,
      data: { count: createdTasks.count },
      message: `成功创建${createdTasks.count}个任务`,
    });
  } catch (error) {
    console.error('Error batch creating tasks:', error);
    res.status(500).json({
      success: false,
      message: '批量创建任务失败',
    });
  }
};

// 更新任务
export const updateTask = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      productId,
      productCode,
      taoToken,
      price,
      baseCommission,
      reviewReward,
      maxOrders,
      status,
    } = req.body;

    const existingTask = await prisma.task.findUnique({
      where: { id },
    });

    if (!existingTask) {
      return res.status(404).json({
        success: false,
        message: '任务不存在',
      });
    }

    // 验证淘口令唯一性（仅在提供了非空淘口令且有变更时）
    const cleanTaoToken = taoToken !== undefined ? (taoToken && String(taoToken).trim() ? String(taoToken).trim() : null) : undefined;
    if (cleanTaoToken && cleanTaoToken !== existingTask.taoToken) {
      const duplicateTask = await prisma.task.findUnique({
        where: { taoToken: cleanTaoToken },
      });
      if (duplicateTask) {
        return res.status(400).json({
          success: false,
          message: '淘口令已存在，不能重复',
        });
      }
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        productId,
        productCode,
        taoToken: cleanTaoToken,
        price: price ? Number(price) : undefined,
        baseCommission: baseCommission ? Number(baseCommission) : undefined,
        reviewReward: reviewReward ? Number(reviewReward) : undefined,
        maxOrders: maxOrders ? Number(maxOrders) : undefined,
        status,
      },
    });

    // 同步更新关联订单的商品信息
    if (productId || productCode) {
      const updateData: any = {};
      if (productId) updateData.productId = productId;
      if (productCode) updateData.productCode = productCode;
      
      await prisma.order.updateMany({
        where: { taskId: id },
        data: updateData,
      });
    }

    // 记录具体变更信息
    const changes: string[] = [];
    if (productId !== undefined && productId !== existingTask.productId) changes.push(`商品ID: ${existingTask.productId} → ${productId}`);
    if (productCode !== undefined && productCode !== existingTask.productCode) changes.push(`产品编号: ${existingTask.productCode} → ${productCode}`);
    if (taoToken !== undefined && taoToken !== existingTask.taoToken) changes.push(`淘口令: ${existingTask.taoToken} → ${taoToken}`);
    if (price !== undefined && Number(price) !== existingTask.price) changes.push(`价格: ${existingTask.price} → ${price}`);
    if (baseCommission !== undefined && Number(baseCommission) !== existingTask.baseCommission) changes.push(`基础返佣: ${existingTask.baseCommission} → ${baseCommission}`);
    if (reviewReward !== undefined && Number(reviewReward) !== existingTask.reviewReward) changes.push(`好评返佣: ${existingTask.reviewReward} → ${reviewReward}`);
    if (maxOrders !== undefined && Number(maxOrders) !== existingTask.maxOrders) changes.push(`限接人数: ${existingTask.maxOrders} → ${maxOrders}`);
    if (status !== undefined && status !== existingTask.status) changes.push(`状态: ${existingTask.status} → ${status}`);

    const detail = changes.length > 0 
      ? `更新任务 ${existingTask.productId}: ${changes.join(', ')}`
      : `更新任务: ${existingTask.productId}`;

    await createAuditLog({
      action: 'update',
      detail,
      ipAddress: getClientIp(req),
      userId: req.userId,
    });

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({
      success: false,
      message: '更新任务失败',
    });
  }
};

// 删除任务
export const deleteTask = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existingTask = await prisma.task.findUnique({
      where: { id },
      include: {
        orders: true,
      },
    });

    if (!existingTask) {
      return res.status(404).json({
        success: false,
        message: '任务不存在',
      });
    }

    if (existingTask.orders.length > 0) {
      return res.status(400).json({
        success: false,
        message: '该任务有关联订单，无法删除',
      });
    }

    await prisma.task.delete({
      where: { id },
    });

    await createAuditLog({
      action: 'delete',
      detail: `删除任务: ${existingTask.productId} (${existingTask.productCode})`,
      ipAddress: getClientIp(req),
      userId: req.userId,
    });

    res.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({
      success: false,
      message: '删除任务失败',
    });
  }
};

// 快速接单
export const quickOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { taskId, takerId, orderNo, orderNo19, actualPayment, force } = req.body;

    // 检查任务是否存在
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在',
      });
    }

    // 检查任务状态
    if (task.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: '该任务已结束或已取消',
      });
    }

    // 检查是否还有名额
    if (task.currentOrders >= task.maxOrders) {
      return res.status(400).json({
        success: false,
        message: '该任务名额已满',
      });
    }

    // 检查接单人是否存在
    const taker = await prisma.orderTaker.findUnique({
      where: { id: takerId },
    });

    if (!taker) {
      return res.status(404).json({
        success: false,
        message: '接单人不存在',
      });
    }

    // 检查接单人7天内是否接过任何订单（首次接单不受限制，全局7天间隔）
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentOrder = await prisma.order.findFirst({
      where: {
        takerId,
        orderDate: {
          gte: sevenDaysAgo,
        },
      },
      orderBy: {
        orderDate: 'desc',
      },
    });

    if (recentOrder && !force) {
      // 计算下次可接单时间
      const nextAvailableDate = new Date(recentOrder.orderDate);
      nextAvailableDate.setDate(nextAvailableDate.getDate() + 7);
      
      return res.status(400).json({
        success: false,
        message: `该接单人7天内已接单（最近接单时间：${recentOrder.orderDate.toLocaleString('zh-CN')}），需等待至 ${nextAvailableDate.toLocaleString('zh-CN')} 后才能再次接单`,
        code: 'INTERVAL_LIMIT',
      });
    }

    // 订单编号由用户手动填写，不自动生成
    const finalOrderNo = orderNo || null;
    
    // 生成订单链接（根据订单编号 - 淘宝订单号）
    const orderLink = finalOrderNo 
      ? `https://qn.taobao.com/home.htm/trade-platform/tp/detail?spm=a21dvs.23580594.0.0.60fb2cedkP5BNV&bizOrderId=${finalOrderNo}`
      : '';

    // 使用用户输入的实付价，默认为 0
    const finalActualPayment = actualPayment !== undefined ? Number(actualPayment) : 0;
    // 总返款 = 实付款 + 基础返佣 + 好评返佣
    const calculatedTotalRefund = finalActualPayment + task.baseCommission + task.reviewReward;

    // 使用事务保证原子性：创建订单 + 更新任务 + 更新接单人 统一成功或回滚
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          orderNo: finalOrderNo,
          taskId,
          takerId,
          productId: task.productId,
          productCode: task.productCode,
          orderNo19: orderNo19 || null,
          orderLink,
          actualPayment: finalActualPayment,
          baseCommission: task.baseCommission,
          reviewCommission: task.reviewReward,
          totalRefund: calculatedTotalRefund,
        },
        include: { task: true, taker: true },
      });

      // 更新任务已接人数
      await tx.task.update({
        where: { id: taskId },
        data: { currentOrders: { increment: 1 } },
      });

      // 更新接单人统计
      await tx.orderTaker.update({
        where: { id: takerId },
        data: {
          totalOrders: { increment: 1 },
          totalAmount: { increment: task.price },
        },
      });

      return newOrder;
    });

    // 记录日志（事务外执行，不影响主流程）
    await createAuditLog({
      orderId: order.id,
      action: 'create',
      detail: `接单成功: ${orderNo} by ${taker.wechatName}`,
      ipAddress: getClientIp(req),
      userId: req.userId,
    });

    res.status(201).json({
      success: true,
      data: order,
      message: '接单成功',
    });
  } catch (error) {
    console.error('Error creating quick order:', error);
    res.status(500).json({
      success: false,
      message: '接单失败',
    });
  }
};