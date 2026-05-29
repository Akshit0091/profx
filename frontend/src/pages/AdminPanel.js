import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import './AdminPanel.css';

export default function AdminPanel() {
  const [stats, setStats] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [modalSeller, setModalSeller] = useState(null);
  const [modalMonths, setModalMonths] = useState(1);
  const [modalBusy, setModalBusy] = useState(false);

  // Plans modal: lets admin toggle which platforms a seller has access to
  const [plansSeller, setPlansSeller] = useState(null);
  const [plansSelected, setPlansSelected] = useState([]);
  const [plansBusy, setPlansBusy] = useState(false);

  const openPlans = (seller) => {
    setPlansSeller(seller);
    setPlansSelected(Array.isArray(seller.plans) ? [...seller.plans] : []);
  };
  const closePlans = () => {
    setPlansSeller(null);
    setPlansSelected([]);
  };
  const togglePlan = (p) => {
    setPlansSelected((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);
  };
  const handleSavePlans = async () => {
    if (!plansSeller) return;
    setPlansBusy(true);
    try {
      await api.post(`/admin/sellers/${plansSeller.id}/plans`, { plans: plansSelected });
      showToast(`Updated platforms for ${plansSeller.email}`);
      closePlans();
      loadSellers();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update platforms', 'error');
    } finally {
      setPlansBusy(false);
    }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadStats = async () => {
    try {
      const r = await api.get('/admin/dashboard');
      setStats(r.data);
    } catch (err) {
      showToast('Failed to load stats', 'error');
    }
  };

  const loadSellers = async () => {
    try {
      setLoading(true);
      const r = await api.get('/admin/sellers', {
        params: { search, status: statusFilter, page, limit: 20 },
      });
      setSellers(r.data.sellers || []);
      setTotalPages(r.data.totalPages || 1);
    } catch (err) {
      showToast('Failed to load sellers', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    const t = setTimeout(loadSellers, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [search, statusFilter, page]);

  const openActivate = (seller) => {
    setModalSeller(seller);
    setModalMonths(1);
  };

  const closeModal = () => {
    setModalSeller(null);
    setModalBusy(false);
  };

  const handleActivate = async () => {
    if (!modalSeller) return;
    try {
      setModalBusy(true);
      await api.post(`/admin/sellers/${modalSeller.id}/activate`, { months: modalMonths });
      showToast(`Activated ${modalSeller.email} for ${modalMonths} month(s)`);
      closeModal();
      await Promise.all([loadStats(), loadSellers()]);
    } catch (err) {
      showToast(err.response?.data?.error || 'Activation failed', 'error');
      setModalBusy(false);
    }
  };

  const handleDeactivate = async (seller) => {
    if (!window.confirm(`Deactivate ${seller.email}? They will lose access immediately.`)) return;
    try {
      await api.post(`/admin/sellers/${seller.id}/deactivate`);
      showToast(`Deactivated ${seller.email}`);
      await Promise.all([loadStats(), loadSellers()]);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed', 'error');
    }
  };

  const handleDelete = async (seller) => {
    if (
      !window.confirm(
        `⚠ Permanently delete ${seller.email}?\n\nThis removes all their orders, SKUs and subscription data. This cannot be undone.`,
      )
    )
      return;
    try {
      await api.delete(`/admin/sellers/${seller.id}`);
      showToast('Seller deleted');
      await Promise.all([loadStats(), loadSellers()]);
    } catch (err) {
      showToast(err.response?.data?.error || 'Delete failed', 'error');
    }
  };

  const formatDate = (d) =>
    d
      ? new Date(d).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : '—';

  const statusBadge = (seller) => {
    if (!seller.isActive) return <span className="badge badge-warning">Pending</span>;
    const sub = seller.subscription;
    if (!sub) return <span className="badge badge-danger">No Sub</span>;
    const ended = sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) < new Date();
    if (ended) return <span className="badge badge-danger">Expired</span>;
    if (sub.status === 'active') return <span className="badge badge-success">Active</span>;
    return <span className="badge badge-warning">{sub.status}</span>;
  };

  return (
    <div className="admin-page">
        <div className="admin-header">
          <div>
            <h1>Admin Panel</h1>
            <p>Manage sellers and subscriptions</p>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Total Sellers</div>
            <div className="stat-value">{stats?.totalSellers ?? '—'}</div>
          </div>
          <div className="stat-card success">
            <div className="stat-label">Active</div>
            <div className="stat-value">{stats?.activeSellers ?? '—'}</div>
          </div>
          <div className="stat-card warning">
            <div className="stat-label">Pending Payment</div>
            <div className="stat-value">{stats?.pendingSellers ?? '—'}</div>
          </div>
          <div className="stat-card danger">
            <div className="stat-label">Expired</div>
            <div className="stat-value">{stats?.expiredSellers ?? '—'}</div>
          </div>
          <div className="stat-card primary">
            <div className="stat-label">Monthly Revenue</div>
            <div className="stat-value">
              ₹{(stats?.monthlyRevenue ?? 0).toLocaleString('en-IN')}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Last 30 Days</div>
            <div className="stat-value">{stats?.recentSignups ?? '—'}</div>
            <div className="stat-sub">new signups</div>
          </div>
        </div>

        <div className="filters-card">
          <div className="filters-row">
            <div className="filter-group grow">
              <label>Search</label>
              <input
                type="text"
                placeholder="Email or name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="filter-group">
              <label>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
        </div>

        <div className="table-card">
          <div className="table-wrap">
            <table className="sellers-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Subscription</th>
                  <th>Expires</th>
                  <th>Orders</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: 40 }}>
                      <div className="spinner"></div>
                    </td>
                  </tr>
                ) : sellers.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty-state">
                      <h3>No sellers found</h3>
                      <p>Try adjusting your search or filters.</p>
                    </td>
                  </tr>
                ) : (
                  sellers.map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{s.email}</td>
                      <td>{s.name || '—'}</td>
                      <td>{statusBadge(s)}</td>
                      <td className="muted">
                        {s.subscription
                          ? `${s.subscription.plan} • ${s.subscription.status}`
                          : '—'}
                      </td>
                      <td className="muted">
                        {formatDate(s.subscription?.currentPeriodEnd)}
                      </td>
                      <td>
                        <strong>{s._count?.orders ?? 0}</strong>
                      </td>
                      <td className="muted">{formatDate(s.createdAt)}</td>
                      <td className="actions-cell">
                        {s.isAdmin ? (
                          <span className="badge badge-primary">Admin</span>
                        ) : s.isActive ? (
                          <>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => openPlans(s)}
                              title="Manage platform access"
                            >
                              Platforms
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleDeactivate(s)}
                            >
                              Deactivate
                            </button>
                            <button
                              className="icon-btn"
                              onClick={() => handleDelete(s)}
                              title="Delete seller"
                            >
                              🗑
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => openPlans(s)}
                              title="Manage platform access"
                            >
                              Platforms
                            </button>
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => openActivate(s)}
                            >
                              Activate
                            </button>
                            <button
                              className="icon-btn"
                              onClick={() => handleDelete(s)}
                              title="Delete seller"
                            >
                              🗑
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                ← Prev
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next →
              </button>
            </div>
          )}
        </div>

        {/* Activate modal */}
        {modalSeller && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Activate Seller</h2>
                <button className="modal-close" onClick={closeModal}>
                  ×
                </button>
              </div>
              <div className="modal-body">
                <p className="modal-seller-info">
                  <strong>{modalSeller.email}</strong>
                  <br />
                  <span className="muted">{modalSeller.name || 'No name'}</span>
                </p>

                <div className="modal-note">
                  💡 Use this for <strong>manual UPI payments</strong> received outside Razorpay.
                  This will activate the seller's account for the selected duration.
                </div>

                <label className="modal-label">Activate for:</label>
                <div className="months-grid">
                  {[1, 2, 3, 6, 12].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`month-btn ${modalMonths === m ? 'active' : ''}`}
                      onClick={() => setModalMonths(m)}
                    >
                      {m} {m === 1 ? 'month' : 'months'}
                    </button>
                  ))}
                </div>

                <div className="modal-summary">
                  <span>Will be active until:</span>
                  <strong>
                    {new Date(
                      Date.now() + modalMonths * 30 * 24 * 60 * 60 * 1000,
                    ).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </strong>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={closeModal} disabled={modalBusy}>
                  Cancel
                </button>
                <button className="btn btn-success" onClick={handleActivate} disabled={modalBusy}>
                  {modalBusy ? 'Activating...' : `Activate for ${modalMonths} month(s)`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Platforms modal — toggle which marketplaces a seller can access */}
        {plansSeller && (
          <div className="modal-overlay" onClick={closePlans}>
            <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Manage platforms</h2>
                <button className="modal-close" onClick={closePlans}>×</button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: 6 }}>
                  <strong>{plansSeller.email}</strong>
                </p>
                <p className="muted" style={{ marginBottom: 18 }}>
                  Select which marketplaces this seller can access.
                </p>
                <div className="plans-grid">
                  {[
                    { key: 'flipkart', label: 'Flipkart', emoji: '🛒' },
                    { key: 'meesho',   label: 'Meesho',   emoji: '🛍️' },
                    { key: 'amazon',   label: 'Amazon',   emoji: '📦' },
                  ].map((opt) => {
                    const checked = plansSelected.includes(opt.key);
                    return (
                      <label
                        key={opt.key}
                        className={`plans-option ${checked ? 'is-checked' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePlan(opt.key)}
                        />
                        <span className="plans-emoji">{opt.emoji}</span>
                        <span className="plans-name">{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
                {plansSelected.length === 0 && (
                  <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
                    ⚠ Saving with zero platforms will lock this seller out of all data.
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={closePlans} disabled={plansBusy}>
                  Cancel
                </button>
                <button className="btn btn-success" onClick={handleSavePlans} disabled={plansBusy}>
                  {plansBusy ? 'Saving...' : 'Save platforms'}
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      </div>
  );
}
