import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../utils/AuthContext';
import './Auth.css';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', form);
      login(res.data.token, res.data.user);
      if (res.data.user.isAdmin) navigate('/admin');
      else if (!res.data.user.isActive) navigate('/payment');
      else navigate('/app');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-split">
        <div className="auth-panel">
          <Link to="/" className="auth-brand">
            <div className="logo-mark">PX</div>
            <strong>ProfX</strong>
          </Link>
          <h2>Welcome back</h2>
          <p className="auth-tag">Sign in to see your latest profits.</p>
          <ul className="auth-features">
            <li>✓ Auto-matched orders</li>
            <li>✓ Real profit per SKU</li>
            <li>✓ Return-aware totals</li>
          </ul>
          <div className="auth-price-box">
            <div>ProfX Starter</div>
            <strong>₹599 / month</strong>
          </div>
        </div>

        <div className="auth-form-wrap">
          <form className="auth-form" onSubmit={submit}>
            <h1>Sign in to ProfX</h1>
            <p className="auth-form-sub">Welcome back — enter your details below.</p>

            <label>Email</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />

            <label>Password</label>
            <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />

            {error && <div className="auth-error">{error}</div>}

            <button type="submit" className="btn" disabled={loading} style={{ width: '100%', marginTop: 14 }}>
              {loading ? <span className="spinner" /> : 'Sign In →'}
            </button>

            <p className="auth-switch">
              Don't have an account? <Link to="/signup">Create one</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
