import prisma from './db';

interface AuditLogData {
  orderId?: string;
  userId?: string;
  action: string;
  detail: string;
  ipAddress?: string;
}

export async function createAuditLog(data: AuditLogData) {
  try {
    await prisma.log.create({
      data: {
        orderId: data.orderId,
        userId: data.userId,
        action: data.action,
        detail: data.detail,
        ipAddress: data.ipAddress,
      },
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}