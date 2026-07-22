import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/db';
import { authMiddleware, AuthRequest, JWT_SECRET } from '../middleware/auth';
import { createAuditLog, getClientIp } from '../utils/auditLog';

const router = Router();

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '请输入用户名和密码',
      });
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      // 记录登录失败日志
      await createAuditLog({
        action: 'login_failed',
        detail: `登录失败: ${username} (用户不存在)`,
        ipAddress: getClientIp(req),
      });
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // 记录登录失败日志
      await createAuditLog({
        action: 'login_failed',
        detail: `登录失败: ${username} (密码错误)`,
        ipAddress: getClientIp(req),
        userId: user.id,
      });
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误',
      });
    }

    const permissions = user.permissions ? JSON.parse(user.permissions) : {};
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, permissions },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 记录登录成功日志
    await createAuditLog({
      action: 'login',
      detail: `用户登录: ${username}`,
      ipAddress: getClientIp(req),
      userId: user.id,
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          permissions: user.permissions ? JSON.parse(user.permissions) : {},
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: '登录失败，请稍后重试',
    });
  }
});

// 获取当前用户信息
router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  res.json({
    success: true,
    data: {
      id: req.userId,
      username: req.username,
      role: req.userRole,
    },
  });
});

// 修改密码
router.put('/password', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '请输入旧密码和新密码',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在',
      });
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      return res.status(400).json({
        success: false,
        message: '旧密码错误',
      });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.userId },
      data: { password: hashedNewPassword },
    });

    // 记录修改密码日志
    await createAuditLog({
      action: 'change_password',
      detail: `修改密码: ${user.username}`,
      ipAddress: getClientIp(req),
      userId: req.userId,
    });

    res.json({
      success: true,
      message: '密码修改成功',
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: '密码修改失败',
    });
  }
});

export default router;
