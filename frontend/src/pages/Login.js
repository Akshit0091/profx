import React, { useState, useEffect } from 'react';
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

  const handleGoogleResponse = async (response) => {
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/google', { credential: response.credential });
      login(res.data.token, res.data.user);
      if (res.data.user.isAdmin) navigate('/admin');
      else if (!res.data.user.isActive) navigate('/payment');
      else navigate('/app');
    } catch (err) {
      setError(err.response?.data?.error || 'Google login failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google?.accounts?.id) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleResponse,
    });
    window.google.accounts.id.renderButton(
      document.getElementById('google-signin-btn'),
      { theme: 'outline', size: 'large', width: '100%', text: 'signin_with', shape: 'rectangular' }
    );
    // eslint-disable-next-line
  }, []);

  return (
    <div className="auth-page">
      <div className="auth-split">
        <div className="auth-panel">
          <Link to="/" className="auth-brand">
            <div className="logo-mark"><img src="/logo-icon.svg" alt="" /></div>
            <strong>Profx</strong>
          </Link>
          <h2>Welcome back</h2>
          <p className="auth-tag">Sign in to see your latest profits across all your marketplaces.</p>
          <ul className="auth-features">
            <li>✓ Flipkart, Meesho & Amazon</li>
            <li>✓ Real profit per SKU</li>
            <li>✓ Combined dashboard</li>
            <li>✓ Return-aware totals</li>
          </ul>
          <div className="auth-platforms">
            <img src="/flipkart.jpg" alt="Flipkart" className="auth-platform-logo" />
            <img src="/Meesho_logo.png" alt="Meesho" className="auth-platform-logo" />
            <img src="/Amazon_icon.svg" alt="Amazon" className="auth-platform-logo" />
          </div>
          <div className="auth-price-box">
            <div>ProfX</div>
            <strong>From ₹599 / month</strong>
          </div>
        </div>

        <div className="auth-form-wrap">
          <form className="auth-form" onSubmit={submit}>
            <h1>Sign in to ProfX</h1>
            <p className="auth-form-sub">Welcome back — enter your details below.</p>

            <div id="google-signin-btn" className="google-btn-wrap"></div>

            <div className="auth-divider">
              <span>or sign in with email</span>
            </div>

            <label>Email</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />

            <label>Password</label>
            <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />

            <div className="auth-forgot">
              <Link to="/forgot-password">Forgot password?</Link>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button type="submit" className="btn" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
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
