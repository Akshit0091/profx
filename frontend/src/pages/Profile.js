import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../utils/AuthContext';
import './Profile.css';

export default function Profile() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: '', phone: '' });
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [amazonType, setAmazonType] = useState('');
  const [rates, setRates] = useState([]);
  const [newRate, setNewRate] = useState({ min: '', max: '', cost: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const hasAmazon = user?.plans?.includes('amazon');
  const showShipping = amazonType === 'selfship' || amazonType === 'both';

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (user) {
      setForm({ name: user.name || '', phone: user.phone || '' });
      setAmazonType(user.amazonSellerType || '');
    }
  }, [user]);

  useEffect(() => {
    if (hasAmazon) loadRates();
  }, [hasAmazon]);

  const loadRates = async () => {
    try {
      const res = await api.get('/auth/shipping-rates');
      setRates(res.data.rates || []);
    } catch (err) { /* ignore if endpoint not ready */ }
  };

  const saveProfile = async () => {
    try {
      setSaving(true);
      await api.put('/auth/profile', { name: form.name, phone: form.phone });
      setProfileSaved(true);
      showToast('Profile updated');
    } catch (err) {
      showToast(err.response?.data?.error || 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  const saveAmazonType = async (type) => {
    try {
      setAmazonType(type);
      await api.put('/auth/profile', { amazonSellerType: type });
      showToast(`Amazon seller type set to ${type === 'easyship' ? 'Easy Ship' : type === 'selfship' ? 'Self Ship' : 'Both'}`);
    } catch (err) {
      showToast('Failed to save', 'error');
    }
  };

  const changePassword = async () => {
    if (!pwForm.current || !pwForm.newPw) return showToast('Fill all fields', 'error');
    if (pwForm.newPw.length < 6) return showToast('Password must be at least 6 characters', 'error');
    if (pwForm.newPw !== pwForm.confirm) return showToast('Passwords do not match', 'error');
    try {
      setSaving(true);
      await api.post('/auth/change-password', { currentPassword: pwForm.current, newPassword: pwForm.newPw });
      showToast('Password changed');
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed', 'error');
    } finally { setSaving(false); }
  };

  const addRate = async () => {
    const min = parseInt(newRate.min);
    const max = parseInt(newRate.max);
    const cost = parseFloat(newRate.cost);
    if (isNaN(min) || isNaN(max) || isNaN(cost) || min >= max || cost < 0) {
      return showToast('Enter valid weight range and cost', 'error');
    }
    try {
      await api.post('/auth/shipping-rates', { minWeight: min, maxWeight: max, cost });
      setNewRate({ min: '', max: '', cost: '' });
      await loadRates();
      showToast('Rate added');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed', 'error');
    }
  };

  const deleteRate = async (id) => {
    try {
      await api.delete(`/auth/shipping-rates/${id}`);
      await loadRates();
      showToast('Rate removed');
    } catch (err) {
      showToast('Failed to delete', 'error');
    }
  };

  const sub = user?.subscription;

  return (
    <div className="profile-page">
      <h1>Profile & Settings</h1>
      <p className="text-muted">Manage your account, marketplace settings, and shipping configuration.</p>

      {/* Basic Info */}
      <div className="card profile-section">
        <h2>Basic Information</h2>
        <div className="profile-form">
          <div className="form-row">
            <label>Email</label>
            <input type="email" value={user?.email || ''} disabled className="input-disabled" />
          </div>
          <div className="form-row">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" />
          </div>
          <div className="form-row">
            <label>Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91" />
          </div>
          <button className="btn" onClick={saveProfile} disabled={saving}>Save Changes</button>
        </div>
      </div>

      {/* Change Password */}
      <div className="card profile-section">
        <h2>Change Password</h2>
        <div className="profile-form">
          <div className="form-row">
            <label>Current Password</label>
            <input type="password" value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} />
          </div>
          <div className="form-row">
            <label>New Password</label>
            <input type="password" value={pwForm.newPw} onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })} placeholder="At least 6 characters" />
          </div>
          <div className="form-row">
            <label>Confirm New Password</label>
            <input type="password" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} />
          </div>
          <button className="btn" onClick={changePassword} disabled={saving}>Update Password</button>
        </div>
      </div>

      {/* Subscription Info */}
      {sub && (
        <div className="card profile-section">
          <h2>Subscription</h2>
          <div className="sub-grid">
            <div className="sub-item">
              <span className="sub-label">Plan</span>
              <span className="sub-value">{sub.plan === 'starter' ? 'Single Platform' : sub.plan === 'all' ? 'All Platforms' : sub.plan || '—'}</span>
            </div>
            <div className="sub-item">
              <span className="sub-label">Status</span>
              <span className={`sub-value sub-status-${sub.status}`}>{sub.status}</span>
            </div>
            <div className="sub-item">
              <span className="sub-label">Amount</span>
              <span className="sub-value">{sub.amount ? `₹${(sub.amount / 100).toLocaleString('en-IN')}/month` : 'Free'}</span>
            </div>
            {sub.currentPeriodEnd && (
              <div className="sub-item">
                <span className="sub-label">Expires</span>
                <span className="sub-value">{new Date(sub.currentPeriodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            )}
          </div>
          <div className="sub-platforms">
            <span className="sub-label">Active Platforms:</span>
            {(user?.plans || []).map((p) => (
              <span key={p} className="platform-badge">{p}</span>
            ))}
          </div>
        </div>
      )}

      {/* Amazon Seller Type */}
      {hasAmazon && (
        <div className="card profile-section">
          <h2>Amazon Seller Type</h2>
          <p className="text-muted" style={{ margin: '0 0 16px' }}>
            This controls how shipping costs are calculated for your Amazon orders.
          </p>
          <div className="amazon-type-options">
            {[
              { value: 'easyship', label: 'Easy Ship', desc: 'Amazon handles delivery. Shipping fees are already deducted from your settlement.' },
              { value: 'selfship', label: 'Self Ship', desc: 'You ship orders yourself. Set SKU weights and your courier rate card below for accurate profit.' },
              { value: 'both', label: 'Both', desc: 'You use both methods. We detect the fulfillment type from each order automatically.' },
            ].map((opt) => (
              <label key={opt.value} className={`type-option ${amazonType === opt.value ? 'is-active' : ''}`}>
                <input type="radio" name="amazonType" value={opt.value} checked={amazonType === opt.value} onChange={() => saveAmazonType(opt.value)} />
                <div>
                  <strong>{opt.label}</strong>
                  <p>{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Shipping Rate Card */}
      {hasAmazon && showShipping && (
        <div className="card profile-section">
          <h2>Shipping Rate Card</h2>
          <p className="text-muted" style={{ margin: '0 0 16px' }}>
            Enter your courier partner's weight-based pricing. These rates are used to calculate shipping cost for Self Ship orders.
          </p>

          {rates.length > 0 && (
            <table className="rate-table">
              <thead>
                <tr><th>From (g)</th><th>To (g)</th><th>Cost (₹)</th><th></th></tr>
              </thead>
              <tbody>
                {rates.sort((a, b) => a.minWeight - b.minWeight).map((r) => (
                  <tr key={r.id}>
                    <td>{r.minWeight}</td>
                    <td>{r.maxWeight}</td>
                    <td>₹{r.cost}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => deleteRate(r.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="rate-add">
            <input type="number" placeholder="From (g)" value={newRate.min} onChange={(e) => setNewRate({ ...newRate, min: e.target.value })} />
            <input type="number" placeholder="To (g)" value={newRate.max} onChange={(e) => setNewRate({ ...newRate, max: e.target.value })} />
            <input type="number" step="0.01" placeholder="Cost ₹" value={newRate.cost} onChange={(e) => setNewRate({ ...newRate, cost: e.target.value })} />
            <button className="btn" onClick={addRate}>Add Rate</button>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
