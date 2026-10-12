import { Router } from 'express';
import { getAllLogs } from '../controllers/logController';
import { requireViewPermission } from '../middleware/auth';

const router = Router();

router.get('/', requireViewPermission('logs'), getAllLogs);

export default router;