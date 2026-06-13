import { Request, Response } from 'express';
import prisma from '../utils/db';
import { createAuditLog } from '../utils/auditLog';

// 获取所有订单
export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 10, search, isRefunded, isGoodReview, startDate, endDate } = req.query;
    
    const where: any = {};
    if (isRefunded !== undefined) where.isRefunded = isRefunded === 'true';
    if (isGoodReview !== undefined) where.isGoodReview = isGoodReview === 'true';
    if (search) {
      where.OR = [
        { orderNo: { contains: search as string } },
        { orderNo19: { contains: search as string } },
        { productId: { contains: search as string } },
        { productCode: { contains: search as string } },
      ];
    }
    
    // 日期筛选
    if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) {
        where.orderDate.gte = new Date(startDate as string);
      }
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        where.orderDate.lte = end;
      }
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
        orderBy: { orderDate: 'desc' },
        include: {
          task: {
            select: {
              id: true,
              productId: true,
              productCode: true,
            },
          },
          taker: {
            select: {
              id: true,
              wechatName: true,
              wechatId: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        list: orders,
        total,
        page: Number(page),
        pageSize: Number(pageSize),
      },
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: '获取订单列表失败',
    });
  }
};

// 获取单个订单详情
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        task: true,
        taker: true,
        logs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: '订单不存在',
      });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: '获取订单详情失败',
    });
  }
};

// 更新订单
export const updateOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      orderNo,
      orderNo19,
      orderLink,
      actualPayment,
      isRefunded,
      refundDate,
      isGoodReview,
      baseCommission,
      reviewCommission,
      reviewCommissionDate,
      remark,
    } = req.body;

    const existingOrder = await prisma.order.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: '订单不存在',
      });
    }

    // 验证订单编号唯一性（如果修改了订单编号）
    if (orderNo && orderNo !== existingOrder.orderNo) {
      const duplicateOrder = await prisma.order.findFirst({
        where: { orderNo },
      });
      if (duplicateOrder) {
        return res.status(400).json({
          success: false,
          message: '订单编号已存在，不能重复',
        });
      }
    }

    // 验证19订单号唯一性（如果修改了19订单号）
    if (orderNo19 && orderNo19 !== existingOrder.orderNo19) {
      const duplicateOrder = await prisma.order.findFirst({
        where: { orderNo19 },
      });
      if (duplicateOrder) {
        return res.status(400).json({
          success: false,
          message: '19订单号已存在，不能重复',
        });
      }
    }

    // 计算新的总返款 = 实付款 + 基础返佣 + 好评返佣
    const newActualPayment = actualPayment !== undefined ? Number(actualPayment) : existingOrder.actualPayment;
    const newBaseCommission = baseCommission !== undefined ? Number(baseCommission) : existingOrder.baseCommission;
    const newReviewCommission = reviewCommission !== undefined ? Number(reviewCommission) : existingOrder.reviewCommission;
    const calculatedTotalRefund = newActualPayment + newBaseCommission + newReviewCommission;

    const order = await prisma.order.update({
      where: { id },
      data: {
        orderNo,
        orderNo19,
        orderLink,
        actualPayment: actualPayment !== undefined ? Number(actualPayment) : undefined,
        totalRefund: calculatedTotalRefund, // 自动计算，不接受手动输入
        isRefunded: isRefunded !== undefined ? Boolean(isRefunded) : undefined,
        refundDate: parseExcelDate(refundDate),
        isGoodReview: isGoodReview !== undefined ? Boolean(isGoodReview) : undefined,
        baseCommission: baseCommission ? Number(baseCommission) : undefined,
        reviewCommission: reviewCommission ? Number(reviewCommission) : undefined,
        reviewCommissionDate: parseExcelDate(reviewCommissionDate),
        remark,
      },
      include: {
        task: true,
        taker: true,
      },
    });

    // 记录具体变更信息
    const changes: string[] = [];
    if (orderNo !== undefined && orderNo !== existingOrder.orderNo) changes.push(`订单编号: ${existingOrder.orderNo || '空'} → ${orderNo}`);
    if (orderNo19 !== undefined && orderNo19 !== existingOrder.orderNo19) changes.push(`19订单号: ${existingOrder.orderNo19 || '空'} → ${orderNo19}`);
    if (actualPayment !== undefined && Number(actualPayment) !== existingOrder.actualPayment) changes.push(`实付款: ${existingOrder.actualPayment} → ${actualPayment}`);
    if (isRefunded !== undefined && Boolean(isRefunded) !== existingOrder.isRefunded) changes.push(`返款状态: ${existingOrder.isRefunded ? '已返款' : '未返款'} → ${isRefunded ? '已返款' : '未返款'}`);
    if (isGoodReview !== undefined && Boolean(isGoodReview) !== existingOrder.isGoodReview) changes.push(`好评状态: ${existingOrder.isGoodReview ? '已好评' : '未好评'} → ${isGoodReview ? '已好评' : '未好评'}`);
    if (baseCommission !== undefined && Number(baseCommission) !== existingOrder.baseCommission) changes.push(`基础返佣: ${existingOrder.baseCommission} → ${baseCommission}`);
    if (reviewCommission !== undefined && Number(reviewCommission) !== existingOrder.reviewCommission) changes.push(`好评返佣: ${existingOrder.reviewCommission} → ${reviewCommission}`);
    if (remark !== undefined && remark !== existingOrder.remark) changes.push(`备注: ${existingOrder.remark || '空'} → ${remark || '空'}`);

    const detail = changes.length > 0 
      ? `更新订单 ${existingOrder.orderNo || id}: ${changes.join(', ')}`
      : `更新订单: ${existingOrder.orderNo || id}`;

    await createAuditLog({
      orderId: id,
      action: 'update',
      detail,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({
      success: false,
      message: '更新订单失败',
    });
  }
};

