import { Router } from 'express';
import {
  getAllTakers,
  getTakerById,
  createTaker,
  batchCreateTakers,
  updateTaker,
  deleteTaker,
} from '../controllers/takerController';
import { getTakerDetail } from '../controllers/takerDetailController';
import { requireEditPermission, requireViewPermission } from '../middleware/auth';

const router = Router();

router.get('/', requireViewPermission('takers'), getAllTakers);
router.get('/:id/detail', requireViewPermission('takers'), getTakerDetail);
router.get('/:id', requireViewPermission('takers'), getTakerById);
router.post('/', requireEditPermission('takers'), createTaker);
router.post('/batch', requireEditPermission('takers'), batchCreateTakers);
router.put('/:id', requireEditPermission('takers'), updateTaker);
router.delete('/:id', requireEditPermission('takers'), deleteTaker);

export default router;