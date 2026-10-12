import { Router } from 'express';
import { getRemindList, getRefundAlerts } from '../controllers/remindController';
import { requireViewPermission } from '../middleware/auth';

const router = Router();

// 超期未返款看板的入口同样在「数据汇总」页，故与下方催单列表一样复用 dashboard 查看权限，
// 保证前后端权限口径一致（模块名不新增）。
// 注意：本路由的 days 语义是「超过 N 天」（orderDate <= today - N），与催单列表的
// 「最近 N 天」（orderDate >= today - N）**方向相反**，二者各自独立、互不影响。
// 必须注册在 '/' 之前，避免被其它路由匹配干扰。
router.get('/refund-alerts', requireViewPermission('dashboard'), getRefundAlerts);

// 催单列表是「数据汇总」页的内嵌功能：前端入口（Dashboard 的催单弹窗）受 canView('dashboard') 管控。
// 因此后端复用 dashboard 模块的查看权限，保证前后端权限口径一致（模块名不新增 reminds）。
router.get('/', requireViewPermission('dashboard'), getRemindList);

export default router;
