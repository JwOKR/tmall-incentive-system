import { Router } from 'express';
import { getAllUsers, createUser, updateUser, deleteUser } from '../controllers/adminController';
import { requireAdmin } from '../middleware/auth';

const router = Router();

// 管理员权限校验：复用 middleware/auth 的统一实现（requireAdmin），不再在本文件重复定义。
// authMiddleware 已在 index.ts 全局挂载，故未登录在进入本路由前就已是 401。
router.get('/', requireAdmin, getAllUsers);
router.post('/', requireAdmin, createUser);
router.put('/:id', requireAdmin, updateUser);
router.delete('/:id', requireAdmin, deleteUser);

export default router;
