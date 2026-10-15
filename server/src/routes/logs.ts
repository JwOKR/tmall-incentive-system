import { Router } from 'express';
import { getAllLogs, getLogOperators } from '../controllers/logController';
import { requireViewPermission } from '../middleware/auth';

const router = Router();

// 轻量只读：操作人名单，供日志页「操作人」下拉。复用同模块视图权限（与 GET / 完全一致）。
router.get('/operators', requireViewPermission('logs'), getLogOperators);

router.get('/', requireViewPermission('logs'), getAllLogs);

export default router;