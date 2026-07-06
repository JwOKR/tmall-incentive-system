import { Router } from 'express';
import { getAnomalies } from '../controllers/anomalyController';

const router = Router();

router.get('/', getAnomalies);

export default router;
