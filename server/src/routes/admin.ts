import { Router } from 'express';
import { getAllUsers, createUser, updateUser, deleteUser } from '../controllers/adminController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 管理员中间件：只有 admin 角色才能访问
const adminMiddleware = (req: any, res: any, next: any) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ success: false, message: '权限不足，仅管理员可操作' });
  }
  next();
};

router.get('/', authMiddleware, adminMiddleware, getAllUsers);
router.post('/', authMiddleware, adminMiddleware, createUser);
router.put('/:id', authMiddleware, adminMiddleware, updateUser);
router.delete('/:id', authMiddleware, adminMiddleware, deleteUser);

export default router;
