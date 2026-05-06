import axios from 'axios';
import { clearAuthSession } from '../utils/authStorage';

const API_URL =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:5000/api');

const api = axios.create({
  baseURL: API_URL,
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuthSession();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/auth/reset-password', { token, password }),
  me: () => api.get('/auth/me'),
};

export const notificationAPI = {
  getAll: (params = {}) => api.get('/notifications', { params }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

export const taskAPI = {
  getAll: (params = {}) => api.get('/tasks', { params }),
  exportExcel: (params = {}) => api.get('/tasks/export', { params, responseType: 'blob' }),
  getById: (id) => api.get(`/tasks/${id}`),
  getDetail: (id) => api.get(`/tasks/${id}/details`),
  create: (data) => api.post('/tasks', data),
  createBatch: ({ tasks, workspaceId, status = null }) => api.post('/tasks/bulk', { tasks, workspaceId, status }),
  importOrders: (formData) =>
    api.post('/tasks/import-orders', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  updateStatus: (id, status, reasonBlocked) => api.put(`/tasks/${id}/status`, { status, reasonBlocked }),
  dateNegotiation: (id, payload) => api.put(`/tasks/${id}/date-negotiation`, payload),
  addComment: (id, body) => api.post(`/tasks/${id}/comments`, { body }),
  patchBoard: ({ workspaceId, columnOrders }) => api.patch('/tasks/board', { workspaceId, columnOrders }),
  delete: (id) => api.delete(`/tasks/${id}`),
  confirmPredictive: (id) => api.put(`/tasks/${id}/confirm-predictive`),

  convertType: (id, newType) => api.post(`/tasks/${id}/convert-type`, { newType }),
};

export const userAPI = {
  getAll: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  delete: (id) => api.delete(`/users/${id}`),
};

export const dashboardAPI = {
  getStats: (workspaceId = null) => api.get('/dashboard', { params: workspaceId ? { workspaceId } : {} }),
};

export const workspaceAPI = {
  getAll: () => api.get('/workspaces'),
  create: (data) => api.post('/workspaces', data),
};

export const stockImportAPI = {
  getAll: () => api.get('/stock-import'),
  upload: (formData) =>
    api.post('/stock-import/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  createManual: (data) => api.post('/stock-import/manual', data),
  getActiveTasks: (id) => api.get(`/stock-import/${id}/active-tasks`),
};

export const stockMpAPI = {
  getAll: () => api.get('/stock-import-mp'),
  upload: (formData) =>
    api.post('/stock-import-mp/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  createManual: (data) => api.post('/stock-import-mp/manual', data),
  getActiveTasks: (id) => api.get(`/stock-import-mp/${id}/active-tasks`),
};

export default api;
