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
      const s = search as string;
      where.OR = [
        { orderNo: { contains: s } },
        { orderNo19: { contains: s } },
        { productId: { contains: s } },
        { productCode: { contains: s } },
        { remark: { contains: s } },
        {
          taker: {
            OR: [
              { wechatName: { contains: s } },
              { wechatId: { contains: s } },
            ],
          },
        },
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
        refundDate: refundDate !== undefined ? parseExcelDate(refundDate) : undefined,
        isGoodReview: isGoodReview !== undefined ? Boolean(isGoodReview) : undefined,
        baseCommission: baseCommission !== undefined ? Number(baseCommission) : undefined,
        reviewCommission: reviewCommission !== undefined ? Number(reviewCommission) : undefined,
        reviewCommissionDate: reviewCommissionDate !== undefined ? parseExcelDate(reviewCommissionDate) : undefined,
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

// 通用布尔值解析（支持 true/false/'true'/'false'/1/0/'是'/'否'/'已返款'/'已好评' 等）
function parseBoolValue(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'true' || v === '1' || v === '是' || v === '已返款' || v === '已好评' || v === '有';
  }
  return false;
}

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
            isRefunded: parseBoolValue(item.isRefunded),
            refundDate: parseExcelDate(item.refundDate),
            isGoodReview: parseBoolValue(item.isGoodReview),
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

// 批量修改订单（以订单号/19订单号为匹配键，只更新非空字段）
export const batchUpdateOrders = async (req: Request, res: Response) => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ success: false, message: '请提供订单列表' });
    }

    let success = 0;
    let failed = 0;
    let notFound = 0;
    const errors: string[] = [];
    const details: any[] = [];

    for (const item of orders) {
      try {
        const orderNoStr = item.orderNo ? String(item.orderNo).trim() : null;
        const orderNo19Str = item.orderNo19 ? String(item.orderNo19).trim() : null;

        if (!orderNoStr && !orderNo19Str) {
          failed++;
          errors.push('某条记录缺少订单编号或19订单号，已跳过');
          continue;
        }

        // 通过订单号或19订单号找到现有订单
        const existingOrder = await prisma.order.findFirst({
          where: {
            OR: [
              ...(orderNoStr ? [{ orderNo: orderNoStr }] : []),
              ...(orderNo19Str ? [{ orderNo19: orderNo19Str }] : []),
            ],
          },
        });

        if (!existingOrder) {
          notFound++;
          details.push({ orderNo: orderNoStr || orderNo19Str, status: 'not_found', reason: '订单不存在' });
          continue;
        }

        // 构造只更新非空字段的 updateData
        const updateData: any = {};

        // 字符串字段：只要传了且不为空就更新
        if (item.wechatName || item.wechatId) {
          const wechatNameStr = item.wechatName ? String(item.wechatName).trim() : null;
          const wechatIdStr = item.wechatId ? String(item.wechatId).trim() : null;
          const taker = await prisma.orderTaker.findFirst({
            where: {
              OR: [
                ...(wechatIdStr ? [{ wechatId: wechatIdStr }] : []),
                ...(wechatNameStr ? [{ wechatName: wechatNameStr }] : []),
              ],
            },
          });
          if (taker) updateData.takerId = taker.id;
        }

        if (item.actualPayment !== '' && item.actualPayment !== undefined && item.actualPayment !== null) {
          updateData.actualPayment = Number(item.actualPayment) || 0;
        }
        if (item.baseCommission !== '' && item.baseCommission !== undefined && item.baseCommission !== null) {
          updateData.baseCommission = Number(item.baseCommission) || 0;
        }
        if (item.reviewCommission !== '' && item.reviewCommission !== undefined && item.reviewCommission !== null) {
          updateData.reviewCommission = Number(item.reviewCommission) || 0;
        }
        if (item.remark !== '' && item.remark !== undefined) {
          updateData.remark = String(item.remark).trim() || null;
        }
        if (item.isRefunded !== '' && item.isRefunded !== undefined && item.isRefunded !== null) {
          updateData.isRefunded = parseBoolValue(item.isRefunded);
        }
        if (item.refundDate !== '' && item.refundDate !== undefined && item.refundDate !== null) {
          updateData.refundDate = parseExcelDate(item.refundDate);
        }
        if (item.isGoodReview !== '' && item.isGoodReview !== undefined && item.isGoodReview !== null) {
          updateData.isGoodReview = parseBoolValue(item.isGoodReview);
        }
        if (item.reviewCommissionDate !== '' && item.reviewCommissionDate !== undefined && item.reviewCommissionDate !== null) {
          updateData.reviewCommissionDate = parseExcelDate(item.reviewCommissionDate);
        }
        if (item.orderNo19 && !existingOrder.orderNo19) {
          updateData.orderNo19 = orderNo19Str;
        }

        // 重新计算总返款
        const newActualPayment = updateData.actualPayment ?? existingOrder.actualPayment;
        const newBaseCommission = updateData.baseCommission ?? existingOrder.baseCommission;
        const newReviewCommission = updateData.reviewCommission ?? existingOrder.reviewCommission;
        updateData.totalRefund = newActualPayment + newBaseCommission + newReviewCommission;

        if (Object.keys(updateData).length <= 1) {
          // 只有 totalRefund，说明没有任何实际更新字段
          notFound++;
          details.push({ orderNo: orderNoStr || orderNo19Str, status: 'skipped', reason: '无需更新的字段' });
          continue;
        }

        await prisma.order.update({ where: { id: existingOrder.id }, data: updateData });

        // 记录变更日志
        const changes: string[] = [];
        if (updateData.isRefunded !== undefined && updateData.isRefunded !== existingOrder.isRefunded)
          changes.push(`返款状态: ${existingOrder.isRefunded ? '已返款' : '未返款'} → ${updateData.isRefunded ? '已返款' : '未返款'}`);
        if (updateData.isGoodReview !== undefined && updateData.isGoodReview !== existingOrder.isGoodReview)
          changes.push(`好评状态: ${existingOrder.isGoodReview ? '已好评' : '未好评'} → ${updateData.isGoodReview ? '已好评' : '未好评'}`);
        if (updateData.actualPayment !== undefined) changes.push(`实付款: ${existingOrder.actualPayment} → ${updateData.actualPayment}`);
        if (updateData.baseCommission !== undefined) changes.push(`基础返佣: ${existingOrder.baseCommission} → ${updateData.baseCommission}`);
        if (updateData.reviewCommission !== undefined) changes.push(`好评返佣: ${existingOrder.reviewCommission} → ${updateData.reviewCommission}`);
        if (updateData.remark !== undefined) changes.push(`备注: ${existingOrder.remark || '空'} → ${updateData.remark || '空'}`);

        await createAuditLog({
          orderId: existingOrder.id,
          action: 'update',
          detail: `批量修改订单 ${existingOrder.orderNo || existingOrder.id}: ${changes.join(', ') || '无变更'}`,
          ipAddress: req.ip,
        });

        success++;
        details.push({ orderNo: orderNoStr || orderNo19Str, status: 'success', changes: changes.join(', ') });
      } catch (error) {
        failed++;
        errors.push(`${item.orderNo || item.orderNo19 || '未知'}: ${(error as Error).message}`);
      }
    }

    await createAuditLog({
      action: 'batch_update',
      detail: `批量修改订单: 成功${success}条，未找到${notFound}条，失败${failed}条`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        success,
        failed,
        duplicates: notFound,
        details: details.slice(0, 20),
        errors: errors.slice(0, 10),
      },
      message: `修改完成: 成功${success}条，未找到${notFound}条，失败${failed}条`,
    });
  } catch (error) {
    console.error('Error batch updating orders:', error);
    res.status(500).json({ success: false, message: '批量修改订单失败' });
  }
};

