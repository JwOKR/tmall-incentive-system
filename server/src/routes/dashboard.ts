import { Router } from 'express';
import { getDashboardStats, getIncentiveSummary } from '../controllers/dashboardController';

const router = Router();

router.get('/stats', getDashboardStats);
router.get('/incentive-summary', getIncentiveSummary);

export default router;
