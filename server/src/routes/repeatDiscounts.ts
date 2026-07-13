import { Router } from 'express';
import {
  getAll,
  getSummary,
  getById,
  create,
  update,
  remove,
} from '../controllers/repeatDiscountController';

const router = Router();

// 汇总统计（必须在 /:id 之前）
router.get('/summary', getSummary);

// 单条操作路由
router.get('/', getAll);
router.get('/:id', getById);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);

export default router;
