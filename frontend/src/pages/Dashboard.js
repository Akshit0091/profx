import React, { useEffect, useState, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import api from '../utils/api';
import { useAuth } from '../utils/AuthContext';
import { useActivePlatform, ALL_PLATFORM, PLATFORM_META } from '../utils/platforms';
import './Dashboard.css';

const DESKTOP_QUERY = '(min-width: 1024px)';

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange);
    };
  }, []);
  return isDesktop;
}

const fmt = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(n || 0));
const inr = (n) => '₹' + fmt(n);
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  return d.toISOString().slice(0, 10);
};
const monthBounds = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
};
const currentYM = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

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

/* ============================================================
   DESKTOP — original stat-card dashboard (look unchanged)
   ============================================================ */
function DesktopDashboard(p) {
  const {
    summary, profitData, ordersData, loading, isCombined, platformBreakdown,
    mode, setMode, quickDays, setQuickDays, month, setMonth, months, rangeStart, setRangeStart, rangeEnd, setRangeEnd,
  } = p;

  const cards = summary ? [
    { color: '#2563eb', icon: '📦', label: 'Total Orders',    value: fmt(summary.totalOrders) },
    { color: '#059669', icon: '💰', label: 'Revenue',         value: inr(summary.totalRevenue) },
    { color: '#d97706', icon: '🛒', label: 'Cost',            value: inr(summary.totalCost) },
    { color: '#16a34a', icon: '📈', label: 'Net Profit',      value: inr(summary.totalProfit) },
    { color: '#f97316', icon: '🚚', label: 'Return Incoming', value: fmt(summary.returnIncomingOrders || 0) },
    { color: '#f59e0b', icon: '↩️', label: 'Returned',        value: fmt(summary.returnedOrders) },
    { color: '#16a34a', icon: '✅', label: 'Profit Orders',   value: fmt(summary.profitOrders || 0) },
    { color: '#dc2626', icon: '⚠️', label: 'Loss Orders',     value: fmt(summary.lossOrders) },
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
                <button key={d} className={`days-btn ${quickDays === d ? 'active' : ''}`} onClick={() => setQuickDays(d)}>
                  {d} days
                </button>
              ))}
            </div>
          )}
          {mode === 'month' && (
            <div className="month-select">
              <label>Month:</label>
              <select value={month} onChange={(e) => setMonth(e.target.value)}>
                {months.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
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

/* ============================================================
   MOBILE — new hero + tiles dashboard
   ============================================================ */
function MobileDashboard(p) {
  const {
    summary, profitData, ordersData, loading, isCombined, platformBreakdown,
    mode, setMode, quickDays, setQuickDays, month, setMonth, months, rangeStart, setRangeStart, rangeEnd, setRangeEnd,
  } = p;

  const periodLabel =
    mode === 'quick' ? `Last ${quickDays} days`
    : mode === 'month' ? (months.find((m) => m.value === month)?.label || 'Selected month')
    : 'Custom range';

  const profitPos = summary ? Number(summary.totalProfit) >= 0 : true;

  const tiles = summary ? [
    { label: 'Total Orders',    value: fmt(summary.totalOrders),               accent: '#2563eb' },
    { label: 'Matched',         value: fmt(summary.matchedOrders),             accent: '#0ea5e9' },
    { label: 'Avg Profit',      value: inr(summary.avgProfit),                 accent: profitPos ? '#059669' : '#dc2626', neg: !profitPos },
    { label: 'Return Incoming', value: fmt(summary.returnIncomingOrders || 0), accent: '#f97316' },
    { label: 'Returned',        value: fmt(summary.returnedOrders),            accent: '#d97706' },
    { label: 'Profit Orders',   value: fmt(summary.profitOrders || 0),         accent: '#059669' },
    { label: 'Loss Orders',     value: fmt(summary.lossOrders),                accent: '#dc2626' },
  ] : [];

  return (
    <div className="dash">
      <div className="dash-filter">
        <div className="seg">
          <button className={`seg-btn ${mode === 'quick' ? 'on' : ''}`} onClick={() => setMode('quick')}>Quick</button>
          <button className={`seg-btn ${mode === 'month' ? 'on' : ''}`} onClick={() => setMode('month')}>Month</button>
          <button className={`seg-btn ${mode === 'range' ? 'on' : ''}`} onClick={() => setMode('range')}>Date Range</button>
        </div>

        {mode === 'quick' && (
          <div className="pills">
            {[7, 30, 90].map((d) => (
              <button key={d} className={`pill ${quickDays === d ? 'on' : ''}`} onClick={() => setQuickDays(d)}>{d} days</button>
            ))}
          </div>
        )}
        {mode === 'month' && (
          <div className="filter-field">
            <label>Month</label>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        )}
        {mode === 'range' && (
          <div className="filter-field range">
            <div><label>From</label><input type="date" value={rangeStart} max={rangeEnd} onChange={(e) => setRangeStart(e.target.value)} /></div>
            <div><label>To</label><input type="date" value={rangeEnd} min={rangeStart} max={todayISO()} onChange={(e) => setRangeEnd(e.target.value)} /></div>
          </div>
        )}
      </div>

      {loading || !summary ? (
        <div className="dash-loading">Loading dashboard…</div>
      ) : (
        <>
          <div className="hero">
            <div className="hero-top">
              <div>
                <div className="hero-label">Net profit · {periodLabel.toLowerCase()}</div>
                <div className={`hero-value ${profitPos ? 'pos' : 'neg'}`}>{inr(summary.totalProfit)}</div>
              </div>
              <span className="hero-badge">{fmt(summary.totalOrders)} orders</span>
            </div>
            <div className="hero-substats">
              <div className="hs hs-rev"><span>Revenue</span><strong>{inr(summary.totalRevenue)}</strong></div>
              <div className="hs hs-cost"><span>Cost</span><strong>{inr(summary.totalCost)}</strong></div>
            </div>
          </div>

          <div className="tiles">
            {tiles.map((t) => (
              <div className="tile" key={t.label} style={{ '--accent': t.accent }}>
                <div className="tile-label">{t.label}</div>
                <div className={`tile-value ${t.neg ? 'neg' : ''}`}>{t.value}</div>
              </div>
            ))}
          </div>

          {isCombined && platformBreakdown.length > 0 && (
            <div className="breakdown">
              {platformBreakdown.map((pb) => {
                const colors = { flipkart: '#2563eb', meesho: '#7c3aed', amazon: '#f97316' };
                const meta = PLATFORM_META[pb.platform] || {};
                return (
                  <div key={pb.platform} className="bd-card" style={{ borderTopColor: colors[pb.platform] || '#64748b' }}>
                    <div className="bd-head">
                      {meta.logo && <img src={meta.logo} alt="" className="bd-logo" />}
                      <span>{meta.label || pb.platform}</span>
                    </div>
                    <div className="bd-stats">
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

          <div className="chart-card">
            <div className="chart-head">
              <h3>Profit &amp; Revenue</h3>
              <p>Daily totals by dispatch date (includes returns)</p>
            </div>
            <div className="chart-box">
              <ResponsiveContainer>
                <AreaChart data={profitData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gProfitM" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gRevenueM" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" width={44} />
                  <Tooltip formatter={(v) => inr(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#gRevenueM)" name="Revenue" />
                  <Area type="monotone" dataKey="profit"  stroke="#059669" strokeWidth={2} fillOpacity={1} fill="url(#gProfitM)"  name="Profit" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-head">
              <h3>Orders per day</h3>
              <p>Total · Matched · Return Incoming · Returned</p>
            </div>
            <div className="chart-box">
              <ResponsiveContainer>
                <BarChart data={ordersData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" width={44} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="total"          fill="#2563eb" radius={[3, 3, 0, 0]} name="Total" />
                  <Bar dataKey="matched"        fill="#059669" radius={[3, 3, 0, 0]} name="Matched" />
                  <Bar dataKey="returnIncoming" fill="#f97316" radius={[3, 3, 0, 0]} name="Return Incoming" />
                  <Bar dataKey="returned"       fill="#d97706" radius={[3, 3, 0, 0]} name="Returned" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   Root — shared data, picks dashboard by width (live on resize)
   ============================================================ */
export default function Dashboard() {
  const { user } = useAuth();
  const { platform } = useActivePlatform(user);
  const isCombined = platform === ALL_PLATFORM;
  const base = isCombined ? '/dashboard/combined' : '/dashboard';
  const isDesktop = useIsDesktop();

  const [summary, setSummary] = useState(null);
  const [profitData, setProfitData] = useState([]);
  const [ordersData, setOrdersData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [platformBreakdown, setPlatformBreakdown] = useState([]);

  const [mode, setMode] = useState('quick');
  const [quickDays, setQuickDays] = useState(30);
  const [month, setMonth] = useState(currentYM());
  const [rangeStart, setRangeStart] = useState(daysAgoISO(30));
  const [rangeEnd, setRangeEnd] = useState(todayISO());

  const months = useMemo(() => monthOptions(), []);

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
      .then(([s, pd, o]) => {
        if (!alive) return;
        setSummary(s.data);
        setProfitData(pd.data.data);
        setOrdersData(o.data.data);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [params, base]);

  useEffect(() => {
    if (!isCombined) { setPlatformBreakdown([]); return; }
    const platforms = (user?.plans || []).filter(pl => pl !== 'all');
    if (!platforms.length) return;

    const token = localStorage.getItem('profx_token');
    const baseUrl = api.defaults.baseURL;
    const qs = new URLSearchParams(params).toString();

    Promise.all(
      platforms.map(pl =>
        fetch(`${baseUrl}/dashboard/summary?${qs}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'x-platform': pl }
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => data ? { platform: pl, ...data } : null)
          .catch(() => null)
      )
    ).then(results => {
      setPlatformBreakdown(results.filter(Boolean));
    });
  }, [isCombined, params, user?.plans]);

  const shared = {
    summary, profitData, ordersData, loading, isCombined, platformBreakdown,
    mode, setMode, quickDays, setQuickDays, month, setMonth, months, rangeStart, setRangeStart, rangeEnd, setRangeEnd,
  };

  return isDesktop ? <DesktopDashboard {...shared} /> : <MobileDashboard {...shared} />;
}
