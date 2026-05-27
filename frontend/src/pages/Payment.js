import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../utils/AuthContext';
import './Payment.css';

export default function Payment() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePay = async () => {
    setLoading(true);
    setError('');
    try {
      const orderRes = await api.post('/payment/create-order');
      const { orderId, amount, currency, keyId, user: u } = orderRes.data;

      if (typeof window.Razorpay !== 'function') {
        setError('Razorpay SDK failed to load. Please refresh the page.');
        setLoading(false);
        return;
      }

      const rzp = new window.Razorpay({
        key: keyId || process.env.REACT_APP_RAZORPAY_KEY_ID,
        amount,
        currency,
        order_id: orderId,
        name: 'ProfX',
        description: 'Monthly subscription — ₹599',
        prefill: {
          email: u.email,
          name: u.name || '',
          contact: u.phone || '',
        },
        theme: { color: '#2563eb' },
        handler: async (response) => {
          try {
            await api.post('/payment/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            updateUser({ isActive: true });
            // Hard reload to refresh user state cleanly
            window.location.href = '/app';
          } catch (err) {
            setError('Payment verification failed. Please contact support.');
          }
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
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
      <div className="payment-card">
        <div className="payment-header">
          <div className="logo-mark"><img src="/logo-icon.svg" alt="" /></div>
          <h1>Activate your Profx account</h1>
          <p>One simple payment to unlock unlimited profit tracking.</p>
        </div>

        <div className="payment-plan">
          <div className="plan-name">
            <strong>ProfX Starter</strong>
            <span className="plan-cycle">Monthly</span>
          </div>
          <div className="plan-price">
            <span className="amount">₹599</span>
            <span className="period">/month</span>
          </div>
        </div>

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
          {loading ? <span className="spinner" /> : 'Pay ₹599 & Activate Account →'}
        </button>

        <p className="payment-secure">🔒 Secured by Razorpay. Cards, UPI, Netbanking & Wallets supported.</p>

        <button className="payment-logout" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}
