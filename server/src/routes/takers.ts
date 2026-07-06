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

const router = Router();

router.get('/', getAllTakers);
router.get('/:id/detail', getTakerDetail);
router.get('/:id', getTakerById);
router.post('/', createTaker);
router.post('/batch', batchCreateTakers);
router.put('/:id', updateTaker);
router.delete('/:id', deleteTaker);

export default router;