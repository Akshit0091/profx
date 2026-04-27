// pages/AdminPanel.js - ProfX Admin Dashboard
import React, { useEffect, useState, useCallback } from "react";
import api from "../utils/api";
import toast from "react-hot-toast";
import "./AdminPanel.css";

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function AdminPanel() {
  const [stats, setStats]       = useState(null);
  const [sellers, setSellers]   = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage]         = useState(1);
  const [activating, setActivating] = useState({});
  const [selectedSeller, setSelectedSeller] = useState(null);
  const [activateMonths, setActivateMonths] = useState(1);

  const loadStats = async () => {
    try {
      const res = await api.get("/admin/dashboard");
      setStats(res.data.data);
    } catch { toast.error("Failed to load stats"); }
  };

  const loadSellers = useCallback(async () => {
    setLoading(true);
    try {
      const params = { search, page, limit: 15 };
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await api.get("/admin/sellers", { params });
      setSellers(res.data.data);
      setPagination(res.data.pagination);
    } catch { toast.error("Failed to load sellers"); }
    finally { setLoading(false); }
  }, [search, statusFilter, page]);

  useEffect(() => { loadStats(); }, []);
  useEffect(() => { loadSellers(); }, [loadSellers]);

  const handleActivate = async (id, months = 1) => {
    setActivating((p) => ({ ...p, [id]: true }));
    try {
      await api.post(`/admin/sellers/${id}/activate`, { months, paymentNote: "Manual UPI payment" });
      toast.success(`Seller activated for ${months} month(s)`);
      loadSellers(); loadStats();
      setSelectedSeller(null);
    } catch { toast.error("Activation failed"); }
    finally { setActivating((p) => ({ ...p, [id]: false })); }
  };

  const handleDeactivate = async (id, email) => {
    if (!window.confirm(`Deactivate ${email}?`)) return;
    try {
      await api.post(`/admin/sellers/${id}/deactivate`);
      toast.success("Seller deactivated");
      loadSellers(); loadStats();
    } catch { toast.error("Failed"); }
  };

  const handleDelete = async (id, email) => {
    if (!window.confirm(`Permanently delete ${email} and ALL their data?`)) return;
    try {
      await api.delete(`/admin/sellers/${id}`);
      toast.success("Seller deleted");
      loadSellers(); loadStats();
    } catch { toast.error("Delete failed"); }
  };

  return (
    <div className="admin-page fade-in">
      <div className="page-header">
        <h1 className="page-title">Admin Panel</h1>
        <p className="page-subtitle">Manage all ProfX sellers and subscriptions</p>
      </div>

      {/* ── Stats Row ── */}
      {stats && (
        <div className="admin-stats fade-in">
          <div className="admin-stat-card">
            <div className="admin-stat-icon" style={{ background: "#eff6ff" }}>👥</div>
            <div className="admin-stat-value">{stats.totalSellers}</div>
            <div className="admin-stat-label">Total Sellers</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-icon" style={{ background: "#ecfdf5" }}>✅</div>
            <div className="admin-stat-value" style={{ color: "var(--green)" }}>{stats.activeSellers}</div>
            <div className="admin-stat-label">Active</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-icon" style={{ background: "#fffbeb" }}>⏳</div>
            <div className="admin-stat-value" style={{ color: "var(--yellow)" }}>{stats.pendingSellers}</div>
            <div className="admin-stat-label">Pending Payment</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-icon" style={{ background: "#fef2f2" }}>❌</div>
            <div className="admin-stat-value" style={{ color: "var(--red)" }}>{stats.expiredSellers}</div>
            <div className="admin-stat-label">Expired</div>
          </div>
          <div className="admin-stat-card revenue-card">
            <div className="admin-stat-icon" style={{ background: "#f0fdf4" }}>💰</div>
            <div className="admin-stat-value" style={{ color: "var(--green)" }}>
              ₹{(stats.monthlyRevenue).toLocaleString("en-IN")}
            </div>
            <div className="admin-stat-label">Monthly Revenue</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-icon" style={{ background: "#eff6ff" }}>🆕</div>
            <div className="admin-stat-value">{stats.recentSignups}</div>
            <div className="admin-stat-label">Last 30 Days</div>
          </div>
        </div>
      )}

      {/* ── Activate Modal ── */}
      {selectedSeller && (
        <div className="modal-overlay" onClick={() => setSelectedSeller(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Activate Seller</h3>
            <p className="modal-sub">{selectedSeller.email}</p>
            <div style={{ margin: "20px 0" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text2)", display: "block", marginBottom: 8 }}>
                Activate for how many months?
              </label>
              <select
                value={activateMonths}
                onChange={(e) => setActivateMonths(Number(e.target.value))}
                style={{ width: "100%" }}
              >
                <option value={1}>1 Month (₹599)</option>
                <option value={2}>2 Months (₹1,198)</option>
                <option value={3}>3 Months (₹1,797)</option>
                <option value={6}>6 Months (₹3,594)</option>
                <option value={12}>12 Months (₹7,188)</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setSelectedSeller(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                onClick={() => handleActivate(selectedSeller.id, activateMonths)}
                disabled={activating[selectedSeller.id]}
              >
                {activating[selectedSeller.id] ? <span className="spinner" /> : null}
                ✓ Activate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="admin-filters card">
        <input
          type="text"
          placeholder="Search by email or name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ flex: 2, minWidth: 200 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ flex: 1, minWidth: 150 }}
        >
          <option value="all">All Sellers</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
        <button className="btn-secondary" onClick={() => { setSearch(""); setStatusFilter("all"); setPage(1); }}>
          Reset
        </button>
      </div>

      {/* ── Sellers Table ── */}
      <div className="table-wrap mt-4">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Email</th>
              <th>Name</th>
              <th>Status</th>
              <th>Subscription</th>
              <th>Expires On</th>
              <th>Orders</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center" style={{ padding: 48 }}><span className="spinner" /></td></tr>
            ) : sellers.length === 0 ? (
              <tr><td colSpan={9} className="text-center text-muted" style={{ padding: 48 }}>No sellers found</td></tr>
            ) : sellers.map((s, i) => (
              <tr key={s.id}>
                <td className="text-muted" style={{ fontSize: 12 }}>{(page - 1) * 15 + i + 1}</td>
                <td style={{ fontWeight: 600 }}>{s.email}</td>
                <td style={{ color: "var(--text2)" }}>{s.name || "—"}</td>
                <td>
                  {s.isActive
                    ? <span className="badge badge-green">● Active</span>
                    : <span className="badge badge-red">● Inactive</span>}
                </td>
                <td>
                  {s.subscription?.status === "active" && <span className="badge badge-green">Active</span>}
                  {s.subscription?.status === "pending" && <span className="badge badge-yellow">Pending</span>}
                  {s.subscription?.status === "expired" && <span className="badge badge-red">Expired</span>}
                  {!s.subscription && <span className="badge badge-yellow">None</span>}
                </td>
                <td style={{ color: "var(--text2)", fontSize: 13 }}>
                  {fmtDate(s.subscription?.currentPeriodEnd)}
                </td>
                <td style={{ fontFamily: "var(--mono)", fontSize: 13 }}>
                  {s._count?.orders ?? 0}
                </td>
                <td style={{ color: "var(--text2)", fontSize: 13 }}>{fmtDate(s.createdAt)}</td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    {!s.isActive ? (
                      <button
                        className="btn-success"
                        style={{ padding: "5px 12px", fontSize: 12, whiteSpace: "nowrap" }}
                        onClick={() => { setSelectedSeller(s); setActivateMonths(1); }}
                      >
                        ✓ Activate
                      </button>
                    ) : (
                      <button
                        className="btn-danger"
                        style={{ padding: "5px 12px", fontSize: 12 }}
                        onClick={() => handleDeactivate(s.id, s.email)}
                      >
                        Deactivate
                      </button>
                    )}
                    <button
                      className="btn-danger"
                      style={{ padding: "5px 10px", fontSize: 12 }}
                      onClick={() => handleDelete(s.id, s.email)}
                    >
                      🗑
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span style={{ fontSize: 13, color: "var(--text2)" }}>Page {page} of {pagination.totalPages}</span>
          <button className="btn-secondary" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
