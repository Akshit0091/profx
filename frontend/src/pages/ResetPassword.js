import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import './Auth.css';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [status, setStatus] = useState('idle'); // idle | saving | done | error
  const [error, setError] = useState('');

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card-centered">
          <h1>Invalid reset link</h1>
          <p>This link is missing or malformed. Please request a new one.</p>
          <Link to="/forgot-password" className="btn" style={{ marginTop: 16, display: 'inline-block' }}>
            Request new reset link →
          </Link>
        </div>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) return setError('Password must be at least 6 characters');
    if (form.password !== form.confirm) return setError('Passwords do not match');

    setStatus('saving');
    try {
      await api.post('/auth/reset-password', { token, password: form.password });
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err.response?.data?.error || 'Reset failed. The link may have expired.');
    }
  };

  if (status === 'done') {
    return (
      <div className="auth-page">
        <div className="auth-card-centered">
          <div className="auth-success-icon">✓</div>
          <h1>Password updated</h1>
          <p>Your password has been reset. You can now sign in with your new password.</p>
          <button className="btn" style={{ marginTop: 16 }} onClick={() => navigate('/login')}>
            Sign in →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card-centered">
        <Link to="/" className="auth-brand-sm">
          <img src="/logo-icon.svg" alt="" width={40} height={40} />
        </Link>
        <h1>Set a new password</h1>
        <p className="auth-form-sub">Choose a strong password for your ProfX account.</p>

        <form onSubmit={submit} className="auth-form" style={{ maxWidth: 380 }}>
          <label>New Password</label>
          <input
            type="password" required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="At least 6 characters"
            disabled={status === 'saving'}
          />

          <label>Confirm New Password</label>
          <input
            type="password" required
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            placeholder="Re-type password"
            disabled={status === 'saving'}
          />

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn" disabled={status === 'saving'} style={{ width: '100%', marginTop: 8 }}>
            {status === 'saving' ? <span className="spinner" /> : 'Update password →'}
          </button>
        </form>
      </div>
    </div>
  );
}
