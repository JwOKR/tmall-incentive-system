import { Router } from 'express';
import { getDashboardStats, getIncentiveSummary } from '../controllers/dashboardController';
import { requireViewPermission } from '../middleware/auth';

const router = Router();

router.get('/stats', requireViewPermission('dashboard'), getDashboardStats);
router.get('/incentive-summary', requireViewPermission('dashboard'), getIncentiveSummary);

export default router;
