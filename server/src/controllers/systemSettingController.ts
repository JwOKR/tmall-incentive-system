import { Request, Response } from 'express';
import * as systemSettingService from '../services/systemSettingService';

// GET /settings?group=ai
export const getSettings = async (req: Request, res: Response) => {
  try {
    const group = (req.query.group as string) || 'general';
    const data = await systemSettingService.getSettings(group);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ success: false, message: '获取设置失败' });
  }
};

// PUT /settings
export const updateSettings = async (req: Request, res: Response) => {
  try {
    const { settings } = req.body;
    if (!Array.isArray(settings)) {
      return res.status(400).json({ success: false, message: '参数格式错误' });
    }
    const result = await systemSettingService.updateSettings(settings);
    res.json({ success: true, data: result, message: '设置已保存' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ success: false, message: '保存设置失败' });
  }
};
