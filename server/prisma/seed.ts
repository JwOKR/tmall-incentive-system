import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // 创建接单人
  const taker1 = await prisma.orderTaker.create({
    data: {
      wechatName: '小张',
      wechatId: 'wx_zhangsan',
    },
  });

  const taker2 = await prisma.orderTaker.create({
    data: {
      wechatName: '李四',
      wechatId: 'wx_lisi',
    },
  });

  const taker3 = await prisma.orderTaker.create({
    data: {
      wechatName: '王五',
      wechatId: 'wx_wangwu',
    },
  });

  // 创建任务（移除productName字段）
  const task1 = await prisma.task.create({
    data: {
      productId: 'TB001',
      productCode: 'SKU-iPhone15',
      taoToken: '￥iT7g2E4kR8p￥',
      price: 8999,
      baseCommission: 5,
      reviewReward: 0,
      maxOrders: 1,
      currentOrders: 1,
      status: 'active',
    },
  });

  const task2 = await prisma.task.create({
    data: {
      productId: 'TB002',
      productCode: 'SKU-MacBook14',
      taoToken: '￥aB3h5J7mN9q￥',
      price: 14999,
      baseCommission: 5,
      reviewReward: 0,
      maxOrders: 1,
      currentOrders: 0,
      status: 'active',
    },
  });

  const task3 = await prisma.task.create({
    data: {
      productId: 'TB003',
      productCode: 'SKU-AirPods',
      taoToken: '￥cD4k6L8pQ1r￥',
      price: 1999,
      baseCommission: 10,
      reviewReward: 5,
      maxOrders: 3,
      currentOrders: 1,
      status: 'active',
    },
  });

  // 创建订单（总返款 = 实付款 + 基础返佣 + 好评返佣）
  const order1 = await prisma.order.create({
    data: {
      orderDate: new Date('2024-06-01'),
      taskId: task1.id,
      takerId: taker1.id,
      productId: task1.productId,
      productCode: task1.productCode,
      orderNo19: 'TB20240601001',
      orderNo: 'ORD20240601001',
      orderLink: 'https://qn.taobao.com/home.htm/trade-platform/tp/detail?spm=a21dvs.23580594.0.0.60fb2cedkP5BNV&bizOrderId=TB20240601001',
      actualPayment: 8999,
      baseCommission: 5,
      reviewCommission: 0,
      totalRefund: 8999 + 5 + 0, // 实付款 + 基础返佣 + 好评返佣
      isRefunded: true,
      refundDate: new Date('2024-06-05'),
      isGoodReview: true,
      reviewCommissionDate: new Date('2024-06-03'),
      remark: '已完成好评',
    },
  });

  const order2 = await prisma.order.create({
    data: {
      orderDate: new Date('2024-06-02'),
      taskId: task1.id,
      takerId: taker2.id,
      productId: task1.productId,
      productCode: task1.productCode,
      orderNo19: 'TB20240602001',
      orderNo: 'ORD20240602001',
      orderLink: 'https://qn.taobao.com/home.htm/trade-platform/tp/detail?spm=a21dvs.23580594.0.0.60fb2cedkP5BNV&bizOrderId=TB20240602001',
      actualPayment: 8999,
      baseCommission: 5,
      reviewCommission: 0,
      totalRefund: 8999 + 5 + 0, // 实付款 + 基础返佣 + 好评返佣
      isRefunded: false,
      isGoodReview: false,
      remark: '待返款',
    },
  });

  const order3 = await prisma.order.create({
    data: {
      orderDate: new Date('2024-06-03'),
      taskId: task3.id,
      takerId: taker1.id,
      productId: task3.productId,
      productCode: task3.productCode,
      orderNo19: 'TB20240603001',
      orderNo: 'ORD20240603001',
      orderLink: 'https://qn.taobao.com/home.htm/trade-platform/tp/detail?spm=a21dvs.23580594.0.0.60fb2cedkP5BNV&bizOrderId=TB20240603001',
      actualPayment: 1999,
      baseCommission: 10,
      reviewCommission: 0,
      totalRefund: 1999 + 10 + 0, // 实付款 + 基础返佣 + 好评返佣
      isRefunded: false,
      isGoodReview: false,
    },
  });

  // 创建日志
  await prisma.log.create({
    data: {
      orderId: order1.id,
      action: 'create',
      detail: '接单成功: ORD20240601001',
    },
  });

  await prisma.log.create({
    data: {
      orderId: order1.id,
      action: 'update',
      detail: '标记已返款: ¥5',
    },
  });

  await prisma.log.create({
    data: {
      orderId: order2.id,
      action: 'create',
      detail: '接单成功: ORD20240602001',
    },
  });

  // 更新接单人统计
  await prisma.orderTaker.update({
    where: { id: taker1.id },
    data: {
      totalOrders: 2,
      totalAmount: task1.price + task3.price,
    },
  });

  await prisma.orderTaker.update({
    where: { id: taker2.id },
    data: {
      totalOrders: 1,
      totalAmount: task1.price,
    },
  });

  console.log('Seeding finished.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });