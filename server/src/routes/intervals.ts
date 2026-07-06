import { Router } from 'express';
import { getIntervalStats } from '../controllers/intervalController';

const router = Router();

router.get('/', getIntervalStats);

export default router;
