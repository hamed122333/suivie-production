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
  me: () => api.get('/auth/me'),
};

export const taskAPI = {
  getAll: (params = {}) => api.get('/tasks', { params }),
  getById: (id) => api.get(`/tasks/${id}`),
  getDetail: (id) => api.get(`/tasks/${id}/details`),
  create: (data) => api.post('/tasks', data),
  createBatch: ({ tasks, workspaceId, status = 'TODO' }) => api.post('/tasks/bulk', { tasks, workspaceId, status }),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  updateStatus: (id, status, reasonBlocked) => api.put(`/tasks/${id}/status`, { status, reasonBlocked }),
  addComment: (id, body) => api.post(`/tasks/${id}/comments`, { body }),
  patchBoard: ({ workspaceId, columnOrders }) => api.patch('/tasks/board', { workspaceId, columnOrders }),
  delete: (id) => api.delete(`/tasks/${id}`),
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
};

export default api;
