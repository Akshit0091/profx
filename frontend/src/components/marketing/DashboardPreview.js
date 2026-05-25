import React from 'react';
import './DashboardPreview.css';

/**
 * Stylized HTML/CSS mockup of the ProfX dashboard.
 * Used as the hero image — looks authentic to the real app but ships with
 * the code (no PNG asset required).
 */
export default function DashboardPreview() {
  return (
    <div className="dp-frame">
      {/* Browser chrome */}
      <div className="dp-chrome">
        <div className="dp-dots">
          <span /><span /><span />
        </div>
        <div className="dp-url">app.profx.in / dashboard</div>
        <div className="dp-chrome-spacer" />
      </div>

      <div className="dp-body">
        {/* Sidebar */}
        <aside className="dp-sidebar">
          <div className="dp-brand">
            <span className="dp-brand-mark">PX</span>
            <div className="dp-brand-text">
              <strong>ProfX</strong>
              <small>Profit tracker</small>
            </div>
          </div>
          <div className="dp-section-label">Workspace</div>
          <div className="dp-nav-item is-active">📊 Dashboard</div>
          <div className="dp-nav-item">📤 Upload Reports</div>
          <div className="dp-nav-item">📋 Orders</div>
          <div className="dp-nav-item">🏷️ SKU Pricing</div>
        </aside>

        {/* Main content */}
        <div className="dp-main">
          <div className="dp-page-head">
            <div>
              <h2>Dashboard</h2>
              <p>By dispatch date — including returned orders.</p>
            </div>
            <div className="dp-pills">
              <span className="dp-pill">Quick</span>
              <span className="dp-pill is-active">30 days</span>
              <span className="dp-pill">90 days</span>
            </div>
          </div>

          {/* Summary banner */}
          <div className="dp-banner">
            <div><span>Revenue</span><strong>₹2,18,440</strong></div>
            <div><span>Cost</span><strong>₹1,76,920</strong></div>
            <div><span>Net Profit</span><strong className="pos">₹41,520</strong></div>
            <div><span>Matched</span><strong>1,089</strong></div>
            <div><span>Returned</span><strong>47</strong></div>
            <div><span>Avg Profit</span><strong>₹38.13</strong></div>
          </div>

          {/* Stat cards */}
          <div className="dp-stat-grid">
            {[
              { c: '#2563eb', i: '📦', l: 'Total Orders',    v: '1,136' },
              { c: '#059669', i: '💰', l: 'Revenue',         v: '₹2.18L' },
              { c: '#d97706', i: '🛒', l: 'Cost',            v: '₹1.77L' },
              { c: '#16a34a', i: '📈', l: 'Net Profit',      v: '₹41,520' },
              { c: '#f97316', i: '🚚', l: 'Return Incoming', v: '12' },
              { c: '#dc2626', i: '⚠️', l: 'Loss Orders',     v: '63' },
            ].map((s) => (
              <div key={s.l} className="dp-stat">
                <div className="dp-stat-bar" style={{ background: s.c }} />
                <div className="dp-stat-icon">{s.i}</div>
                <div className="dp-stat-label">{s.l}</div>
                <div className="dp-stat-value">{s.v}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="dp-chart-card">
            <div className="dp-chart-head">
              <strong>Profit &amp; Revenue</strong>
              <span className="dp-legend"><i className="rev" /> Revenue <i className="prof" /> Profit</span>
            </div>
            <svg viewBox="0 0 600 180" className="dp-chart" preserveAspectRatio="none">
              <defs>
                <linearGradient id="dpRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="dpProf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* grid */}
              <g stroke="#eef1f6" strokeDasharray="3 3">
                {[40, 80, 120, 160].map((y) => <line key={y} x1="0" x2="600" y1={y} y2={y} />)}
              </g>
              {/* revenue */}
              <path
                d="M0,140 L40,118 L80,128 L120,96 L160,108 L200,76 L240,90 L280,60 L320,80 L360,48 L400,68 L440,40 L480,58 L520,32 L560,52 L600,28 L600,180 L0,180 Z"
                fill="url(#dpRev)" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round"
              />
              {/* profit */}
              <path
                d="M0,160 L40,150 L80,156 L120,140 L160,146 L200,128 L240,134 L280,118 L320,128 L360,108 L400,120 L440,98 L480,110 L520,90 L560,104 L600,84 L600,180 L0,180 Z"
                fill="url(#dpProf)" stroke="#059669" strokeWidth="2" strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
