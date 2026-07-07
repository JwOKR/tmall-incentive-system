import { Router } from 'express';
import { exportBackup, importBackup } from '../controllers/backupController';

const router = Router();

router.get('/export', exportBackup);
router.post('/import', importBackup);

export default router;
