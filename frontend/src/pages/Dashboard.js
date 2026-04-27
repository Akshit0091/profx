// Dashboard.js
import React, { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import api from "../utils/api";
import "./Dashboard.css";

const fmt = (n) =>
  n === null || n === undefined ? "—"
  : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

const STATS = (s) => [
  { label: "Total Orders",   value: s?.totalOrders ?? 0,   sub: `${s?.matchedOrders ?? 0} matched · ${s?.pendingOrders ?? 0} pending`, icon: "📦", accent: "linear-gradient(90deg,#2563eb,#60a5fa)", iconBg: "#eff6ff" },
  { label: "Total Revenue",  value: fmt(s?.totalRevenue),  sub: "Bank settlements",           icon: "💳", accent: "linear-gradient(90deg,#7c3aed,#a78bfa)", iconBg: "#f5f3ff" },
  { label: "Total Cost",     value: fmt(s?.totalCost),     sub: "Purchase prices",            icon: "🏷️", accent: "linear-gradient(90deg,#d97706,#fbbf24)", iconBg: "#fffbeb" },
  { label: "Total Profit",   value: fmt(s?.totalProfit),   sub: `Avg ${fmt(s?.avgProfit)} per order`, icon: "📈",
    accent: (s?.totalProfit ?? 0) >= 0 ? "linear-gradient(90deg,#059669,#34d399)" : "linear-gradient(90deg,#dc2626,#f87171)",
    iconBg: (s?.totalProfit ?? 0) >= 0 ? "#ecfdf5" : "#fef2f2",
    valueColor: (s?.totalProfit ?? 0) >= 0 ? "#059669" : "#dc2626" },
  { label: "Returned Orders", value: s?.returnedOrders ?? 0, sub: "Marked as returned",      icon: "↩️", accent: "linear-gradient(90deg,#d97706,#fbbf24)", iconBg: "#fffbeb", valueColor: "#d97706" },
  { label: "Loss Orders",    value: s?.lossOrders ?? 0,   sub: "Negative profit",            icon: "⚠️", accent: "linear-gradient(90deg,#dc2626,#f87171)", iconBg: "#fef2f2", valueColor: "#dc2626" },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tooltip-label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="tooltip-row" style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" && p.value > 100 ? fmt(p.value) : p.value}
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [summary, setSummary]         = useState(null);
  const [profitChart, setProfitChart] = useState([]);
  const [ordersChart, setOrdersChart] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [days, setDays]               = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, o] = await Promise.all([
        api.get("/dashboard/summary"),
        api.get(`/dashboard/chart/profit?days=${days}`),
        api.get(`/dashboard/chart/orders?days=${days}`),
      ]);
      setSummary(s.data.data);
      setProfitChart(p.data.data);
      setOrdersChart(o.data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="loading-center">
      <span className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  );

  const stats = STATS(summary);

  return (
    <div className="dashboard">
      <div className="dash-top">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Your profitability overview</p>
        </div>
        <select className="days-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Summary banner */}
      {summary && (
        <div className="summary-banner fade-in">
          {[
            { label: "Revenue",       value: fmt(summary.totalRevenue) },
            { label: "Cost",          value: fmt(summary.totalCost) },
            { label: "Net Profit",    value: fmt(summary.totalProfit),  color: summary.totalProfit >= 0 ? "#059669" : "#dc2626" },
            { label: "Matched",       value: summary.matchedOrders },
            { label: "Returned",      value: summary.returnedOrders,    color: "#d97706" },
            { label: "Avg Profit",    value: fmt(summary.avgProfit) },
          ].map((item, i, arr) => (
            <React.Fragment key={i}>
              <div className="summary-banner-item">
                <span className="summary-banner-label">{item.label}</span>
                <span className="summary-banner-value" style={item.color ? { color: item.color } : {}}>
                  {item.value}
                </span>
              </div>
              {i < arr.length - 1 && <div className="summary-banner-divider" />}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Stat cards */}
      <div className="stats-grid">
        {stats.map((s, i) => (
          <div key={i} className="stat-card fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="stat-card-accent" style={{ background: s.accent }} />
            <div className="stat-icon" style={{ background: s.iconBg }}>{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={s.valueColor ? { color: s.valueColor } : {}}>{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="card chart-card">
          <div className="chart-header">
            <div className="chart-title">Profit & Revenue</div>
            <div className="chart-subtitle">Excluding returned orders · Last {days} days</div>
          </div>
          {profitChart.length === 0 ? (
            <div className="chart-empty"><div className="chart-empty-icon">📊</div>No matched orders in this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={profitChart} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={fmtDate} stroke="#cbd5e1" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis stroke="#cbd5e1" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `₹${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#2563eb" fill="url(#revGrad)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="profit"  name="Profit"  stroke="#059669" fill="url(#profGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card chart-card">
          <div className="chart-header">
            <div className="chart-title">Orders Per Day</div>
            <div className="chart-subtitle">Matched, returned and total</div>
          </div>
          {ordersChart.length === 0 ? (
            <div className="chart-empty"><div className="chart-empty-icon">📦</div>No orders in this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ordersChart} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={fmtDate} stroke="#cbd5e1" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis stroke="#cbd5e1" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total"    name="Total"    fill="#bfdbfe" radius={[4,4,0,0]} />
                <Bar dataKey="matched"  name="Matched"  fill="#2563eb" radius={[4,4,0,0]} />
                <Bar dataKey="returned" name="Returned" fill="#fbbf24" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
