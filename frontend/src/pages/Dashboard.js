import React, { useEffect, useState, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import api from '../utils/api';
import { useAuth } from '../utils/AuthContext';
import { useActivePlatform, ALL_PLATFORM, PLATFORM_META } from '../utils/platforms';
import './Dashboard.css';

const fmt = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(n || 0));
const inr = (n) => '₹' + fmt(n);
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  return d.toISOString().slice(0, 10);
};
const monthBounds = (ym) => {
  // ym = "YYYY-MM"
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
};
const currentYM = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Build "last 24 months" list for the month dropdown
function monthOptions() {
  const out = [];
  const d = new Date();
  for (let i = 0; i < 24; i++) {
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    out.push({ value: ym, label });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { platform } = useActivePlatform(user);
  const isCombined = platform === ALL_PLATFORM;
  // Combined view hits a separate endpoint group that aggregates owned platforms.
  const base = isCombined ? '/dashboard/combined' : '/dashboard';

  const [summary, setSummary] = useState(null);
  const [profitData, setProfitData] = useState([]);
  const [ordersData, setOrdersData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [platformBreakdown, setPlatformBreakdown] = useState([]);

  // Filter mode: 'quick' (7/30/90 day buttons), 'month', or 'range'
  const [mode, setMode] = useState('quick');
  const [quickDays, setQuickDays] = useState(30);
  const [month, setMonth] = useState(currentYM());
  const [rangeStart, setRangeStart] = useState(daysAgoISO(30));
  const [rangeEnd, setRangeEnd] = useState(todayISO());

  const months = useMemo(() => monthOptions(), []);

  // Resolve to params for the API
  const params = useMemo(() => {
    if (mode === 'month') return monthBounds(month);
    if (mode === 'range') return { startDate: rangeStart, endDate: rangeEnd };
    return { days: quickDays };
  }, [mode, quickDays, month, rangeStart, rangeEnd]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      api.get(`${base}/summary`,      { params }),
      api.get(`${base}/chart/profit`, { params }),
      api.get(`${base}/chart/orders`, { params }),
    ])
      .then(([s, p, o]) => {
        if (!alive) return;
        setSummary(s.data);
        setProfitData(p.data.data);
        setOrdersData(o.data.data);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [params, base]);

  // Fetch per-platform breakdown when in combined mode
  useEffect(() => {
    if (!isCombined) { setPlatformBreakdown([]); return; }
    const platforms = (user?.plans || []).filter(p => p !== 'all');
    if (!platforms.length) return;

    // Use fetch directly (not the api instance) so the x-platform header
    // isn't overridden by the axios interceptor that forces 'all'.
    const token = localStorage.getItem('profx_token');
    const baseUrl = api.defaults.baseURL;
    const qs = new URLSearchParams(params).toString();

    Promise.all(
      platforms.map(p =>
        fetch(`${baseUrl}/dashboard/summary?${qs}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'x-platform': p }
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => data ? { platform: p, ...data } : null)
          .catch(() => null)
      )
    ).then(results => {
      setPlatformBreakdown(results.filter(Boolean));
    });
  }, [isCombined, params, user?.plans]);

  const cards = summary ? [
    { color: '#2563eb', icon: '📦', label: 'Total Orders',     value: fmt(summary.totalOrders) },
    { color: '#059669', icon: '💰', label: 'Revenue',          value: inr(summary.totalRevenue) },
    { color: '#d97706', icon: '🛒', label: 'Cost',             value: inr(summary.totalCost) },
    { color: '#16a34a', icon: '📈', label: 'Net Profit',       value: inr(summary.totalProfit) },
    { color: '#f97316', icon: '🚚', label: 'Return Incoming',  value: fmt(summary.returnIncomingOrders || 0) },
    { color: '#f59e0b', icon: '↩️', label: 'Returned',         value: fmt(summary.returnedOrders) },
    { color: '#16a34a', icon: '✅', label: 'Profit Orders',    value: fmt(summary.profitOrders || 0) },
    { color: '#dc2626', icon: '⚠️', label: 'Loss Orders',      value: fmt(summary.lossOrders) },
  ] : [];

  return (
    <div className="dashboard">
      <div className="page-head">
        <div>
          <h1>{isCombined ? 'Combined Dashboard' : 'Dashboard'}</h1>
          <p className="text-muted">
            {isCombined
              ? 'All platforms combined — totals summed across Flipkart, Meesho & Amazon by dispatch date.'
              : 'By dispatch date — including returned orders (their loss counts too).'}
          </p>
        </div>
      </div>

      <div className="card filter-bar">
        <div className="filter-tabs">
          <button className={`filter-tab ${mode === 'quick' ? 'active' : ''}`} onClick={() => setMode('quick')}>Quick</button>
          <button className={`filter-tab ${mode === 'month' ? 'active' : ''}`} onClick={() => setMode('month')}>Month</button>
          <button className={`filter-tab ${mode === 'range' ? 'active' : ''}`} onClick={() => setMode('range')}>Date Range</button>
        </div>

        <div className="filter-controls">
          {mode === 'quick' && (
            <div className="days-select">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  className={`days-btn ${quickDays === d ? 'active' : ''}`}
                  onClick={() => setQuickDays(d)}
                >
                  {d} days
                </button>
              ))}
            </div>
          )}
          {mode === 'month' && (
            <div className="month-select">
              <label>Month:</label>
              <select value={month} onChange={(e) => setMonth(e.target.value)}>
                {months.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          )}
          {mode === 'range' && (
            <div className="range-select">
              <label>From:</label>
              <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} max={rangeEnd} />
              <label>To:</label>
              <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} min={rangeStart} max={todayISO()} />
            </div>
          )}
        </div>
      </div>

      {loading || !summary ? (
        <div className="card empty">Loading dashboard…</div>
      ) : (
        <>
          <div className="summary-banner">
            <div><span>Revenue</span><strong>{inr(summary.totalRevenue)}</strong></div>
            <div><span>Cost</span><strong>{inr(summary.totalCost)}</strong></div>
            <div><span>Net Profit</span><strong className={summary.totalProfit >= 0 ? 'pos' : 'neg'}>{inr(summary.totalProfit)}</strong></div>
            <div><span>Matched</span><strong>{fmt(summary.matchedOrders)}</strong></div>
            <div><span>Returned</span><strong>{fmt(summary.returnedOrders)}</strong></div>
            <div><span>Avg Profit</span><strong>{inr(summary.avgProfit)}</strong></div>
          </div>

          {isCombined && platformBreakdown.length > 0 && (
            <div className="platform-breakdown">
              {platformBreakdown.map((pb) => {
                const colors = { flipkart: '#2563eb', meesho: '#7c3aed', amazon: '#f97316' };
                const meta = PLATFORM_META[pb.platform] || {};
                return (
                  <div key={pb.platform} className="breakdown-card" style={{ borderTopColor: colors[pb.platform] || '#64748b' }}>
                    <div className="breakdown-header">
                      {meta.logo && <img src={meta.logo} alt="" className="breakdown-logo" />}
                      <span className="breakdown-name">{meta.label || pb.platform}</span>
                    </div>
                    <div className="breakdown-stats">
                      <div><span>Profit</span><strong className={pb.totalProfit >= 0 ? 'pos' : 'neg'}>{inr(pb.totalProfit)}</strong></div>
                      <div><span>Revenue</span><strong>{inr(pb.totalRevenue)}</strong></div>
                      <div><span>Orders</span><strong>{fmt(pb.totalOrders)}</strong></div>
                      <div><span>Returned</span><strong>{fmt(pb.returnedOrders)}</strong></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="stat-grid">
            {cards.map((c) => (
              <div key={c.label} className="stat-card">
                <div className="stat-bar" style={{ background: c.color }} />
                <div className="stat-icon">{c.icon}</div>
                <div className="stat-label">{c.label}</div>
                <div className="stat-value">{c.value}</div>
              </div>
            ))}
          </div>

          <div className="chart-grid">
            <div className="card chart-card">
              <h3>Profit & Revenue</h3>
              <p className="chart-sub text-muted">Daily totals by dispatch date (includes returns)</p>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <AreaChart data={profitData}>
                    <defs>
                      <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#059669" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => inr(v)} />
                    <Legend />
                    <Area type="monotone" dataKey="revenue" stroke="#2563eb" fillOpacity={1} fill="url(#gRevenue)" name="Revenue" />
                    <Area type="monotone" dataKey="profit"  stroke="#059669" fillOpacity={1} fill="url(#gProfit)"  name="Profit"  />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card chart-card">
              <h3>Orders per day</h3>
              <p className="chart-sub text-muted">By dispatch date — Total / Matched / Return Incoming / Returned</p>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={ordersData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total"          fill="#2563eb" name="Total" />
                    <Bar dataKey="matched"        fill="#059669" name="Matched" />
                    <Bar dataKey="returnIncoming" fill="#f97316" name="Return Incoming" />
                    <Bar dataKey="returned"       fill="#d97706" name="Returned" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
