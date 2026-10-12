import { Router } from 'express';
import { exportBackup, importBackup } from '../controllers/backupController';
import { requireEditPermission, requireViewPermission } from '../middleware/auth';

const router = Router();

// 备份导出含接单人微信/手机号与截图 base64（导出全库）；导入支持 overwrite 覆写全库。
// 二者均属高危操作，统一挂 export 模块守卫：读走 requireViewPermission，写走 requireEditPermission。
router.get('/export', requireViewPermission('export'), exportBackup);
router.post('/import', requireEditPermission('export'), importBackup);

export default router;
