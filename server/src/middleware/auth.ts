import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

const FALLBACK_JWT_SECRET = 'tmall-incentive-secret-key-2026';

// 启动时一次性检测。兜底密钥在源码中公开，任何人均可据此伪造任意用户（含管理员）的 JWT。
// 刻意不 throw：NAS 上容器重启是常态，一旦环境变量漏配就 throw 会让整个系统无法登录，
// 可用性风险大于收益。改为 ERROR 级强告警，让运维在日志里立刻发现。
const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  logger.error(
    '[SECURITY] JWT_SECRET 环境变量未设置！正在使用源码内置的公开兜底密钥，' +
    '任何人均可据此伪造任意用户（含管理员）的 JWT。请立即在部署环境配置 JWT_SECRET 并重启服务。'
  );
  return FALLBACK_JWT_SECRET;
})();

export interface AuthRequest extends Request {
  userId?: string;
  username?: string;
  userRole?: string;
  userPermissions?: Record<string, { view: boolean; edit: boolean }>;
}

// 验证JWT token的中间件
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: '未登录或登录已过期',
      code: 'UNAUTHORIZED',
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer '

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      username: string;
      role: string;
      permissions?: Record<string, { view: boolean; edit: boolean }>;
    };
    req.userId = decoded.userId;
    req.username = decoded.username;
    req.userRole = decoded.role;
    req.userPermissions = decoded.permissions || {};
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: '登录已过期，请重新登录',
      code: 'TOKEN_EXPIRED',
    });
  }
}

// 检查模块编辑权限的中间件（从JWT token中读取权限，无需查询数据库）
export function requireEditPermission(module: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.userRole === 'admin') {
      return next();
    }

    const permissions = req.userPermissions || {};
    const modulePermission = permissions[module];

    if (!modulePermission || !modulePermission.edit) {
      return res.status(403).json({
        success: false,
        message: `您没有${module}模块的编辑权限`,
        code: 'FORBIDDEN',
      });
    }

    next();
  };
}

// 检查模块查看权限的中间件（从JWT token中读取权限，无需查询数据库）
export function requireViewPermission(module: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.userRole === 'admin') {
      return next();
    }

    const permissions = req.userPermissions || {};
    const modulePermission = permissions[module];

    if (!modulePermission || !modulePermission.view) {
      return res.status(403).json({
        success: false,
        message: `您没有${module}模块的查看权限`,
        code: 'FORBIDDEN',
      });
    }

    next();
  };
}

export { JWT_SECRET };
