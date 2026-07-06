import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../utils/AuthContext';
import Logo from '../Logo';
import { useActivePlatform, PLATFORM_META, ALL_PLATFORM, ALL_META } from '../../utils/platforms';
import './Layout.css';

/* ---- inline line icons (stroke, currentColor) ---- */
function Ic({ name, size = 24 }) {
  const c = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (name) {
    case 'dashboard':
      return (<svg {...c}><rect x="3" y="3" width="7" height="9" rx="1.6" /><rect x="14" y="3" width="7" height="5" rx="1.6" /><rect x="14" y="12" width="7" height="9" rx="1.6" /><rect x="3" y="16" width="7" height="5" rx="1.6" /></svg>);
    case 'orders':
      return (<svg {...c}><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="3.5" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="3.5" cy="18" r="1.3" fill="currentColor" stroke="none" /></svg>);
    case 'upload':
      return (<svg {...c}><path d="M12 15V3M8 7l4-4 4 4M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" /></svg>);
    case 'tag':
      return (<svg {...c}><path d="M3 3h7l11 11-7 7L3 10V3z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>);
    case 'box':
      return (<svg {...c}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></svg>);
    case 'more':
      return (<svg {...c}><circle cx="5" cy="12" r="1.9" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.9" fill="currentColor" stroke="none" /></svg>);
    case 'user':
      return (<svg {...c}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>);
    case 'logout':
      return (<svg {...c}><path d="M15 12H3M8 7l-5 5 5 5M9 4h9a2 2 0 012 2v12a2 2 0 01-2 2h-9" /></svg>);
    case 'admin':
      return (<svg {...c}><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>);
    case 'chevron':
      return (<svg {...c}><path d="M9 6l6 6-6 6" /></svg>);
    case 'check':
      return (<svg {...c}><path d="M20 6L9 17l-5-5" /></svg>);
    default:
      return null;
  }
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { platform, switchPlatform, allowed } = useActivePlatform(user);
  const isCombined = platform === ALL_PLATFORM;

  const [moreOpen, setMoreOpen] = useState(false);
  const [platformSheet, setPlatformSheet] = useState(false);

  useEffect(() => { setMoreOpen(false); setPlatformSheet(false); }, [location.pathname]);

  const daysLeft = (() => {
    if (!user?.subscription?.currentPeriodEnd) return null;
    const ms = new Date(user.subscription.currentPeriodEnd) - new Date();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  })();

  // Header title shows only for pages that have been redesigned to omit their
  // own heading. Others fall back to a compact logo bar (no duplicate title).
  const header = (() => {
    if (location.pathname === '/app') {
      return {
        title: isCombined ? 'Combined Dashboard' : 'Dashboard',
        subtitle: isCombined
          ? 'Flipkart, Meesho & Amazon — summed by dispatch date'
          : 'By dispatch date · returns count as loss too',
      };
    }
    return null;
  })();

  // Core tabs adapt to combined mode (per-platform pages are hidden there).
  const coreTabs = isCombined
    ? [
        { to: '/app', label: 'Dashboard', icon: 'dashboard', end: true },
        { to: '/app/supplier-orders', label: 'Supplier', icon: 'box' },
      ]
    : [
        { to: '/app', label: 'Dashboard', icon: 'dashboard', end: true },
        { to: '/app/orders', label: 'Orders', icon: 'orders' },
        { to: '/app/upload', label: 'Upload', icon: 'upload' },
        { to: '/app/sku', label: 'SKUs', icon: 'tag' },
      ];

  const activeMeta = isCombined ? ALL_META : PLATFORM_META[platform];
  const multiPlatform = (allowed || []).length > 1;
  const initial = (user?.name || user?.email || '?').slice(0, 1).toUpperCase();

  return (
    <div className="app-shell">
      <header className={`app-header ${header ? 'has-title' : 'compact'}`}>
        <div className="hdr-row">
          <div className="hdr-left">
            {header ? (
              <h1 className="hdr-title">{header.title}</h1>
            ) : (
              <div className="hdr-brand">
                <Logo variant="icon" size={30} />
                <span>Profx</span>
              </div>
            )}
          </div>

          <div className="hdr-right">
            {multiPlatform && (
              <button
                type="button"
                className="hdr-platform"
                onClick={() => setPlatformSheet(true)}
                aria-label="Switch marketplace"
              >
                {isCombined ? (
                  <span className="hdr-platform-emoji">{activeMeta?.emoji}</span>
                ) : (
                  <img className="hdr-platform-icon" src={activeMeta?.logo} alt="" />
                )}
                <Ic name="chevron" size={14} />
              </button>
            )}
            <button
              type="button"
              className="hdr-avatar"
              onClick={() => navigate('/app/profile')}
              aria-label="Profile"
            >
              {initial}
            </button>
          </div>
        </div>
        {header?.subtitle && <p className="hdr-sub">{header.subtitle}</p>}
      </header>

      <main className="app-main">
        {daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && !user?.isAdmin && (
          <div className="sub-warning">
            Your subscription expires in <strong>{daysLeft} day{daysLeft === 1 ? '' : 's'}</strong>. Renew to avoid interruption.
          </div>
        )}
        {children}
      </main>

      <nav className="app-tabbar">
        {coreTabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `tab ${isActive ? 'is-active' : ''}`}
          >
            <Ic name={t.icon} size={22} />
            <span>{t.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`tab ${moreOpen ? 'is-active' : ''}`}
          onClick={() => setMoreOpen(true)}
        >
          <Ic name="more" size={22} />
          <span>More</span>
        </button>
      </nav>

      {/* ---- More sheet ---- */}
      {moreOpen && (
        <div className="sheet-wrap" role="dialog" aria-label="More">
          <button className="sheet-scrim" aria-label="Close" onClick={() => setMoreOpen(false)} />
          <div className="sheet">
            <span className="sheet-grip" />
            <div className="sheet-title">More</div>
            <div className="sheet-list">
              {!isCombined && (
                <NavLink to="/app/supplier-orders" className="sheet-item">
                  <span className="sheet-ic"><Ic name="box" size={20} /></span>
                  <span>Supplier Orders</span>
                  <Ic name="chevron" size={18} />
                </NavLink>
              )}
              <NavLink to="/app/profile" className="sheet-item">
                <span className="sheet-ic"><Ic name="user" size={20} /></span>
                <span>Profile &amp; Settings</span>
                <Ic name="chevron" size={18} />
              </NavLink>
              {user?.isAdmin && (
                <NavLink to="/admin" className="sheet-item">
                  <span className="sheet-ic"><Ic name="admin" size={20} /></span>
                  <span>Admin Panel</span>
                  <Ic name="chevron" size={18} />
                </NavLink>
              )}
              <button className="sheet-item sheet-item-danger" onClick={() => { logout(); }}>
                <span className="sheet-ic"><Ic name="logout" size={20} /></span>
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Platform switcher sheet ---- */}
      {platformSheet && (
        <div className="sheet-wrap" role="dialog" aria-label="Switch marketplace">
          <button className="sheet-scrim" aria-label="Close" onClick={() => setPlatformSheet(false)} />
          <div className="sheet">
            <span className="sheet-grip" />
            <div className="sheet-title">Marketplace</div>
            <div className="sheet-list">
              {(allowed || []).map((p) => {
                const meta = p === ALL_PLATFORM ? ALL_META : PLATFORM_META[p];
                const active = p === platform;
                return (
                  <button
                    key={p}
                    className={`sheet-item ${active ? 'is-active' : ''}`}
                    onClick={() => { if (!active) switchPlatform(p); setPlatformSheet(false); }}
                  >
                    <span className="sheet-ic sheet-ic-plain">
                      {p === ALL_PLATFORM
                        ? <span className="sheet-emoji">{meta.emoji}</span>
                        : <img src={meta.logo} alt="" />}
                    </span>
                    <span style={active ? { color: meta.color, fontWeight: 700 } : undefined}>{meta.label}</span>
                    {active && <span className="sheet-check" style={{ color: meta.color }}><Ic name="check" size={18} /></span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
