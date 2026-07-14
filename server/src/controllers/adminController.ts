import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/db';
import { createAuditLog } from '../utils/auditLog';
import { AuthRequest } from '../middleware/auth';

// 获取所有用户列表（仅管理员）
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        permissions: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: '获取用户列表失败' });
  }
};

// 创建新用户（仅管理员）
export const createUser = async (req: Request, res: Response) => {
  try {
    const { username, password, role = 'user', permissions } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: '请输入用户名和密码' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: '密码至少6位' });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { 
        username, 
        password: hashedPassword, 
        role,
        permissions: permissions ? JSON.stringify(permissions) : null,
      },
      select: { id: true, username: true, role: true, permissions: true, createdAt: true },
    });

    await createAuditLog({
      action: 'create',
      detail: `创建用户: ${username} (${role})`,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: user });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ success: false, message: '创建用户失败' });
  }
};

// 更新用户（仅管理员）
export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { username, password, role, permissions } = req.body;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // 不能修改自己的角色（防止意外降权）
    if (id === req.userId && role && role !== existing.role) {
      return res.status(400).json({ success: false, message: '不能修改自己的角色' });
    }

    // 检查用户名是否被其他人使用
    if (username && username !== existing.username) {
      const duplicate = await prisma.user.findUnique({ where: { username } });
      if (duplicate) {
        return res.status(400).json({ success: false, message: '用户名已存在' });
      }
    }

    const updateData: any = {};
    if (username) updateData.username = username;
    if (role) updateData.role = role;
    if (permissions !== undefined) updateData.permissions = permissions ? JSON.stringify(permissions) : null;
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: '密码至少6位' });
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, username: true, role: true, permissions: true, createdAt: true, updatedAt: true },
    });

    await createAuditLog({
      action: 'update',
      detail: `更新用户: ${existing.username} → ${username || existing.username} ${role ? `(${role})` : ''}`,
      ipAddress: req.ip,
    });

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ success: false, message: '更新用户失败' });
  }
};

// 删除用户（仅管理员）
export const deleteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // 不能删除自己
    if (id === req.userId) {
      return res.status(400).json({ success: false, message: '不能删除当前登录用户' });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // 至少保留一个管理员
    if (existing.role === 'admin') {
      const adminCount = await prisma.user.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: '至少保留一个管理员账户' });
      }
    }

    await prisma.user.delete({ where: { id } });

    await createAuditLog({
      action: 'delete',
      detail: `删除用户: ${existing.username} (${existing.role})`,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: '用户已删除' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ success: false, message: '删除用户失败' });
  }
};
