import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';

// Import routes
import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';
import takerRoutes from './routes/takers';
import taskRoutes from './routes/tasks';
import orderRoutes from './routes/orders';
import logRoutes from './routes/logs';
import intervalRoutes from './routes/intervals';
import commissionRoutes from './routes/commissions';
import remindRoutes from './routes/reminds';
import anomalyRoutes from './routes/anomalies';

// Import middleware
import { authMiddleware } from './middleware/auth';

// Import utils
import logger from './utils/logger';
import { ensureAdminUser } from './utils/bootstrap';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim()),
  },
}));

// Health check (no auth)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (no auth required)
app.use('/api/auth', authRoutes);

// Protected API Routes
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/takers', authMiddleware, takerRoutes);
app.use('/api/tasks', authMiddleware, taskRoutes);
app.use('/api/orders', authMiddleware, orderRoutes);
app.use('/api/logs', authMiddleware, logRoutes);
app.use('/api/intervals', authMiddleware, intervalRoutes);
app.use('/api/commissions', authMiddleware, commissionRoutes);
app.use('/api/reminds', authMiddleware, remindRoutes);
app.use('/api/anomalies', authMiddleware, anomalyRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在',
  });
});

// Start server
const server = createServer(app);

server.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  // 启动时确保管理员用户存在
  ensureAdminUser();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

export default app;