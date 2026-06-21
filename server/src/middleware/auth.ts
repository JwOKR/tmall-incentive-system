import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'tmall-incentive-secret-key-2026';

export interface AuthRequest extends Request {
  userId?: string;
  username?: string;
  userRole?: string;
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

export { JWT_SECRET };
