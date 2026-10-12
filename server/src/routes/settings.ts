import { Router } from 'express';
import { getSettings, updateSettings } from '../controllers/systemSettingController';
import { requireEditPermission, requireViewPermission } from '../middleware/auth';

const router = Router();

// PUT 可改 ai_api_key 与 review_commission_amount（后者直接改变所有返款计算口径），必须限制为 settings 模块编辑权限。
router.get('/', requireViewPermission('settings'), getSettings);
router.put('/', requireEditPermission('settings'), updateSettings);

export default router;
