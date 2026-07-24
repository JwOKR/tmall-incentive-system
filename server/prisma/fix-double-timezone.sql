-- 修复 fix-timezone.sql 跑两次导致的 +16 小时问题
-- 只修正 2026-07-24 09:00 之前创建的旧记录（减 8 小时）
-- 新记录（MySQL NOW() 生成的）不受影响
-- 执行前请先备份数据库！

-- 用户表
UPDATE users SET createdAt = DATE_SUB(createdAt, INTERVAL 8 HOUR), updatedAt = DATE_SUB(updatedAt, INTERVAL 8 HOUR) WHERE createdAt < '2026-07-24 09:00:00';

-- 接单人表
UPDATE order_takers SET createdAt = DATE_SUB(createdAt, INTERVAL 8 HOUR), updatedAt = DATE_SUB(updatedAt, INTERVAL 8 HOUR) WHERE createdAt < '2026-07-24 09:00:00';

-- 任务表
UPDATE tasks SET publishDate = DATE_SUB(publishDate, INTERVAL 8 HOUR), createdAt = DATE_SUB(createdAt, INTERVAL 8 HOUR), updatedAt = DATE_SUB(updatedAt, INTERVAL 8 HOUR) WHERE createdAt < '2026-07-24 09:00:00';

-- 订单表
UPDATE orders SET
  orderDate = DATE_SUB(orderDate, INTERVAL 8 HOUR),
  refundDate = DATE_SUB(refundDate, INTERVAL 8 HOUR),
  reviewCommissionDate = DATE_SUB(reviewCommissionDate, INTERVAL 8 HOUR),
  createdAt = DATE_SUB(createdAt, INTERVAL 8 HOUR),
  updatedAt = DATE_SUB(updatedAt, INTERVAL 8 HOUR)
WHERE createdAt < '2026-07-24 09:00:00';

-- 日志表
UPDATE logs SET createdAt = DATE_SUB(createdAt, INTERVAL 8 HOUR) WHERE createdAt < '2026-07-24 09:00:00';

-- 系统设置表
UPDATE system_settings SET updatedAt = DATE_SUB(updatedAt, INTERVAL 8 HOUR) WHERE updatedAt < '2026-07-24 09:00:00';

-- 回头客立减表
UPDATE repeat_discounts SET recordDate = DATE_SUB(recordDate, INTERVAL 8 HOUR), createdAt = DATE_SUB(createdAt, INTERVAL 8 HOUR), updatedAt = DATE_SUB(updatedAt, INTERVAL 8 HOUR) WHERE createdAt < '2026-07-24 09:00:00';

-- AI分析结果表
UPDATE repeat_discount_analyses SET createdAt = DATE_SUB(createdAt, INTERVAL 8 HOUR), updatedAt = DATE_SUB(updatedAt, INTERVAL 8 HOUR) WHERE createdAt < '2026-07-24 09:00:00';

-- 验证：检查修正后的时间
SELECT id, createdAt, updatedAt FROM tasks ORDER BY createdAt DESC LIMIT 5;
