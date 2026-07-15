import prisma from './db';
import { Request } from 'express';

interface AuditLogData {
  orderId?: string;
  userId?: string;
  action: string;
  detail: string;
  ipAddress?: string;
}

/**
 * 获取客户端真实 IP（支持 nginx/Docker 反向代理）
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  
  if (forwarded) {
    // x-forwarded-for 可能是 "client, proxy1, proxy2" 格式，取第一个
    return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
  }
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }
  
  return req.ip || req.socket.remoteAddress || 'unknown';
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