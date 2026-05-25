import React, { createContext, useContext, useEffect, useState } from 'react';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('profx_user');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('profx_token');
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then((res) => {
        setUser(res.data.user);
        localStorage.setItem('profx_user', JSON.stringify(res.data.user));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = (token, userData) => {
    localStorage.setItem('profx_token', token);
    localStorage.setItem('profx_user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('profx_token');
    localStorage.removeItem('profx_user');
    setUser(null);
    window.location.href = '/login';
  };

  const updateUser = (newUser) => {
    const merged = { ...(user || {}), ...newUser };
    localStorage.setItem('profx_user', JSON.stringify(merged));
    setUser(merged);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
