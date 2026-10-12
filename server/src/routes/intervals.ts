import { Router } from 'express';
import { getIntervalStats } from '../controllers/intervalController';
import { requireViewPermission } from '../middleware/auth';

const router = Router();

router.get('/', requireViewPermission('intervals'), getIntervalStats);

export default router;
