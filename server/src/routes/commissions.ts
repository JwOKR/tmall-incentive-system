import { Router } from 'express';
import { getCommissionStats } from '../controllers/commissionController';
import { requireViewPermission } from '../middleware/auth';

const router = Router();

router.get('/', requireViewPermission('commissions'), getCommissionStats);

export default router;
