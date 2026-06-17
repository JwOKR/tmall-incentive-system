import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // You can add auth token here if needed
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
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
  update: (id: string, data: any) => api.put(`/orders/${id}`, data),
  delete: (id: string) => api.delete(`/orders/${id}`),
};

// Logs API
export const logsApi = {
  getAll: (params?: any) => api.get('/logs', { params }),
};

export default api;