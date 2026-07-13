import { Router } from 'express';
import {
  getAll,
  getSummary,
  getById,
  create,
  update,
  remove,
} from '../controllers/repeatDiscountController';
import {
  generateAIAnalysis,
  generateOverallAIAnalysis,
  getSavedDailyAnalysis,
  getSavedOverallAnalysis,
} from '../services/aiAnalysisService';

const router = Router();

// 读取已保存的总体AI分析（必须在 /:id 之前）
router.get('/ai-analysis-overall', async (req, res) => {
  try {
    const { startDate, endDate } = req.query as any;
    const result = await getSavedOverallAnalysis(startDate, endDate);
    if (result) {
      res.json({ success: true, data: result });
    } else {
      res.json({ success: true, data: null });
    }
  } catch (error: any) {
    console.error('Get saved overall analysis error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 读取已保存的单日AI分析（必须在 /:id 之前）
router.get('/ai-analysis/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const result = await getSavedDailyAnalysis(recordId);
    if (result) {
      res.json({ success: true, data: result });
    } else {
      res.json({ success: true, data: null });
    }
  } catch (error: any) {
    console.error('Get saved analysis error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 总体AI分析（必须在 /:id 之前）
router.post('/ai-analysis-overall', async (req, res) => {
  try {
    const { startDate, endDate } = req.body || {};
    const result = await generateOverallAIAnalysis(startDate, endDate);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Overall AI analysis error:', error);
    res.status(500).json({ success: false, message: error.message || '总体AI分析失败' });
  }
});

// 单日AI分析（必须在 /:id 之前）
router.post('/ai-analysis', async (req, res) => {
  try {
    const { recordId } = req.body;
    if (!recordId) return res.status(400).json({ success: false, message: '请提供 recordId' });

    const result = await generateAIAnalysis(recordId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('AI analysis error:', error);
    res.status(500).json({ success: false, message: error.message || 'AI分析失败' });
  }
});

// 汇总统计（必须在 /:id 之前）
router.get('/summary', getSummary);

// 单条操作路由
router.get('/', getAll);
router.get('/:id', getById);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);

export default router;
