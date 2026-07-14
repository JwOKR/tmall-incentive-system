import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - 自动添加 JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('tmall_auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - 处理 401 自动跳转登录
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    // 401 未授权 - 清除登录状态并跳转登录页
    if (error.response?.status === 401) {
      localStorage.removeItem('tmall_auth_token');
      localStorage.removeItem('tmall_auth_user');
      // 避免在登录页循环跳转
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    const message = error.response?.data?.message || '网络错误';
    console.error('API Error:', message);
    return Promise.reject(error);
  }
);

// Dashboard API
export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getIncentiveSummary: (date?: string) => api.get('/dashboard/incentive-summary', { params: { date } }),
};

// Takers API
export const takersApi = {
  getAll: (params?: any) => api.get('/takers', { params }),
  getById: (id: string) => api.get(`/takers/${id}`),
  getDetail: (id: string, params?: { page?: number; pageSize?: number }) =>
    api.get(`/takers/${id}/detail`, { params }),
  create: (data: any) => api.post('/takers', data),
  batchCreate: (takers: any[]) => api.post('/takers/batch', { takers }, { timeout: 120000 }),
  update: (id: string, data: any) => api.put(`/takers/${id}`, data),
  delete: (id: string) => api.delete(`/takers/${id}`),
};

// Tasks API
export const tasksApi = {
  getAll: (params?: any) => api.get('/tasks', { params }),
  getById: (id: string) => api.get(`/tasks/${id}`),
  create: (data: any) => api.post('/tasks', data),
  batchCreate: (tasks: any[]) => api.post('/tasks/batch', { tasks }, { timeout: 120000 }),
  update: (id: string, data: any) => api.put(`/tasks/${id}`, data),
  delete: (id: string) => api.delete(`/tasks/${id}`),
  quickOrder: (data: { taskId: string; takerId: string; orderNo?: string; orderNo19?: string; actualPayment?: number; force?: boolean }) => api.post('/tasks/quick-order', data),
};

// Orders API
export const ordersApi = {
  getAll: (params?: any) => api.get('/orders', { params }),
  getById: (id: string) => api.get(`/orders/${id}`),
  create: (data: any) => api.post('/orders', data),
  batchCreate: (orders: any[]) => api.post('/orders/batch', { orders }, { timeout: 120000 }),
  batchUpdate: (orders: any[]) => api.put('/orders/batch/update', { orders }, { timeout: 120000 }),
  batchUpdateStatus: (ids: string[], field: string, value: boolean | string) =>
    api.put('/orders/batch/status', { ids, field, value }),
  update: (id: string, data: any) => api.put(`/orders/${id}`, data),
  delete: (id: string) => api.delete(`/orders/${id}`),
};

// Logs API
export const logsApi = {
  getAll: (params?: any) => api.get('/logs', { params }),
};

// Interval Stats API
export const intervalApi = {
  getStats: (params?: { takerId?: string; startDate?: string; endDate?: string }) =>
    api.get('/intervals', { params }),
};

// Commission Stats API
export const commissionApi = {
  getStats: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/commissions', { params }),
};

// Remind List API
export const remindApi = {
  getList: (params?: { type?: string }) =>
    api.get('/reminds', { params }),
};

// Anomaly API
export const anomalyApi = {
  getAnomalies: () => api.get('/anomalies'),
};

// Backup API
export const backupApi = {
  exportBackup: () => api.get('/backup/export'),
  importBackup: (data: any, mode: 'merge' | 'overwrite' = 'merge') =>
    api.post('/backup/import', { data, mode }, { timeout: 300000 }),
};

// Admin API
export const adminApi = {
  getAllUsers: () => api.get('/admin'),
  createUser: (data: { username: string; password: string; role?: string }) =>
    api.post('/admin', data),
  updateUser: (id: string, data: { username?: string; password?: string; role?: string }) =>
    api.put(`/admin/${id}`, data),
  deleteUser: (id: string) => api.delete(`/admin/${id}`),
};

// Settings API（系统设置）
export const settingsApi = {
  get: (group: string) => api.get('/settings', { params: { group } }),
  update: (settings: { key: string; value: string }[]) => api.put('/settings', { settings }),
};

// Repeat Discount API（回头客立减）
export const repeatDiscountApi = {
  getAll: (params?: any) => api.get('/repeat-discounts', { params }),
  getSummary: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/repeat-discounts/summary', { params }),
  getById: (id: string) => api.get(`/repeat-discounts/${id}`),
  create: (data: any) => api.post('/repeat-discounts', data),
  update: (id: string, data: any) => api.put(`/repeat-discounts/${id}`, data),
  delete: (id: string) => api.delete(`/repeat-discounts/${id}`),
  aiAnalysis: (recordId: string) => api.post('/repeat-discounts/ai-analysis', { recordId }, { timeout: 60000 }),
  aiAnalysisOverall: (startDate?: string, endDate?: string) =>
    api.post('/repeat-discounts/ai-analysis-overall', { startDate, endDate }, { timeout: 90000 }),
  getSavedAnalysis: (recordId: string) => api.get(`/repeat-discounts/ai-analysis/${recordId}`),
  getSavedOverallAnalysis: (startDate?: string, endDate?: string) =>
    api.get('/repeat-discounts/ai-analysis-overall', { params: { startDate, endDate } }),
};

export default api;