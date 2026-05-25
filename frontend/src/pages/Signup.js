import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../utils/AuthContext';
import './Auth.css';

export default function Signup() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setError('Passwords do not match');
    if (form.password.length < 6) return setError('Password must be at least 6 characters');
    setLoading(true);
    try {
      const res = await api.post('/auth/signup', {
        email: form.email,
        password: form.password,
        name: form.name,
        phone: form.phone,
      });
      login(res.data.token, res.data.user);
      if (res.data.user.isAdmin) navigate('/admin');
      else navigate('/payment');
    } catch (err) {
      setError(err.response?.data?.error || 'Signup failed');
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
          <h2>Track every rupee</h2>
          <p className="auth-tag">Stop guessing your Flipkart profits.</p>
          <ul className="auth-features">
            <li>✓ Auto pickup ↔ settlement matching</li>
            <li>✓ Per-SKU profit, real-time</li>
            <li>✓ Returns auto-handled</li>
            <li>✓ Bulk SKU pricing</li>
          </ul>
          <div className="auth-price-box">
            <div>ProfX Starter</div>
            <strong>₹599 / month</strong>
          </div>
        </div>

        <div className="auth-form-wrap">
          <form className="auth-form" onSubmit={submit}>
            <h1>Create your account</h1>
            <p className="auth-form-sub">Takes 30 seconds — then pay ₹599 to activate.</p>

            <label>Full Name <span className="optional">(optional)</span></label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" />

            <label>Email</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />

            <label>Phone <span className="optional">(optional)</span></label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91" />

            <label>Password</label>
            <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" />

            <label>Confirm Password</label>
            <input type="password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} placeholder="Re-type password" />

            {error && <div className="auth-error">{error}</div>}

            <button type="submit" className="btn" disabled={loading} style={{ width: '100%', marginTop: 14 }}>
              {loading ? <span className="spinner" /> : 'Create Account & Pay →'}
            </button>

            <p className="auth-switch">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