// 批量更新订单状态（批量标记已返款/已好评）
export const batchUpdateStatus = async (req: Request, res: Response) => {
  try {
    const { ids, field, value } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: '请提供订单ID列表' });
    }

    if (!['isRefunded', 'isGoodReview'].includes(field)) {
      return res.status(400).json({ success: false, message: '不支持的字段' });
    }

    const boolValue = Boolean(value);
    const updateData: any = { [field]: boolValue };

    // 自动设置日期
    if (field === 'isRefunded' && boolValue) {
      updateData.refundDate = new Date();
    }
    if (field === 'isGoodReview' && boolValue) {
      updateData.reviewCommissionDate = new Date();
    }

    // 重新计算总返款
    const orders = await prisma.order.findMany({
      where: { id: { in: ids } },
      select: { id: true, actualPayment: true, baseCommission: true, reviewCommission: true },
    });

    let success = 0;
    for (const order of orders) {
      const newReviewCommission = field === 'isGoodReview' ? order.reviewCommission : order.reviewCommission;
      updateData.totalRefund = order.actualPayment + order.baseCommission + newReviewCommission;

      await prisma.order.update({
        where: { id: order.id },
        data: updateData,
      });
      success++;
    }

    const fieldLabel = field === 'isRefunded' ? '返款' : '好评';
    await createAuditLog({
      action: 'batch_update',
      detail: `批量标记${success}个订单为${boolValue ? '已' : '未'}${fieldLabel}`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { updated: success, total: ids.length },
      message: `成功更新${success}条订单`,
    });
  } catch (error) {
    console.error('Error batch updating status:', error);
    res.status(500).json({ success: false, message: '批量更新状态失败' });
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