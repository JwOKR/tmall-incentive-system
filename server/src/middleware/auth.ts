import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../utils/db';

const JWT_SECRET = process.env.JWT_SECRET || 'tmall-incentive-secret-key-2026';

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
    };
    req.userId = decoded.userId;
    req.username = decoded.username;
    req.userRole = decoded.role;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: '登录已过期，请重新登录',
      code: 'TOKEN_EXPIRED',
    });
  }
}

// 检查模块编辑权限的中间件
export function requireEditPermission(module: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // 管理员拥有所有权限
    if (req.userRole === 'admin') {
      return next();
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { permissions: true },
      });

      if (!user || !user.permissions) {
        return res.status(403).json({
          success: false,
          message: '权限不足',
          code: 'FORBIDDEN',
        });
      }

      const permissions = JSON.parse(user.permissions);
      const modulePermission = permissions[module];

      if (!modulePermission || !modulePermission.edit) {
        return res.status(403).json({
          success: false,
          message: `您没有${module}模块的编辑权限`,
          code: 'FORBIDDEN',
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '权限检查失败',
      });
    }
  };
}

// 检查模块查看权限的中间件
export function requireViewPermission(module: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // 管理员拥有所有权限
    if (req.userRole === 'admin') {
      return next();
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { permissions: true },
      });

      if (!user || !user.permissions) {
        return res.status(403).json({
          success: false,
          message: '权限不足',
          code: 'FORBIDDEN',
        });
      }

      const permissions = JSON.parse(user.permissions);
      const modulePermission = permissions[module];

      if (!modulePermission || !modulePermission.view) {
        return res.status(403).json({
          success: false,
          message: `您没有${module}模块的查看权限`,
          code: 'FORBIDDEN',
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: '权限检查失败',
      });
    }
  };
}

export { JWT_SECRET };
