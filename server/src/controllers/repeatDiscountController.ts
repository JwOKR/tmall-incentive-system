import { Request, Response } from 'express';
import * as repeatDiscountService from '../services/repeatDiscountService';

// ──────────────────────────────────────
// GET /repeat-discounts
// ──────────────────────────────────────
export const getAll = async (req: Request, res: Response) => {
  try {
    const data = await repeatDiscountService.getRepeatDiscountList(req.query as any);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching repeat discounts:', error);
    res.status(500).json({ success: false, message: '获取回头客立减列表失败' });
  }
};

// ──────────────────────────────────────
// GET /repeat-discounts/summary
// ──────────────────────────────────────
export const getSummary = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
    const data = await repeatDiscountService.getRepeatDiscountSummary(startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching repeat discount summary:', error);
    res.status(500).json({ success: false, message: '获取汇总统计失败' });
  }
};

// ──────────────────────────────────────
// GET /repeat-discounts/:id
// ──────────────────────────────────────
export const getById = async (req: Request, res: Response) => {
  try {
    const item = await repeatDiscountService.getRepeatDiscountById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: '记录不存在' });
    res.json({ success: true, data: item });
  } catch (error) {
    console.error('Error fetching repeat discount:', error);
    res.status(500).json({ success: false, message: '获取记录详情失败' });
  }
};

// ──────────────────────────────────────
// POST /repeat-discounts
// ──────────────────────────────────────
export const create = async (req: Request, res: Response) => {
  try {
    const item = await repeatDiscountService.createRepeatDiscount(req.body);
    res.json({ success: true, data: item, message: '创建成功' });
  } catch (error: any) {
    console.error('Error creating repeat discount:', error);
    res.status(400).json({ success: false, message: error.message || '创建失败' });
  }
};

// ──────────────────────────────────────
// PUT /repeat-discounts/:id
// ──────────────────────────────────────
export const update = async (req: Request, res: Response) => {
  try {
    const existing = await repeatDiscountService.getRepeatDiscountById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: '记录不存在' });

    const item = await repeatDiscountService.updateRepeatDiscount(req.params.id, req.body);
    res.json({ success: true, data: item, message: '更新成功' });
  } catch (error: any) {
    console.error('Error updating repeat discount:', error);
    res.status(400).json({ success: false, message: error.message || '更新失败' });
  }
};

// ──────────────────────────────────────
// DELETE /repeat-discounts/:id
// ──────────────────────────────────────
export const remove = async (req: Request, res: Response) => {
  try {
    const existing = await repeatDiscountService.getRepeatDiscountById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: '记录不存在' });

    await repeatDiscountService.deleteRepeatDiscount(req.params.id);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('Error deleting repeat discount:', error);
    res.status(500).json({ success: false, message: '删除失败' });
  }
};
