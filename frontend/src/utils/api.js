// utils/api.js
import axios from "axios";

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:5000/api",
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("profx_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("profx_token");
      localStorage.removeItem("profx_user");
      window.location.href = "/login";
    }
    // Handle subscription expired
    if (err.response?.data?.code === "SUBSCRIPTION_EXPIRED" ||
        err.response?.data?.code === "PAYMENT_REQUIRED") {
      window.location.href = "/payment";
    }
    return Promise.reject(err);
  }
);

export default api;
