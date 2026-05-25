import React, { useEffect, useState, useCallback } from 'react';
import api from '../utils/api';
import './Orders.css';

const inr = (n) =>
  n === null || n === undefined || n === ''
    ? '—'
    : '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(n));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');

export default function Orders() {
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    dateFrom: '',
    dateTo: '',
    sortBy: 'createdAt',
    sortDir: 'desc',
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ orders: [], pagination: { total: 0, totalPages: 1 } });
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(() => {
    setLoading(true);
    api.get('/orders', { params: { ...filters, page, limit: 50 } })
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filters, page]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const reset = () => {
    setFilters({ search: '', status: 'all', dateFrom: '', dateTo: '', sortBy: 'createdAt', sortDir: 'desc' });
    setPage(1);
  };

  const exportCsv = async () => {
    try {
      const res = await api.get('/orders/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `profx-orders-${Date.now()}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed');
    }
  };

  const [recalcBusy, setRecalcBusy] = useState(false);
  const recalcProfits = async () => {
    if (!window.confirm('Recompute profits for ALL your orders using current rules? This is safe to run anytime.')) return;
    try {
      setRecalcBusy(true);
      const res = await api.post('/orders/recalc');
      alert(`Done. ${res.data.updated} orders recalculated.`);
      fetchOrders();
    } catch (err) {
      alert(err.response?.data?.error || 'Recalc failed');
    } finally {
      setRecalcBusy(false);
    }
  };

  const toggleReturned = async (order, returned) => {
    const action = returned ? 'mark as Returned' : 'unmark as Returned';
    if (!window.confirm(`${returned ? 'Mark' : 'Unmark'} order ${order.orderItemId} ${returned ? 'as Returned' : 'as Not Returned'}?\n\nProfit will be recalculated.`)) return;
    try {
      await api.patch(`/orders/${order.id}/returned`, { returned });
      fetchOrders();
    } catch (err) {
      alert(err.response?.data?.error || `Failed to ${action}`);
    }
  };

  // Inline settlement edit
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const startEditSettlement = (o) => {
    setEditingId(o.id);
    setEditingValue(o.bankSettlement == null ? '' : String(o.bankSettlement));
  };
  const cancelEditSettlement = () => {
    setEditingId(null);
    setEditingValue('');
  };
  const saveSettlement = async (o) => {
    const trimmed = editingValue.trim();
    let payload;
    if (trimmed === '') {
      if (!window.confirm('Clear the settlement value for this order? It will become Pending again.')) return;
      payload = { bankSettlement: null };
    } else {
      const num = Number(trimmed);
      if (!isFinite(num)) {
        alert('Enter a valid number (e.g. 339.50 or -50)');
        return;
      }
      payload = { bankSettlement: num };
    }
    try {
      await api.patch(`/orders/${o.id}/settlement`, payload);
      cancelEditSettlement();
      fetchOrders();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update settlement');
    }
  };

  const statusBadge = (o) => {
    if (o.isReturned)      return <span className="badge badge-warning">↩ Returned</span>;
    if (o.returnIncoming)  return <span className="badge badge-orange">🚚 Return Incoming</span>;
    if (o.isMatched)       return <span className="badge badge-success">✓ Matched</span>;
    if (o.hasPickup && !o.hasSettlement) return <span className="badge badge-warning">No Settlement</span>;
    if (!o.hasPickup && o.hasSettlement) return <span className="badge badge-primary">No Pickup</span>;
    return <span className="badge badge-muted">Pending</span>;
  };

  return (
    <div className="orders-page">
      <div className="page-head">
        <div>
          <h1>Orders</h1>
          <p className="text-muted">{data.pagination.total} total · filtered view</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={recalcProfits} disabled={recalcBusy}>
            {recalcBusy ? 'Recalculating…' : '↻ Recalculate Profits'}
          </button>
          <button className="btn btn-success" onClick={exportCsv}>⬇ Export Excel</button>
        </div>
      </div>

      <div className="card filters-card">
        <input
          placeholder="Search order item / order ID / SKU / tracking ID…"
          value={filters.search}
          onChange={(e) => { setFilters({ ...filters, search: e.target.value }); setPage(1); }}
          style={{ flex: 2, minWidth: 220 }}
        />
        <select
          value={filters.status}
          onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}
          style={{ width: 180 }}
        >
          <option value="all">All</option>
          <option value="matched">Matched</option>
          <option value="pending">Pending</option>
          <option value="profit">Profit orders</option>
          <option value="loss">Loss orders</option>
          <option value="return-incoming">Return Incoming</option>
          <option value="returned">Returned</option>
        </select>
        <input type="date" value={filters.dateFrom} onChange={(e) => { setFilters({ ...filters, dateFrom: e.target.value }); setPage(1); }} style={{ width: 160 }} />
        <input type="date" value={filters.dateTo}   onChange={(e) => { setFilters({ ...filters, dateTo: e.target.value });   setPage(1); }} style={{ width: 160 }} />
        <select
          value={`${filters.sortBy}:${filters.sortDir}`}
          onChange={(e) => {
            const [sortBy, sortDir] = e.target.value.split(':');
            setFilters({ ...filters, sortBy, sortDir });
          }}
          style={{ width: 200 }}
        >
          <option value="createdAt:desc">Newest first</option>
          <option value="createdAt:asc">Oldest first</option>
          <option value="profit:desc">Highest profit</option>
          <option value="profit:asc">Lowest profit</option>
          <option value="paymentDate:desc">Payment date ↓</option>
          <option value="dispatchDate:desc">Dispatch date ↓</option>
          <option value="bankSettlement:desc">Settlement ↓</option>
        </select>
        <button className="btn btn-secondary" onClick={reset}>Reset</button>
      </div>

      <div className="card table-card">
        <div className="table-wrap">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order Item ID</th>
                <th>Order ID</th>
                <th>SKU</th>
                <th>Tracking ID</th>
                <th>Dispatch</th>
                <th>Payment</th>
                <th>Settlement</th>
                <th>Cost</th>
                <th>Profit</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="empty">Loading…</td></tr>
              ) : data.orders.length === 0 ? (
                <tr><td colSpan={11} className="empty">No orders found. Upload reports to get started.</td></tr>
              ) : (
                data.orders.map((o) => {
                  let rowClass = '';
                  if (o.isReturned) rowClass = 'row-returned';
                  else if (o.returnIncoming) rowClass = 'row-return-incoming';
                  else if (o.isMatched) rowClass = o.profit < 0 ? 'row-loss' : 'row-profit';

                  const profitClass = o.profit == null
                    ? 'zero'
                    : o.profit < 0 ? 'neg' : 'pos';
                  return (
                    <tr key={o.id} className={rowClass}>
                      <td className="mono">{o.orderItemId}</td>
                      <td className="mono">{o.orderId || '—'}</td>
                      <td className="mono">{o.skuId || '—'}</td>
                      <td className="mono">{o.trackingId || '—'}</td>
                      <td>{fmtDate(o.dispatchDate)}</td>
                      <td>{fmtDate(o.paymentDate)}</td>
                      <td className="settlement-cell">
                        {editingId === o.id ? (
                          <span className="settlement-edit">
                            <input
                              type="number"
                              step="0.01"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveSettlement(o);
                                if (e.key === 'Escape') cancelEditSettlement();
                              }}
                              autoFocus
                              className="settlement-input"
                            />
                            <button
                              className="icon-btn-sm save"
                              onClick={() => saveSettlement(o)}
                              title="Save (Enter)"
                            >✓</button>
                            <button
                              className="icon-btn-sm cancel"
                              onClick={cancelEditSettlement}
                              title="Cancel (Esc)"
                            >✕</button>
                          </span>
                        ) : (
                          <span
                            className="settlement-display"
                            onClick={() => startEditSettlement(o)}
                            title="Click to edit"
                          >
                            {inr(o.bankSettlement)}
                            <span className="edit-pencil">✎</span>
                          </span>
                        )}
                      </td>
                      <td>{inr(o.purchasePrice)}</td>
                      <td className={`profit ${profitClass}`}>
                        {o.profit == null ? '—' : inr(o.profit)}
                      </td>
                      <td>{statusBadge(o)}</td>
                      <td className="actions-cell">
                        {o.isReturned ? (
                          <button
                            className="btn btn-secondary btn-xs"
                            onClick={() => toggleReturned(o, false)}
                            title="Mark this order as NOT returned"
                          >
                            Unmark Returned
                          </button>
                        ) : (
                          <button
                            className="btn btn-warning btn-xs"
                            onClick={() => toggleReturned(o, true)}
                            title="Manually flag this order as returned"
                          >
                            Mark Returned
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {data.pagination.totalPages > 1 && (
          <div className="pagination">
            <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
            <span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
            <button className="btn btn-secondary" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
