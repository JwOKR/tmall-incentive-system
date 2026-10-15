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
 * 获取客户端真实 IP（支持 nginx/Docker 反向代理）。
 *
 * 读取顺序刻意是「req.ip 优先、头部次之」：
 *   1) `req.ip` 是 Express 依据 `app.set('trust proxy', <跳数>)` 推导的结果，
 *      是唯一经过信任链校验的值；头部则是客户端可以任意伪造的原始文本。
 *   2) 旧实现先读 `x-forwarded-for` 并取**第一个**值，等于无条件信任最左侧一条 ——
 *      任何人发一个 `X-Forwarded-For: 8.8.8.8` 就能把审计日志的 IP 写成任意值。
 *      改由 `req.ip` 打头后，伪造值只有在跳数配置错误时才会生效。
 *   3) 回退到 XFF 时改取**最右侧**一条：最右侧是最近一跳代理追加的真实地址，
 *      最左侧才是客户端可伪造的前缀（方向不可搞反）。
 *
 * 对最小 req 桩（无 ip/headers/socket）保持健壮：真实 Express req 恒带 headers，
 * 此处仅作防御，避免测试桩抛异常被误判成 500。
 */
export function getClientIp(req: Request): string {
  const trusted = req?.ip;
  if (trusted) return trusted;

  const headers = req?.headers ?? {};
  const realIp = headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  const forwarded = headers['x-forwarded-for'];
  if (forwarded) {
    const parts = Array.isArray(forwarded) ? forwarded : forwarded.split(',');
    // 取最右侧一条：最近一跳代理追加的真实地址。最左侧是客户端可伪造的前缀。
    const last = parts[parts.length - 1]?.trim();
    if (last) return last;
  }

  return req?.socket?.remoteAddress || 'unknown';
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