// 通用日期解析函数（支持多种格式）
function parseExcelDate(dateValue: any): Date | null {
  if (!dateValue) return null;
  
  // 如果是数字（Excel日期序列号）
  if (typeof dateValue === 'number') {
    // Excel日期序列号：从1900年1月1日开始的天数
    const excelEpoch = new Date(1900, 0, 1);
    return new Date(excelEpoch.getTime() + (dateValue - 2) * 24 * 60 * 60 * 1000);
  }
  
  // 尝试解析字符串日期
  const parsed = new Date(dateValue);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  return null;
}

// 批量导入订单
export const batchCreateOrders = async (req: Request, res: Response) => {
  try {
    const { orders } = req.body;
    
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供订单列表',
      });
    }

    let success = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];
    const details: any[] = [];

    for (const item of orders) {
      try {
        // 转换所有字段为字符串（Excel可能解析为数字）
        const wechatNameStr = item.wechatName ? String(item.wechatName).trim() : null;
        const wechatIdStr = item.wechatId ? String(item.wechatId).trim() : null;
        const orderNoStr = item.orderNo ? String(item.orderNo).trim() : null;
        const orderNo19Str = item.orderNo19 ? String(item.orderNo19).trim() : null;
        const remarkStr = item.remark ? String(item.remark).trim() : null;

        // 通过微信昵称或微信号查找接单人
        let taker = null;
        if (wechatNameStr || wechatIdStr) {
          taker = await prisma.orderTaker.findFirst({
            where: {
              OR: [
                ...(wechatIdStr ? [{ wechatId: wechatIdStr }] : []),
                ...(wechatNameStr ? [{ wechatName: wechatNameStr }] : []),
              ],
            },
          });
        }

        // 通过商品ID或产品编号查找任务
        let task = null;
        const productIdStr = item.productId ? String(item.productId).trim() : null;
        const productCodeStr = item.productCode ? String(item.productCode).trim() : null;
        if (productIdStr || productCodeStr) {
          task = await prisma.task.findFirst({
            where: {
              OR: [
                ...(productIdStr ? [{ productId: productIdStr }] : []),
                ...(productCodeStr ? [{ productCode: productCodeStr }] : []),
              ],
              status: 'active',
            },
            orderBy: { createdAt: 'desc' },
          });
        }

        // 检查订单编号是否重复
        if (orderNoStr) {
          const existingOrder = await prisma.order.findFirst({
            where: { orderNo: orderNoStr },
          });
          if (existingOrder) {
            skipped++;
            details.push({
              orderNo: orderNoStr,
              status: 'skipped',
              reason: '订单编号已存在',
            });
            continue;
          }
        }

        // 检查19订单号是否重复
        if (orderNo19Str) {
          const existingOrder = await prisma.order.findFirst({
            where: { orderNo19: orderNo19Str },
          });
          if (existingOrder) {
            skipped++;
            details.push({
              orderNo: orderNoStr,
              orderNo19: orderNo19Str,
              status: 'skipped',
              reason: '19订单号已存在',
            });
            continue;
          }
        }

        // 计算总返款
        const actualPayment = Number(item.actualPayment) || 0;
        const baseCommission = Number(item.baseCommission) || (task ? task.baseCommission : 5);
        const reviewCommission = Number(item.reviewCommission) || 0;
        const totalRefund = actualPayment + baseCommission + reviewCommission;

        // 解析日期（支持多种格式）
        const orderDate = parseExcelDate(item.orderDate) || new Date();

        // 生成订单链接
        const orderLink = orderNoStr 
          ? `https://qn.taobao.com/home.htm/trade-platform/tp/detail?spm=a21dvs.23580594.0.0.60fb2cedkP5BNV&bizOrderId=${orderNoStr}`
          : '';

        await prisma.order.create({
          data: {
            orderDate,
            orderNo: orderNoStr,
            orderNo19: orderNo19Str,
            orderLink: item.orderLink || orderLink,
            taskId: task?.id || null,
            takerId: taker?.id || null,
            productId: productIdStr || (task ? task.productId : ''),
            productCode: productCodeStr || (task ? task.productCode : ''),
            actualPayment,
            baseCommission,
            reviewCommission,
            totalRefund,
            isRefunded: item.isRefunded === 'true' || item.isRefunded === true,
            refundDate: parseExcelDate(item.refundDate),
            isGoodReview: item.isGoodReview === 'true' || item.isGoodReview === true,
            reviewCommissionDate: parseExcelDate(item.reviewCommissionDate),
            remark: remarkStr,
          },
        });

        success++;
        details.push({
          orderNo: orderNoStr,
          status: 'success',
          taker: taker ? taker.wechatName : '未匹配',
          task: task ? task.productId : '未匹配',
        });

        // 更新任务已接人数
        if (task) {
          await prisma.task.update({
            where: { id: task.id },
            data: { currentOrders: { increment: 1 } },
          });
        }

        // 更新接单人统计
        if (taker) {
          await prisma.orderTaker.update({
            where: { id: taker.id },
            data: {
              totalOrders: { increment: 1 },
              totalAmount: { increment: actualPayment },
            },
          });
        }
      } catch (error) {
        failed++;
        errors.push(`${item.orderNo || item.orderNo19 || '未知'}: ${(error as Error).message}`);
      }
    }

    await createAuditLog({
      action: 'batch_create',
      detail: `批量导入订单: 成功${success}条，跳过${skipped}条，失败${failed}条`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        success,
        failed,
        duplicates: skipped,
        details: details.slice(0, 20),
        errors: errors.slice(0, 10),
      },
      message: `导入完成: 成功${success}条，跳过${skipped}条，失败${failed}条`,
    });
  } catch (error) {
    console.error('Error batch creating orders:', error);
    res.status(500).json({
      success: false,
      message: '批量导入订单失败',
    });
  }
};

// 删除订单
export const deleteOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existingOrder = await prisma.order.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: '订单不存在',
      });
    }

    await prisma.order.delete({
      where: { id },
    });

    // 更新任务已接人数
    if (existingOrder.taskId) {
      await prisma.task.update({
        where: { id: existingOrder.taskId },
        data: {
          currentOrders: { decrement: 1 },
        },
      });
    }

    // 更新接单人统计
    if (existingOrder.takerId) {
      await prisma.orderTaker.update({
        where: { id: existingOrder.takerId },
        data: {
          totalOrders: { decrement: 1 },
          totalAmount: { decrement: existingOrder.actualPayment },
        },
      });
    }

    // 先创建审计日志（在删除订单之前）
    await createAuditLog({
      action: 'delete',
      detail: `删除订单: ${existingOrder.orderNo || existingOrder.id}`,
      ipAddress: req.ip,
    });

    // 删除订单关联的日志
    await prisma.log.deleteMany({
      where: { orderId: id },
    });

    // 删除订单
    await prisma.order.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: '删除成功',
    });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({
      success: false,
      message: '删除订单失败',
    });
  }
};