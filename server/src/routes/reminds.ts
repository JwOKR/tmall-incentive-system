import { Router } from 'express';
import { getRemindList } from '../controllers/remindController';
import { requireViewPermission } from '../middleware/auth';

const router = Router();

// 催单列表是「数据汇总」页的内嵌功能：前端入口（Dashboard 的催单弹窗）受 canView('dashboard') 管控。
// 因此后端复用 dashboard 模块的查看权限，保证前后端权限口径一致（模块名不新增 reminds）。
router.get('/', requireViewPermission('dashboard'), getRemindList);

export default router;
