import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('profx_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const code = err.response?.data?.code;
    const path = window.location.pathname;

    if (status === 401 && !path.startsWith('/login') && !path.startsWith('/signup') && path !== '/') {
      localStorage.removeItem('profx_token');
      localStorage.removeItem('profx_user');
      window.location.href = '/login';
    }
    if (status === 403 && code === 'PAYMENT_REQUIRED' && path !== '/payment') {
      window.location.href = '/payment';
    }
    return Promise.reject(err);
  }
);

export default api;
