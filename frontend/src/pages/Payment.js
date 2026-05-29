import React, { useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../utils/AuthContext';
import { setActivePlatform } from '../utils/api';
import { PLATFORM_META, PLATFORM_ORDER } from '../utils/platforms';
import './Payment.css';

const PRICE_SINGLE = 599;
const PRICE_ALL = 999;

export default function Payment() {
  const { user, updateUser, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Plan selection state
  const [planType, setPlanType] = useState('single');         // 'single' | 'all'
  const [platform, setPlatform] = useState('flipkart');        // used when planType === 'single'

  const amount = planType === 'all' ? PRICE_ALL : PRICE_SINGLE;

  const handlePay = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = planType === 'all'
        ? { planType: 'all' }
        : { planType: 'single', platform };

      const orderRes = await api.post('/payment/create-order', payload);
      const { orderId, amount: amt, currency, keyId, user: u, platforms } = orderRes.data;

      if (typeof window.Razorpay !== 'function') {
        setError('Razorpay SDK failed to load. Please refresh the page.');
        setLoading(false);
        return;
      }

      const rzp = new window.Razorpay({
        key: keyId || process.env.REACT_APP_RAZORPAY_KEY_ID,
        amount: amt,
        currency,
        order_id: orderId,
        name: 'Profx',
        description: planType === 'all'
          ? 'Profx — All platforms (₹999/mo)'
          : `Profx — ${PLATFORM_META[platform].label} (₹599/mo)`,
        prefill: {
          email: u.email,
          name: u.name || '',
          contact: u.phone || '',
        },
        theme: { color: '#219BEF' },
        handler: async (response) => {
          try {
            const verifyRes = await api.post('/payment/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              ...payload,
            });
            const newPlans = verifyRes.data.plans || platforms || [platform];
            updateUser({ isActive: true, plans: newPlans });
            // Land on the first platform they now own
            setActivePlatform(newPlans[0] || 'flipkart');
            window.location.href = '/app';
          } catch (err) {
            setError('Payment verification failed. Please contact support.');
          }
        },
        modal: { ondismiss: () => setLoading(false) },
      });
      rzp.on('payment.failed', () => {
        setError('Payment failed. Please try again.');
        setLoading(false);
      });
      rzp.open();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not initiate payment');
      setLoading(false);
    }
  };

  return (
    <div className="payment-page">
      <div className="payment-card payment-card-wide">
        <div className="payment-header">
          <div className="logo-mark"><img src="/logo-icon.svg" alt="" /></div>
          <h1>Activate your Profx account</h1>
          <p>Choose the marketplaces you sell on.</p>
        </div>

        {/* Plan type toggle */}
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

        {/* Platform picker — only for single plan */}
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
            with a combined dashboard across all three.
          </div>
        )}

        <ul className="payment-features">
          <li>✓ Unlimited orders & uploads</li>
          <li>✓ Auto pickup ↔ settlement matching</li>
          <li>✓ Return tracking + undo</li>
          <li>✓ Bulk SKU pricing</li>
          <li>✓ Excel export</li>
          <li>✓ Live profit dashboard</li>
        </ul>

        <div className="payment-user">
          Signed in as <strong>{user?.email}</strong>
        </div>

        {error && <div className="payment-error">{error}</div>}

        <button className="btn btn-lg" onClick={handlePay} disabled={loading} style={{ width: '100%' }}>
          {loading ? <span className="spinner" /> : `Pay ₹${amount} & Activate Account →`}
        </button>

        <p className="payment-secure">🔒 Secured by Razorpay. Cards, UPI, Netbanking & Wallets supported.</p>

        <button className="payment-logout" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}
