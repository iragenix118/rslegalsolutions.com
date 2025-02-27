import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests if it exists
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API calls
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (updates) => api.patch('/auth/profile', updates),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/auth/reset-password', { token, password })
};

// Services API calls
export const servicesAPI = {
  getAll: () => api.get('/services'),
  getBySlug: (slug) => api.get(`/services/${slug}`),
  getByCategory: (category) => api.get(`/services/category/${category}`),
  create: (serviceData) => api.post('/services', serviceData),
  update: (id, updates) => api.patch(`/services/${id}`, updates),
  delete: (id) => api.delete(`/services/${id}`),
  getCategories: () => api.get('/services/categories/list')
};

// Appointments API calls
export const appointmentsAPI = {
  create: (appointmentData) => api.post('/appointments', appointmentData),
  getAll: () => api.get('/appointments'),
  getByConfirmation: (code) => api.get(`/appointments/confirm/${code}`),
  updateStatus: (id, status) => api.patch(`/appointments/${id}/status`, { status }),
  getAvailableSlots: (date) => api.get(`/appointments/available-slots/${date}`),
  cancel: (code) => api.post(`/appointments/cancel/${code}`),
  getStats: () => api.get('/appointments/stats')
};

// Blog API calls
export const blogsAPI = {
  getAll: (params) => api.get('/blogs', { params }),
  getBySlug: (slug) => api.get(`/blogs/${slug}`),
  getByCategory: (category, params) => api.get(`/blogs/category/${category}`, { params }),
  getByTag: (tag, params) => api.get(`/blogs/tag/${tag}`, { params }),
  create: (blogData) => api.post('/blogs', blogData),
  update: (id, updates) => api.patch(`/blogs/${id}`, updates),
  delete: (id) => api.delete(`/blogs/${id}`),
  like: (id) => api.post(`/blogs/${id}/like`),
  getStats: () => api.get('/blogs/stats/overview')
};

// Contact API calls
export const contactAPI = {
  submit: (contactData) => api.post('/contact', contactData),
  getAll: (params) => api.get('/contact', { params }),
  getById: (id) => api.get(`/contact/${id}`),
  respond: (id, response) => api.patch(`/contact/${id}/respond`, response),
  updatePriority: (id, priority) => api.patch(`/contact/${id}/priority`, { priority }),
  assign: (id, assignedTo) => api.patch(`/contact/${id}/assign`, { assignedTo }),
  getStats: () => api.get('/contact/stats/overview')
};

// Upload API calls
export const uploadAPI = {
  uploadImage: (formData) => api.post('/upload/image', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
};

// Error handler helper
export const handleApiError = (error) => {
  const message = error.response?.data?.message || 'Something went wrong';
  const status = error.response?.status;
  const errors = error.response?.data?.errors;

  return {
    message,
    status,
    errors
  };
};

export default api;
