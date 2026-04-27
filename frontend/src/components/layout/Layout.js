// components/layout/Layout.js
import React, { useState } from "react";
import { Outlet, NavLink, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../utils/AuthContext";
import toast from "react-hot-toast";
import "./Layout.css";

const SELLER_NAV = [
  { to: "/app",        label: "Dashboard",     icon: "📊", end: true },
  { to: "/app/upload", label: "Upload Reports", icon: "📤" },
  { to: "/app/orders", label: "Orders",         icon: "📋" },
  { to: "/app/sku",    label: "SKU Pricing",    icon: "🏷️" },
];

const ADMIN_NAV = [
  { to: "/admin",      label: "Admin Panel",   icon: "⚙️", end: true },
  { to: "/app",        label: "Seller View",   icon: "👁️" },
];

export default function Layout({ isAdmin }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    toast.success("Signed out");
    navigate("/");
  };

  const nav = isAdmin ? ADMIN_NAV : SELLER_NAV;
  const emailInitial = user?.email?.[0]?.toUpperCase() || "U";
  const emailShort = user?.email?.split("@")[0] || "User";

  // Subscription warning bar
  const sub = user?.subscription;
  const daysLeft = sub?.currentPeriodEnd
    ? Math.ceil((new Date(sub.currentPeriodEnd) - new Date()) / (1000 * 60 * 60 * 24))
    : null;
  const showWarning = daysLeft !== null && daysLeft <= 7 && !user?.isAdmin;

  return (
    <div className="layout-root">
      {/* Subscription warning */}
      {showWarning && (
        <div className="sub-warning">
          ⚠️ Your subscription expires in <strong>{daysLeft} day{daysLeft !== 1 ? "s" : ""}</strong>.
          <Link to="/payment" style={{ color: "white", marginLeft: 8, fontWeight: 700, textDecoration: "underline" }}>
            Renew now →
          </Link>
        </div>
      )}

      <div className={`layout ${collapsed ? "collapsed" : ""}`}>
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="logo-wrap">
              <div className="logo-box">PX</div>
              {!collapsed && (
                <div>
                  <div className="logo-name">ProfX</div>
                  {isAdmin && <div className="logo-admin-tag">Admin</div>}
                </div>
              )}
            </div>
            <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? "→" : "←"}
            </button>
          </div>

          <nav className="sidebar-nav">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <span className="nav-icon-wrap">{item.icon}</span>
                {!collapsed && <span className="nav-label">{item.label}</span>}
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-footer">
            {!collapsed && (
              <div className="user-card">
                <div className="user-avatar">{emailInitial}</div>
                <div className="user-info-wrap">
                  <div className="user-name">{emailShort}</div>
                  <div className="user-role">{user?.isAdmin ? "Admin" : "Seller"}</div>
                </div>
              </div>
            )}
            <button className="logout-btn" onClick={handleLogout} title="Sign Out">
              <span>⏻</span>
              {!collapsed && <span>Sign Out</span>}
            </button>
          </div>
        </aside>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
