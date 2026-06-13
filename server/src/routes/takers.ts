import { Router } from 'express';
import {
  getAllTakers,
  getTakerById,
  createTaker,
  batchCreateTakers,
  updateTaker,
  deleteTaker,
} from '../controllers/takerController';

const router = Router();

router.get('/', getAllTakers);
router.get('/:id', getTakerById);
router.post('/', createTaker);
router.post('/batch', batchCreateTakers);
router.put('/:id', updateTaker);
router.delete('/:id', deleteTaker);

export default router;