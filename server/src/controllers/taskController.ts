import { Request, Response } from 'express';
import prisma from '../utils/db';
import { createAuditLog, getClientIp } from '../utils/auditLog';
import { parseExcelDate } from '../utils/parseExcelDate';
import {
  evaluateTakerCompliance,
  describeComplianceBlock,
  canTakeOrders,
} from '../utils/takerCompliance';
import { evaluateTakerRisk, describeRiskBlock } from '../utils/takerRisk';
import { AuthRequest } from '../middleware/auth';

/** 通用字符串归一化：undefined/null → ''，否则 trim */
function toTrimmedString(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

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
      deadline,
    } = req.body;

    // 验证商品ID唯一性（仅在提供了非空商品ID时）
    const cleanProductId = productId && String(productId).trim() ? String(productId).trim() : null;
    if (cleanProductId) {
      const existingProduct = await prisma.task.findFirst({
        where: { productId: cleanProductId },
      });
      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: `商品ID "${cleanProductId}" 已存在，不能重复`,
        });
      }
    }

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
        // P2-5：截止日期可空（历史任务没有 deadline）；空值/非法值一律落 null，绝不报错
        deadline: parseExcelDate(deadline),
        status: 'pending',
      },
    });

    await createAuditLog({
      action: 'create',
      detail: `创建任务: ${productId || '未填写'} (${productCode || '未填写'})`,
      ipAddress: getClientIp(req),
      userId: req.userId,
      entityType: 'task',
      entityId: task.id,
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

// 批量创建任务（Excel 导入）—— P2-8 导入查重 + P2-5 截止日期
export const batchCreateTasks = async (req: AuthRequest, res: Response) => {
  try {
    const { tasks } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供任务列表',
      });
    }

    // ── P2-8 查重准备：一次性批量预查库内已存在的 taoToken / productId（避免循环内 N+1）──
    // 注意：淘口令 @unique 但「空白时允许多条」——空淘口令绝不参与判重；productId 同理跳过空串。
    const inputTokens = new Set<string>();
    const inputProductIds = new Set<string>();
    for (const task of tasks) {
      const token = toTrimmedString(task?.taoToken);
      const productId = toTrimmedString(task?.productId);
      if (token) inputTokens.add(token);
      if (productId) inputProductIds.add(productId);
    }

    const dbTokenSet = new Set<string>();
    const dbProductIdSet = new Set<string>();
    if (inputTokens.size > 0 || inputProductIds.size > 0) {
      const OR: any[] = [];
      if (inputTokens.size > 0) OR.push({ taoToken: { in: [...inputTokens] } });
      if (inputProductIds.size > 0) OR.push({ productId: { in: [...inputProductIds] } });
      const existing = await prisma.task.findMany({
        where: { OR },
        select: { taoToken: true, productId: true },
      });
      for (const e of existing) {
        if (e.taoToken) dbTokenSet.add(e.taoToken);
        if (e.productId) dbProductIdSet.add(e.productId);
      }
    }

    // ── 逐行判定：与库内重复 / 本文件内重复 → 跳过并在结果里报告（带 Excel 行号）──
    const seenTokens = new Map<string, number>();
    const seenProductIds = new Map<string, number>();
    const toCreate: any[] = [];
    const details: Array<{ row: number; productId: string; status: string; reason?: string }> = [];
    let skipped = 0;

    tasks.forEach((task: any, idx: number) => {
      // Excel 行号：表头占第 1 行，数据行从第 2 行起 → 下标 + 2
      const row = idx + 2;
      const token = toTrimmedString(task?.taoToken);
      const productId = toTrimmedString(task?.productId);

      // a. 淘口令与库内重复（空淘口令不判重）
      if (token && dbTokenSet.has(token)) {
        skipped++;
        details.push({ row, productId, status: 'skipped', reason: '淘口令已存在' });
        return;
      }
      // b. 淘口令本文件内重复
      if (token && seenTokens.has(token)) {
        skipped++;
        details.push({ row, productId, status: 'skipped', reason: `淘口令本文件内重复（第 ${seenTokens.get(token)} 行已出现）` });
        return;
      }
      // c. 商品ID与库内重复
      if (productId && dbProductIdSet.has(productId)) {
        skipped++;
        details.push({ row, productId, status: 'skipped', reason: '商品ID已存在' });
        return;
      }
      // d. 商品ID本文件内重复
      if (productId && seenProductIds.has(productId)) {
        skipped++;
        details.push({ row, productId, status: 'skipped', reason: `商品ID本文件内重复（第 ${seenProductIds.get(productId)} 行已出现）` });
        return;
      }

      if (token) seenTokens.set(token, row);
      if (productId) seenProductIds.set(productId, row);

      toCreate.push({
        publishDate: parseExcelDate(task.publishDate) || new Date(),
        productId,
        productCode: task.productCode ? String(task.productCode).trim() : '',
        taoToken: token || null,
        price: Number(task.price) || 0,
        baseCommission: Number(task.baseCommission) || 5,
        reviewReward: Number(task.reviewReward) || 0,
        maxOrders: Number(task.maxOrders) || 1,
        // P2-5：截止日期可空，空值/非法值落 null
        deadline: parseExcelDate(task.deadline),
      });
    });

    // skipDuplicates 兜底：预查与写入之间的并发窗口内若有人写入同淘口令，
    // 只跳过该行而不是让整批失败（旧实现的整批失败正是本次要修的问题）。
    const createdTasks = toCreate.length > 0
      ? await prisma.task.createMany({ data: toCreate, skipDuplicates: true })
      : { count: 0 };

    await createAuditLog({
      action: 'create',
      detail: `批量创建任务: ${createdTasks.count}个，跳过${skipped}条重复`,
      ipAddress: getClientIp(req),
      userId: req.userId,
      entityType: 'task',
    });

    res.status(201).json({
      success: true,
      // details 逐行回显被跳过的行（带 Excel 行号与原因），与订单导入的「可读失败」口径一致
      data: { count: createdTasks.count, skipped, details },
      message: skipped > 0
        ? `成功创建${createdTasks.count}个任务，跳过${skipped}条重复`
        : `成功创建${createdTasks.count}个任务`,
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
      deadline,
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

    // 验证商品ID唯一性（仅在提供了非空商品ID且有变更时）
    const cleanProductId = productId !== undefined ? (productId && String(productId).trim() ? String(productId).trim() : null) : undefined;
    if (cleanProductId && cleanProductId !== existingTask.productId) {
      const duplicateProduct = await prisma.task.findFirst({
        where: { productId: cleanProductId },
      });
      if (duplicateProduct) {
        return res.status(400).json({
          success: false,
          message: `商品ID "${cleanProductId}" 已存在，不能重复`,
        });
      }
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
        // P2-5：deadline 可空 —— 显式传（含空串/null）表示设置或清除；不传（undefined）保持原值不动
        deadline: deadline === undefined ? undefined : (parseExcelDate(deadline) ?? null),
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
    // P2-5：截止日期变更日志（统一按日期粒度比较，避免时刻差异造成假变更）
    if (deadline !== undefined) {
      const parsedDeadline = parseExcelDate(deadline);
      const dayOf = (d: unknown) => (d ? new Date(d as Date).toISOString().slice(0, 10) : '');
      const oldDay = dayOf(existingTask.deadline);
      const newDay = dayOf(parsedDeadline);
      if (oldDay !== newDay) changes.push(`截止日期: ${oldDay || '无'} → ${newDay || '无'}`);
    }
    if (status !== undefined && status !== existingTask.status) changes.push(`状态: ${existingTask.status} → ${status}`);

    const detail = changes.length > 0 
      ? `更新任务 ${existingTask.productId}: ${changes.join(', ')}`
      : `更新任务: ${existingTask.productId}`;

    await createAuditLog({
      action: 'update',
      detail,
      ipAddress: getClientIp(req),
      userId: req.userId,
      entityType: 'task',
      entityId: id,
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
      entityType: 'task',
      entityId: id,
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
    if (task.status !== 'active' && task.status !== 'pending') {
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

    // 【风控硬拦截】被风控标记（riskFlag === true）或被拉黑/暂停（status === 'suspended'）的接单人一律拒绝。
    // 与下方资质门槛并列、同属「快速接单」入口的硬门槛：force 只用于绕过 7 天间隔，**不得绕过风控**。
    // 拦截点在 $transaction 之前，不产生任何副作用。判定由 takerRisk.evaluateTakerRisk 统一给出（单一数据源），
    // 响应体同时回带 blacklistReason 供前端展示。
    const risk = evaluateTakerRisk(taker);
    if (risk.blocked) {
      return res.status(403).json({
        success: false,
        code: 'TAKER_RISK_BLOCKED',
        message: describeRiskBlock(taker),
        blacklistReason: taker.blacklistReason ?? null,
      });
    }

    // 【账号资质门槛】只有资质「合格」的接单人才能接单；unqualified / incomplete 一律拦下。
    // 本拦截只作用于「快速接单」入口，Excel 批量导入订单（历史数据补录）不受此限制。
    // 注意：force 仅用于绕过 7 天接单间隔，不适用于资质门槛 —— 即便 force === true 也必须拒绝。
    // 拦截点在 $transaction 之前，不产生任何副作用。
    const compliance = evaluateTakerCompliance(taker);
    if (!canTakeOrders(compliance)) {
      return res.status(403).json({
        success: false,
        code: 'TAKER_NOT_QUALIFIED',
        message: describeComplianceBlock(compliance),
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
        data: { 
          currentOrders: { increment: 1 },
          ...(task.status === 'pending' ? { status: 'active' } : {}),
        },
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
      entityType: 'order',
      entityId: order.id,
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
// 一键手动更新所有任务状态
export const refreshAllTaskStatus = async (req: AuthRequest, res: Response) => {
  try {
    // 获取所有非取消状态的任务
    const tasks = await prisma.task.findMany({
      where: {
        status: { not: 'cancelled' },
      },
      include: {
        orders: {
          select: {
            isRefunded: true,
            isGoodReview: true,
          },
        },
      },
    });

    let updatedCount = 0;
    const results = [];

    for (const task of tasks) {
      const totalOrders = task.orders.length;
      const hasReviewedOrder = task.orders.some(o => o.isGoodReview === 'reviewed');
      const hasRefundedOrder = task.orders.some(o => o.isRefunded);

      // 计算新状态（按优先级）：
      // 1. 任何订单已好评 → 已完成
      // 2. 任何订单已返款 → 已返款
      // 3. 有订单但未返款 → 进行中
      // 4. 无订单 → 待接单
      let newStatus = task.status;
      if (hasReviewedOrder) {
        newStatus = 'completed';
      } else if (hasRefundedOrder) {
        newStatus = 'refunded';
      } else if (totalOrders > 0) {
        newStatus = 'active';
      } else {
        newStatus = 'pending';
      }

      // 更新任务状态和已接人数
      if (task.currentOrders !== totalOrders || task.status !== newStatus) {
        await prisma.task.update({
          where: { id: task.id },
          data: {
            currentOrders: totalOrders,
            status: newStatus,
          },
        });
        updatedCount++;
        results.push({
          id: task.id,
          productCode: task.productCode,
          oldStatus: task.status,
          newStatus: newStatus,
          currentOrders: totalOrders,
        });
      }
    }

    res.json({
      success: true,
      message: `已更新 ${updatedCount} 个任务状态`,
      data: {
        totalTasks: tasks.length,
        updatedCount,
        results,
      },
    });
  } catch (error) {
    console.error('Error refreshing task status:', error);
    res.status(500).json({
      success: false,
      message: '更新任务状态失败',
    });
  }
};
