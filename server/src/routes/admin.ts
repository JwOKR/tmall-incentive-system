import { Router, Response, NextFunction } from 'express';
import { getAllUsers, createUser, updateUser, deleteUser } from '../controllers/adminController';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// 管理员权限校验中间件（authMiddleware 已在 index.ts 全局挂载）
const adminOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ success: false, message: '权限不足，仅管理员可操作' });
  }
  next();
};

router.get('/', adminOnly, getAllUsers);
router.post('/', adminOnly, createUser);
router.put('/:id', adminOnly, updateUser);
router.delete('/:id', adminOnly, deleteUser);

export default router;
