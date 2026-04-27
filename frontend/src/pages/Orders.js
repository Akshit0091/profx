// Orders.js
import React, { useEffect, useState, useCallback } from "react";
import api from "../utils/api";
import toast from "react-hot-toast";
import "./Orders.css";

const fmt = (n) =>
  n === null || n === undefined ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function Orders() {
  const [orders, setOrders]       = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading]     = useState(true);
  const [exporting, setExporting] = useState(false);

  const [filters, setFilters] = useState({
    search: "", status: "all", sortBy: "createdAt",
    sortDir: "desc", dateFrom: "", dateTo: "", page: 1,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/orders", { params: { ...filters, limit: 50 } });
      setOrders(res.data.data);
      setPagination(res.data.pagination);
    } catch { toast.error("Failed to load orders"); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (field) => setFilters((f) => ({
    ...f,
    sortBy:  field,
    sortDir: f.sortBy === field && f.sortDir === "desc" ? "asc" : "desc",
    page: 1,
  }));

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get("/orders/export", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `profx-orders-${Date.now()}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch { toast.error("Export failed"); }
    finally { setExporting(false); }
  };

  const SortIcon = ({ field }) =>
    filters.sortBy !== field
      ? <span className="sort-icon">↕</span>
      : <span className="sort-icon active">{filters.sortDir === "asc" ? "↑" : "↓"}</span>;

  const getStatusBadge = (order) => {
    if (order.isReturned) return <span className="badge badge-returned">↩ Returned</span>;
    if (order.isMatched)  return <span className="badge badge-green">✓ Matched</span>;
    if (order.hasPickup && !order.hasSettlement) return <span className="badge badge-yellow">No Settlement</span>;
    if (order.hasSettlement && !order.hasPickup) return <span className="badge badge-blue">No Pickup</span>;
    return <span className="badge badge-yellow">Pending</span>;
  };

  return (
    <div className="orders-page fade-in">
      {/* Header */}
      <div className="orders-top">
        <div>
          <h1 className="page-title">Orders</h1>
          <p className="page-subtitle">{pagination.total ?? 0} total records</p>
        </div>
        <button className="export-btn" onClick={handleExport} disabled={exporting}>
          {exporting ? <span className="spinner" /> : "⬇"} Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="filters-card">
        <input
          type="text"
          placeholder="Search Order ID, Item ID, SKU or Tracking ID..."
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
          style={{ flex: 2, minWidth: 200 }}
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
          style={{ flex: 1, minWidth: 160 }}
        >
          <option value="all">All Orders</option>
          <option value="matched">Matched Only</option>
          <option value="pending">Pending Only</option>
          <option value="returned">Returned Only</option>
        </select>
        <input type="date" value={filters.dateFrom}
          onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value, page: 1 }))}
          style={{ flex: 1, minWidth: 140 }} title="Payment date from" />
        <input type="date" value={filters.dateTo}
          onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value, page: 1 }))}
          style={{ flex: 1, minWidth: 140 }} title="Payment date to" />
        <button className="btn-secondary"
          onClick={() => setFilters({ search: "", status: "all", sortBy: "createdAt", sortDir: "desc", dateFrom: "", dateTo: "", page: 1 })}>
          Reset
        </button>
      </div>

      {/* Table */}
      <div className="table-wrap mt-4">
        <table>
          <thead>
            <tr>
              <th>Order Item ID</th>
              <th>Order ID</th>
              <th>SKU</th>
              <th>Tracking ID</th>
              <th className="sortable" onClick={() => handleSort("dispatchDate")}>
                Dispatch <SortIcon field="dispatchDate" />
              </th>
              <th className="sortable" onClick={() => handleSort("paymentDate")}>
                Payment <SortIcon field="paymentDate" />
              </th>
              <th className="sortable" onClick={() => handleSort("bankSettlement")}>
                Settlement <SortIcon field="bankSettlement" />
              </th>
              <th>Cost</th>
              <th className="sortable" onClick={() => handleSort("profit")}>
                Profit <SortIcon field="profit" />
              </th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center" style={{ padding: 48 }}><span className="spinner" /></td></tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-muted" style={{ padding: 48 }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                  No orders found. Upload reports to get started.
                </td>
              </tr>
            ) : orders.map((o) => {
              const isLoss     = !o.isReturned && o.profit !== null && o.profit < 0;
              const isProfit   = !o.isReturned && o.profit !== null && o.profit > 0;
              const isReturned = o.isReturned;

              return (
                <tr
                  key={o.id}
                  className={isReturned ? "row-returned" : isLoss ? "row-loss" : isProfit ? "row-profit" : ""}
                >
                  <td><span className="mono truncate" title={o.orderItemId}>{o.orderItemId}</span></td>
                  <td><span className="mono truncate" title={o.orderId}>{o.orderId || "—"}</span></td>
                  <td>
                    <span style={{ background: "#f1f5f9", padding: "2px 8px", borderRadius: 5, fontSize: 12, fontFamily: "var(--mono)" }}>
                      {o.skuId || "—"}
                    </span>
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: 12, color: "var(--text2)" }}>
                      {o.trackingId || "—"}
                    </span>
                  </td>
                  <td style={{ color: "var(--text2)", fontSize: 13 }}>{fmtDate(o.dispatchDate)}</td>
                  <td style={{ color: "var(--text2)", fontSize: 13 }}>{fmtDate(o.paymentDate)}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>
                    {isReturned ? <span style={{ color: "var(--text3)", textDecoration: "line-through" }}>{fmt(o.bankSettlement)}</span> : fmt(o.bankSettlement)}
                  </td>
                  <td className="mono" style={{ color: "var(--text2)" }}>{fmt(o.purchasePrice)}</td>
                  <td>
                    {isReturned
                      ? <span style={{ color: "var(--text3)", fontSize: 13 }}>₹0 (Returned)</span>
                      : <span className={o.profit === null ? "" : o.profit >= 0 ? "profit-positive" : "profit-negative"}>
                          {fmt(o.profit)}
                        </span>
                    }
                  </td>
                  <td>{getStatusBadge(o)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="pagination">
          <button className="btn-secondary" disabled={filters.page <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>← Prev</button>
          <span className="page-info">Page {pagination.page} of {pagination.totalPages}</span>
          <button className="btn-secondary" disabled={filters.page >= pagination.totalPages}
            onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next →</button>
        </div>
      )}
    </div>
  );
}
