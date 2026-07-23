import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

// Drop this into AdminPanel.js:
//   import PaymentRequests from './PaymentRequests';
//   ...
//   <PaymentRequests />
export default function PaymentRequests() {
  const [requests, setRequests] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/manual-payment/admin/requests', { params: { status } });
      setRequests(res.data.requests || []);
      setPendingCount(res.data.pendingCount || 0);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load payment requests');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const approve = async (r) => {
    const months = window.prompt(
      `Activate ${r.user.email} for how many months?\n\nPlan: ${r.planType === 'all' ? 'All platforms' : r.platforms.join(', ')}\nAmount: ₹${(r.amount / 100).toFixed(0)}\nUPI ref: ${r.upiRef}\n\nVerify this reference in your UPI app before approving.`,
      '1'
    );
    if (months === null) return;
    setBusyId(r.id); setError('');
    try {
      await api.post(`/manual-payment/admin/requests/${r.id}/approve`, {
        months: parseInt(months, 10) || 1,
      });
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Approval failed');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (r) => {
    const note = window.prompt(`Reject payment from ${r.user.email}?\n\nOptional reason (sent to the seller):`, '');
    if (note === null) return;
    setBusyId(r.id); setError('');
    try {
      await api.post(`/manual-payment/admin/requests/${r.id}/reject`, { adminNote: note });
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Rejection failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>
          Manual payments
          {pendingCount > 0 && (
            <span style={badge}>{pendingCount} pending</span>
          )}
        </h2>
        <div style={{ flex: 1 }} />
        {['pending', 'approved', 'rejected', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            style={status === s ? tabActive : tab}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <button onClick={load} style={tab}>Refresh</button>
      </div>

      {error && <div style={{ color: '#dc2626', marginBottom: 10 }}>{error}</div>}

      {loading ? (
        <div style={{ color: '#64748b', padding: 16 }}>Loading…</div>
      ) : requests.length === 0 ? (
        <div style={{ ...card, color: '#64748b', textAlign: 'center' }}>
          No {status === 'all' ? '' : status} payment requests.
        </div>
      ) : (
        requests.map((r) => (
          <div key={r.id} style={{ ...card, borderLeft: `4px solid ${statusColor(r.status)}` }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <strong>{r.user?.email}</strong>
              <span style={{ color: '#64748b', fontSize: 13 }}>{r.user?.name || '—'}</span>
              <span style={{ color: '#64748b', fontSize: 13 }}>{r.user?.phone || ''}</span>
              <div style={{ flex: 1 }} />
              <span style={{ ...pill, background: statusBg(r.status), color: statusColor(r.status) }}>
                {r.status}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 10, fontSize: 14 }}>
              <span>Plan: <strong>{r.planType === 'all' ? 'All platforms' : (r.platforms || []).join(', ')}</strong></span>
              <span>Amount: <strong>₹{(r.amount / 100).toFixed(0)}</strong></span>
              <span>UPI ref: <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }}>{r.upiRef}</code></span>
              <span style={{ color: '#64748b' }}>{new Date(r.createdAt).toLocaleString('en-IN')}</span>
            </div>

            {r.payerNote && (
              <div style={{ marginTop: 8, fontSize: 13, color: '#475569' }}>
                Note: {r.payerNote}
              </div>
            )}
            {r.adminNote && (
              <div style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>
                Admin note: {r.adminNote}
              </div>
            )}

            {r.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => approve(r)} disabled={busyId === r.id} style={btnApprove}>
                  {busyId === r.id ? 'Working…' : 'Verify & Activate'}
                </button>
                <button onClick={() => reject(r)} disabled={busyId === r.id} style={btnReject}>
                  Reject
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

const statusColor = (s) => (s === 'approved' ? '#16a34a' : s === 'rejected' ? '#dc2626' : '#f59e0b');
const statusBg = (s) => (s === 'approved' ? '#dcfce7' : s === 'rejected' ? '#fef2f2' : '#fef9c3');

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 10 };
const badge = { marginLeft: 10, background: '#fef9c3', color: '#b45309', padding: '2px 10px', borderRadius: 20, fontSize: 13, fontWeight: 700 };
const pill = { padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' };
const tab = { padding: '6px 12px', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 };
const tabActive = { ...tab, background: '#2563eb', color: '#fff', fontWeight: 600 };
const btnApprove = { padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' };
const btnReject = { padding: '8px 16px', background: '#f1f5f9', color: '#dc2626', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' };
