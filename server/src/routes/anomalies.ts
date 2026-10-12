import { Router } from 'express';
import { getAnomalies } from '../controllers/anomalyController';
import { requireViewPermission } from '../middleware/auth';

const router = Router();

router.get('/', requireViewPermission('anomalies'), getAnomalies);

export default router;
