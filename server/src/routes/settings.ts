import { Router } from 'express';
import { getSettings, updateSettings } from '../controllers/systemSettingController';
import { requireAdmin } from '../middleware/auth';

const router = Router();

// 本路由为**真正的管理员专属**（admin-only 硬拒），不走模块权限（settings）：PUT 可改
// `ai_api_key` 与 `review_commission_amount`（后者直接改变所有返款计算口径），GET 可读到 API Key，
// 因此即使普通用户在 permissions 里被勾选了 settings 模块，也一律由 requireAdmin 拦下（403）。
router.get('/', requireAdmin, getSettings);
router.put('/', requireAdmin, updateSettings);

export default router;
