-- 时区历史数据修正脚本
-- 将所有 DateTime 字段从 UTC 时间修正为北京时间（+8 小时）
-- 执行前请先备份数据库！

-- 用户表
UPDATE users SET createdAt = DATE_ADD(createdAt, INTERVAL 8 HOUR), updatedAt = DATE_ADD(updatedAt, INTERVAL 8 HOUR);

-- 接单人表
UPDATE order_takers SET createdAt = DATE_ADD(createdAt, INTERVAL 8 HOUR), updatedAt = DATE_ADD(updatedAt, INTERVAL 8 HOUR);

-- 任务表
UPDATE tasks SET publishDate = DATE_ADD(publishDate, INTERVAL 8 HOUR), createdAt = DATE_ADD(createdAt, INTERVAL 8 HOUR), updatedAt = DATE_ADD(updatedAt, INTERVAL 8 HOUR);

-- 订单表（refundDate 和 reviewCommissionDate 是可空字段，DATE_ADD(NULL, ...) 返回 NULL，安全）
UPDATE orders SET
  orderDate = DATE_ADD(orderDate, INTERVAL 8 HOUR),
  refundDate = DATE_ADD(refundDate, INTERVAL 8 HOUR),
  reviewCommissionDate = DATE_ADD(reviewCommissionDate, INTERVAL 8 HOUR),
  createdAt = DATE_ADD(createdAt, INTERVAL 8 HOUR),
  updatedAt = DATE_ADD(updatedAt, INTERVAL 8 HOUR);

-- 日志表
UPDATE logs SET createdAt = DATE_ADD(createdAt, INTERVAL 8 HOUR);

-- 系统设置表
UPDATE system_settings SET updatedAt = DATE_ADD(updatedAt, INTERVAL 8 HOUR);

-- 回头客立减表
UPDATE repeat_discounts SET recordDate = DATE_ADD(recordDate, INTERVAL 8 HOUR), createdAt = DATE_ADD(createdAt, INTERVAL 8 HOUR), updatedAt = DATE_ADD(updatedAt, INTERVAL 8 HOUR);

-- AI分析结果表
UPDATE repeat_discount_analyses SET createdAt = DATE_ADD(createdAt, INTERVAL 8 HOUR), updatedAt = DATE_ADD(updatedAt, INTERVAL 8 HOUR);

-- 验证：检查修正后的时间是否正确（应该显示北京时间）
SELECT NOW() AS current_time, createdat AS sample_user_time FROM users LIMIT 1;
