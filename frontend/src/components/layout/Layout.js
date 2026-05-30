import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../utils/AuthContext';
import Logo from '../Logo';
import { useActivePlatform, PLATFORM_META, ALL_PLATFORM, ALL_META } from '../../utils/platforms';
import './Layout.css';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { platform, switchPlatform, allowed } = useActivePlatform(user);
  const isCombined = platform === ALL_PLATFORM;

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const daysLeft = (() => {
    if (!user?.subscription?.currentPeriodEnd) return null;
    const ms = new Date(user.subscription.currentPeriodEnd) - new Date();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  })();

  const sellerNavAll = [
    { to: '/app',         label: 'Dashboard',      icon: '📊', end: true },
    { to: '/app/upload',  label: 'Upload Reports', icon: '📤' },
    { to: '/app/orders',  label: 'Orders',         icon: '📋' },
    { to: '/app/sku',     label: 'SKU Pricing',    icon: '🏷️' },
  ];
  // Combined view is dashboard-only — Upload / Orders / SKU are per-platform,
  // so hide them when 'All Platforms' is active.
  const sellerNav = isCombined
    ? sellerNavAll.filter((i) => i.to === '/app')
    : sellerNavAll;
  const adminNav = [
    { to: '/admin', label: 'Admin Panel', icon: '⚙️' },
    { to: '/app',   label: 'Seller View', icon: '👁️', end: true },
  ];

  return (
    <div className={`layout ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <Logo variant="icon" size={36} />
            {!collapsed && (
              <div className="brand-text">
                <div className="brand-name">Profx</div>
                <div className="brand-tag">Profit tracker</div>
              </div>
            )}
          </div>
          <button className="collapse-btn" onClick={() => setCollapsed((c) => !c)} title="Toggle sidebar">
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {/* Platform switcher — shown when the user owns more than one platform,
            or owns all three (so the 'All' option is available). */}
        {allowed.length > 1 && (
          <div className={`platform-switcher ${collapsed ? 'is-collapsed' : ''}`}>
            {!collapsed && <div className="platform-switcher-label">Marketplace</div>}
            <div className="platform-pills">
              {allowed.map((p) => {
                const meta = p === ALL_PLATFORM ? ALL_META : PLATFORM_META[p];
                const active = p === platform;
                return (
                  <button
                    key={p}
                    type="button"
                    className={`platform-pill ${active ? 'is-active' : ''}`}
                    style={active ? { borderColor: meta.color, color: meta.color } : undefined}
                    onClick={() => !active && switchPlatform(p)}
                    title={meta.label}
                    aria-label={meta.label}
                  >
                    {p === ALL_PLATFORM ? (
                      <span className="platform-pill-emoji">{meta.emoji}</span>
                    ) : (
                      <img className="platform-pill-icon" src={meta.logo} alt="" />
                    )}
                    {!collapsed && <span className="platform-pill-label">{meta.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <nav className="sidenav">
          {!collapsed && <div className="nav-section">Workspace</div>}
          {sellerNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
            </NavLink>
          ))}

          {user?.isAdmin && (
            <>
              {!collapsed && <div className="nav-section">Admin</div>}
              {adminNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {!collapsed && <span className="nav-label">{item.label}</span>}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="user-card">
            <div className="avatar">{(user?.email || '?').slice(0, 1).toUpperCase()}</div>
            {!collapsed && (
              <div className="user-meta">
                <div className="user-email" title={user?.email}>{user?.email}</div>
                <div className="user-role">{user?.isAdmin ? 'Admin' : 'Seller'}</div>
              </div>
            )}
          </div>
          <button className="signout-btn" onClick={logout} title="Sign out">
            <span>⎋</span>
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      <button className="mobile-toggle" onClick={() => setMobileOpen((v) => !v)}>☰</button>

      <main className="main">
        {daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && !user?.isAdmin && (
          <div className="sub-warning">
            ⚠ Your subscription expires in <strong>{daysLeft} day{daysLeft === 1 ? '' : 's'}</strong>. Please renew to avoid interruption.
          </div>
        )}
        <div className="main-inner">{children}</div>
      </main>
    </div>
  );
}
