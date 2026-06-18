import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import './Auth.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setStatus('sending');
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError(err.response?.data?.error || 'Something went wrong. Try again.');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card-centered">
        <Link to="/" className="auth-brand-sm">
          <img src="/logo-icon.svg" alt="" width={40} height={40} />
        </Link>

        {status === 'sent' ? (
          <div className="auth-success-state">
            <div className="auth-success-icon">✉️</div>
            <h1>Check your email</h1>
            <p>If an account exists for <strong>{email}</strong>, we've sent a password reset link. It expires in 1 hour.</p>
            <p className="text-muted" style={{ fontSize: 13, marginTop: 16 }}>
              Didn't receive it? Check your spam folder, or{' '}
              <button className="link-btn" onClick={() => { setStatus('idle'); setEmail(''); }}>try again</button>.
            </p>
            <Link to="/login" className="btn" style={{ marginTop: 20, display: 'inline-block' }}>
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1>Forgot your password?</h1>
            <p className="auth-form-sub">Enter your email and we'll send a reset link.</p>

            <form onSubmit={submit} className="auth-form" style={{ maxWidth: 380 }}>
              <label>Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={status === 'sending'}
              />

              {error && <div className="auth-error">{error}</div>}

              <button type="submit" className="btn" disabled={status === 'sending'} style={{ width: '100%', marginTop: 8 }}>
                {status === 'sending' ? <span className="spinner" /> : 'Send reset link →'}
              </button>

              <p className="auth-switch" style={{ marginTop: 20 }}>
                Remember your password? <Link to="/login">Sign in</Link>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
