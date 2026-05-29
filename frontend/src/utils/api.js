import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
});

// ── Active platform ─────────────────────────────────────────────
// The app shows one platform's data at a time (Flipkart / Meesho / Amazon).
// We persist the choice and attach it as a header on every request so the
// backend's platformMiddleware filters correctly.
const PLATFORM_KEY = 'profx_active_platform';

export function getActivePlatform() {
  return localStorage.getItem(PLATFORM_KEY) || 'flipkart';
}
export function setActivePlatform(platform) {
  localStorage.setItem(PLATFORM_KEY, platform);
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('profx_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['x-platform'] = getActivePlatform();
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
