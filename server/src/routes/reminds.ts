import { Router } from 'express';
import { getRemindList } from '../controllers/remindController';

const router = Router();

router.get('/', getRemindList);

export default router;
