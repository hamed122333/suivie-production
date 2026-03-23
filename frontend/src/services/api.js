import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

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
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
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
  create: (data) => api.post('/tasks', data),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  updateStatus: (id, status, reasonBlocked) => api.put(`/tasks/${id}/status`, { status, reasonBlocked }),
  patchBoard: ({ workspaceId, columnOrders }) => api.patch('/tasks/board', { workspaceId, columnOrders }),
  delete: (id) => api.delete(`/tasks/${id}`),
};

export const userAPI = {
  getAll: () => api.get('/users'),
  create: (data) => api.post('/users', data),
};

export const dashboardAPI = {
  getStats: (workspaceId = null) => api.get('/dashboard', { params: workspaceId ? { workspaceId } : {} }),
};

export const workspaceAPI = {
  getAll: () => api.get('/workspaces'),
  create: (data) => api.post('/workspaces', data),
};

export default api;
