import { Router } from 'express';
import { getAllLogs } from '../controllers/logController';

const router = Router();

router.get('/', getAllLogs);

export default router;