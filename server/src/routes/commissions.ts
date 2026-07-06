import { Router } from 'express';
import { getCommissionStats } from '../controllers/commissionController';

const router = Router();

router.get('/', getCommissionStats);

export default router;
