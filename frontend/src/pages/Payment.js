import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../utils/AuthContext';
import { PLATFORM_META, PLATFORM_ORDER } from '../utils/platforms';
import './Payment.css';

const PRICE_SINGLE = 599;
const PRICE_ALL = 999;

// Path to the QR image in /public. Replace that file to change the QR.
const QR_IMAGE = '/payment-qr.png';
const UPI_ID = process.env.REACT_APP_UPI_ID || '';

export default function Payment() {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [pendingRequest, setPendingRequest] = useState(null);

  const [planType, setPlanType] = useState('single');   // 'single' | 'all'
  const [platform, setPlatform] = useState('flipkart');
  const [upiRef, setUpiRef] = useState('');
  const [payerNote, setPayerNote] = useState('');

  const amount = planType === 'all' ? PRICE_ALL : PRICE_SINGLE;

  // If the seller already submitted, show the waiting state instead of the form.
  useEffect(() => {
    let alive = true;
    api.get('/manual-payment/my')
      .then((res) => {
        if (!alive) return;
        const r = res.data.request;
        if (r && r.status === 'pending') setPendingRequest(r);
      })
      .catch(() => {})
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, []);

  const submit = async () => {
    setError('');
    if (upiRef.trim().length < 4) {
      setError('Please enter the UPI reference / UTR number shown in your payment app.');
      return;
    }
    setLoading(true);
    try {
      const payload = planType === 'all'
        ? { planType: 'all', upiRef: upiRef.trim(), payerNote }
        : { planType: 'single', platform, upiRef: upiRef.trim(), payerNote };
      const res = await api.post('/manual-payment/submit', payload);
      setPendingRequest(res.data.request);
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.request) {
        setPendingRequest(err.response.data.request);
      } else {
        setError(err.response?.data?.error || 'Could not submit your payment. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="payment-page">
        <div className="payment-card"><div className="spinner" /></div>
      </div>
    );
  }

  // Awaiting verification
  if (pendingRequest) {
    return (
      <div className="payment-page">
        <div className="payment-card">
          <div className="payment-header">
            <div className="logo-mark"><img src="/logo-icon.svg" alt="" /></div>
            <h1>Payment received — verifying</h1>
            <p>Your account will be activated once we confirm the payment.</p>
          </div>

          <div style={waitBox}>
            <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 10 }}>⏳</div>
            <p style={{ margin: '0 0 6px', fontWeight: 600 }}>
              We're checking your payment of ₹{(pendingRequest.amount / 100).toFixed(0)}
            </p>
            <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
              Reference: <code>{pendingRequest.upiRef}</code>
            </p>
            <p style={{ margin: '14px 0 0', color: '#64748b', fontSize: 14 }}>
              This usually takes a few hours. You'll get an email the moment your
              account is active — no need to pay again.
            </p>
          </div>

          <div className="payment-user">
            Signed in as <strong>{user?.email}</strong>
          </div>

          <button className="btn btn-lg" onClick={() => window.location.reload()} style={{ width: '100%' }}>
            Refresh status
          </button>

          <p className="payment-secure" style={{ marginTop: 14 }}>
            Something wrong? Email <strong>support.profx@gmail.com</strong> with your reference number.
          </p>

          <button className="payment-logout" onClick={logout}>Sign out</button>
        </div>
      </div>
    );
  }

  // Payment form
  return (
    <div className="payment-page">
      <div className="payment-card payment-card-wide">
        <div className="payment-header">
          <div className="logo-mark"><img src="/logo-icon.svg" alt="" /></div>
          <h1>Activate your Profx account</h1>
          <p>Choose the marketplaces you sell on.</p>
        </div>

        <div className="plan-toggle">
          <button
            type="button"
            className={`plan-toggle-btn ${planType === 'single' ? 'is-active' : ''}`}
            onClick={() => setPlanType('single')}
          >
            <span className="plan-toggle-title">Single platform</span>
            <span className="plan-toggle-price">₹599<small>/mo</small></span>
          </button>
          <button
            type="button"
            className={`plan-toggle-btn ${planType === 'all' ? 'is-active' : ''}`}
            onClick={() => setPlanType('all')}
          >
            <span className="plan-toggle-badge">Best value</span>
            <span className="plan-toggle-title">All three platforms</span>
            <span className="plan-toggle-price">₹999<small>/mo</small></span>
          </button>
        </div>

        {planType === 'single' && (
          <div className="plan-platform-picker">
            <div className="picker-label">Which marketplace?</div>
            <div className="picker-options">
              {PLATFORM_ORDER.map((p) => {
                const meta = PLATFORM_META[p];
                const active = platform === p;
                return (
                  <button
                    key={p}
                    type="button"
                    className={`picker-option ${active ? 'is-active' : ''}`}
                    style={active ? { borderColor: meta.color } : undefined}
                    onClick={() => setPlatform(p)}
                  >
                    <span className="picker-emoji">{meta.emoji}</span>
                    <span className="picker-name">{meta.label}</span>
                    {active && <span className="picker-check" style={{ color: meta.color }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {planType === 'all' && (
          <div className="plan-all-summary">
            Includes <strong>Flipkart</strong>, <strong>Meesho</strong>, and <strong>Amazon</strong> —
            plus <strong>Image Tools</strong> and a combined dashboard across all three.
          </div>
        )}

        <ul className="payment-features">
          <li>✓ Unlimited orders &amp; uploads</li>
          <li>✓ Auto pickup ↔ settlement matching</li>
          <li>✓ Return tracking + undo</li>
          <li>✓ Bulk SKU pricing</li>
          <li>✓ Excel export</li>
          <li>✓ Live profit dashboard</li>
          {planType === 'all' && <li>✓ Image Tools (all-platform plan only)</li>}
        </ul>

        {/* Step 1: pay */}
        <div style={stepBox}>
          <div style={stepTitle}>1. Pay ₹{amount} using any UPI app</div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            <img
              src={QR_IMAGE}
              alt="Scan to pay"
              style={{ width: 190, height: 190, objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}
            />
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ margin: '0 0 8px', fontSize: 14, color: '#475569' }}>
                Scan the QR with GPay, PhonePe, Paytm or any UPI app and pay
                exactly <strong>₹{amount}</strong>.
              </p>
              {UPI_ID && (
                <p style={{ margin: '0 0 8px', fontSize: 14, color: '#475569' }}>
                  Or send to UPI ID: <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }}>{UPI_ID}</code>
                </p>
              )}
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                After paying, copy the <strong>UPI reference / UTR number</strong> from
                your payment app — you'll need it in the next step.
              </p>
            </div>
          </div>
        </div>

        {/* Step 2: confirm */}
        <div style={stepBox}>
          <div style={stepTitle}>2. Confirm your payment</div>
          <label style={{ display: 'block', marginTop: 10 }}>
            <span style={fieldLabel}>UPI reference / UTR number *</span>
            <input
              value={upiRef}
              onChange={(e) => setUpiRef(e.target.value)}
              placeholder="e.g. 412345678901"
              style={input}
            />
          </label>
          <label style={{ display: 'block', marginTop: 10 }}>
            <span style={fieldLabel}>Note (optional)</span>
            <input
              value={payerNote}
              onChange={(e) => setPayerNote(e.target.value)}
              placeholder="Anything we should know"
              style={input}
            />
          </label>
        </div>

        <div className="payment-user">
          Signed in as <strong>{user?.email}</strong>
        </div>

        {error && <div className="payment-error">{error}</div>}

        <button className="btn btn-lg" onClick={submit} disabled={loading} style={{ width: '100%' }}>
          {loading ? <span className="spinner" /> : `I've paid ₹${amount} — Submit for verification →`}
        </button>

        <p className="payment-secure">
          Your account is activated once we verify the payment. You'll get an email as soon as it's live.
        </p>

        <button className="payment-logout" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}

const stepBox = { border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, margin: '14px 0', background: '#fff' };
const stepTitle = { fontWeight: 700, fontSize: 15, color: '#0f172a' };
const fieldLabel = { display: 'block', fontSize: 13, color: '#64748b', marginBottom: 4 };
const input = { width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' };
const waitBox = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '22px 18px', textAlign: 'center', margin: '16px 0' };
