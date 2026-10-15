import prisma from './db';
import { Request } from 'express';

interface AuditLogData {
  orderId?: string;
  userId?: string;
  action: string;
  detail: string;
  ipAddress?: string;
  // P2-2：被操作实体的结构化引用（多态，逻辑外键，无 DB 层约束）。
  // 可选，不传则为 null —— 保持对既有调用点向后兼容。
  entityType?: string;
  entityId?: string;
}

/**
 * 获取客户端真实 IP（支持 nginx/Docker 反向代理）
 * 对最小 req 桩（无 headers/socket）保持健壮：真实 Express req 恒带 headers，此处仅作防御。
 */
export function getClientIp(req: Request): string {
  const headers = req?.headers ?? {};
  const forwarded = headers['x-forwarded-for'];
  const realIp = headers['x-real-ip'];
  
  if (forwarded) {
    // x-forwarded-for 可能是 "client, proxy1, proxy2" 格式，取第一个
    return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
  }
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }
  
  return req?.ip || req?.socket?.remoteAddress || 'unknown';
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
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
      },
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}