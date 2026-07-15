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
import { requireEditPermission, requireViewPermission, AuthRequest } from '../middleware/auth';
import { createAuditLog, getClientIp } from '../utils/auditLog';

const router = Router();

// 读取已保存的总体AI分析（必须在 /:id 之前）
router.get('/ai-analysis-overall', requireViewPermission('repeatDiscounts'), async (req, res) => {
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
router.get('/ai-analysis/:recordId', requireViewPermission('repeatDiscounts'), async (req, res) => {
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
router.post('/ai-analysis-overall', requireEditPermission('repeatDiscounts'), async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.body || {};
    const result = await generateOverallAIAnalysis(startDate, endDate);
    
    // 记录日志
    await createAuditLog({
      action: 'ai_analysis',
      detail: `生成总体AI分析: ${startDate || '全部'} ~ ${endDate || '全部'}`,
      ipAddress: getClientIp(req),
      userId: req.userId,
    });
    
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Overall AI analysis error:', error);
    res.status(500).json({ success: false, message: error.message || '总体AI分析失败' });
  }
});

// 单日AI分析（必须在 /:id 之前）
router.post('/ai-analysis', requireEditPermission('repeatDiscounts'), async (req: AuthRequest, res) => {
  try {
    const { recordId } = req.body;
    if (!recordId) return res.status(400).json({ success: false, message: '请提供 recordId' });

    const result = await generateAIAnalysis(recordId);
    
    // 记录日志
    await createAuditLog({
      action: 'ai_analysis',
      detail: `生成单日AI分析: ${result.recordDate ? new Date(result.recordDate).toISOString().slice(0, 10) : recordId}`,
      ipAddress: getClientIp(req),
      userId: req.userId,
    });
    
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('AI analysis error:', error);
    res.status(500).json({ success: false, message: error.message || 'AI分析失败' });
  }
});

// 汇总统计（必须在 /:id 之前）
router.get('/summary', requireViewPermission('repeatDiscounts'), getSummary);

// 单条操作路由
router.get('/', requireViewPermission('repeatDiscounts'), getAll);
router.get('/:id', requireViewPermission('repeatDiscounts'), getById);
router.post('/', requireEditPermission('repeatDiscounts'), create);
router.put('/:id', requireEditPermission('repeatDiscounts'), update);
router.delete('/:id', requireEditPermission('repeatDiscounts'), remove);

export default router;
