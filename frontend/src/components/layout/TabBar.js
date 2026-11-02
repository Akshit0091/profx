import React from 'react';
import { NavLink } from 'react-router-dom';
import './TabBar.css';

/**
 * The bar along the bottom of the screen on a phone.
 *
 * The sidebar carries nine or more destinations, which is right at a desk and
 * unusable with a thumb. These are the four a packer actually moves between
 * during a shift; everything else stays one tap away behind More, which opens
 * the same drawer the sidebar always was.
 *
 * Hidden above 768px, where the sidebar is the navigation.
 */

/* Line icons rather than the sidebar's emoji: emoji render differently on
   every phone and cannot take the active colour. */
const Icon = ({ d, fill }) => (
  <svg
    className="tabbar-icon"
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill={fill ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {d}
  </svg>
);

const HOME = <Icon d={<><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" /></>} />;
const ORDERS = <Icon d={<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></>} />;
const SCAN = <Icon d={<><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M7.5 12h9" /></>} />;
const ACCOUNT = <Icon d={<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" /></>} />;
const MORE = <Icon d={<><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>} />;

const TABS = [
  { to: '/app', label: 'Home', icon: HOME, end: true },
  { to: '/app/orders', label: 'Orders', icon: ORDERS },
  { to: '/app/scan', label: 'Scan', icon: SCAN },
  { to: '/app/profile', label: 'Account', icon: ACCOUNT },
];

export default function TabBar({ onMore, moreOpen }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => `tabbar-item ${isActive && !moreOpen ? 'is-active' : ''}`}
        >
          {tab.icon}
          <span className="tabbar-label">{tab.label}</span>
        </NavLink>
      ))}

      <button
        type="button"
        className={`tabbar-item ${moreOpen ? 'is-active' : ''}`}
        onClick={onMore}
        aria-expanded={!!moreOpen}
      >
        {MORE}
        <span className="tabbar-label">More</span>
      </button>
    </nav>
  );
}
