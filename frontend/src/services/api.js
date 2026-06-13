import axios from 'axios';
import { clearAuthSession } from '../utils/authStorage';

const API_URL =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:5000/api');

const api = axios.create({
  baseURL: API_URL,
  timeout: 20000, // 20 s — prevents hung requests from leaking forever
});

// Les imports Excel (gros volumes + recalcul FIFO + latence Render→Supabase +
// éventuel cold start free tier) peuvent dépasser largement 20 s. On leur donne
// un timeout dédié bien plus long pour éviter les faux « échec » alors que le
// backend finit le traitement.
const IMPORT_TIMEOUT = 180000; // 3 min

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses — use SPA navigation (no full reload)
// clearAuthSession dispatches AUTH_CHANGED_EVENT → AuthContext zeros out user
// → ProtectedRoute redirects to /login via React Router
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuthSession(); // clears localStorage + fires AUTH_CHANGED_EVENT
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
  getPendingApproval: () => api.get('/tasks/pending-approval'),
  approveOrders: (taskIds) => api.post('/tasks/approve', { taskIds }),
  rejectOrders: (taskIds) => api.post('/tasks/reject', { taskIds }),
  getAll: (params = {}) => api.get('/tasks', { params }),
  exportExcel: (params = {}) => api.get('/tasks/export', { params, responseType: 'blob' }),
  getById: (id) => api.get(`/tasks/${id}`),
  getDetail: (id) => api.get(`/tasks/${id}/details`),
  create: (data) => api.post('/tasks', data),
  createBatch: ({ tasks, workspaceId, status = null }) => api.post('/tasks/bulk', { tasks, workspaceId, status }),
  importOrders: (formData) =>
    api.post('/tasks/import-orders', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: IMPORT_TIMEOUT,
    }),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  updateStatus: (id, status, reasonBlocked) => api.put(`/tasks/${id}/status`, { status, reasonBlocked }),
  dateNegotiation: (id, payload) => api.put(`/tasks/${id}/date-negotiation`, payload),
  partialPreparation: (id, payload) => api.put(`/tasks/${id}/partial-preparation`, payload),
  addComment: (id, body) => api.post(`/tasks/${id}/comments`, { body }),
  delete: (id) => api.delete(`/tasks/${id}`),
  confirmPredictive: (id) => api.put(`/tasks/${id}/confirm-predictive`),

  convertType: (id, newType) => api.post(`/tasks/${id}/convert-type`, { newType }),
  markDelivered: (id, payload) => api.post(`/tasks/${id}/mark-delivered`, payload || {}),
};

export const userAPI = {
  getAll: () => api.get('/users'),
  create: (data) => api.post('/users', { ...data, commercialId: data.commercialId || undefined }),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  importCommercials: (formData) => api.post('/users/import-commercials', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: IMPORT_TIMEOUT,
  }),
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
  getByArticle: (article) => api.get(`/stock-import/article/${encodeURIComponent(article)}`),
  upload: (formData) =>
    api.post('/stock-import/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: IMPORT_TIMEOUT,
    }),
  createManual: (data) => api.post('/stock-import/manual', data),
  getActiveTasks: (id) => api.get(`/stock-import/${id}/active-tasks`),
};

export default api;
