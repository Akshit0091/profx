import React from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from '../components/marketing/MarketingLayout';
import './Product.css';

const BLOCKS = [
  {
    eyebrow: 'Auto-matching engine',
    title: 'One source of truth for every order.',
    body: 'ProfX joins your pickup, settlement, and return reports by Order Item ID — the only key Flipkart uses consistently across all three. Once joined, every order has a single, accurate row.',
    points: [
      'Pickup row stores SKU, dispatch date, and tracking ID',
      'Settlement rows feed into a per-order ledger that accumulates across files',
      'Return reports flip status flags without breaking previous data',
    ],
    side: 'matching',
  },
  {
    eyebrow: 'Multi-file settlements',
    title: 'Promotions reimbursed weeks later? Still counted.',
    body: 'Flipkart often pays you across multiple settlement files — the buyer\u2019s payment in one, the marketplace subsidy in another. ProfX hashes every file and stores every line, then sums them per order.',
    points: [
      'Each settlement row is fingerprinted by file hash + row index',
      'Re-uploading the same file is idempotent — no double-counting',
      'Manual overrides are stored as their own line, so they survive future uploads',
    ],
    side: 'settlements',
  },
  {
    eyebrow: 'Returns that respect reality',
    title: 'You got the item back. We don\u2019t pretend you didn\u2019t.',
    body: 'A return isn\u2019t a loss equal to your purchase price — your inventory came back. The only real loss is the reverse-shipping charge Flipkart may have taken. ProfX gets this right.',
    points: [
      'Two-stage tracking: Return Incoming → Return Received',
      'Returned orders use settlement-only profit (no cost subtracted)',
      'Negative settlement (reverse-shipping fees) flows directly into your loss',
    ],
    side: 'returns',
  },
  {
    eyebrow: 'Dashboard built for decisions',
    title: 'See profit by day, month, or any range.',
    body: 'Default view: last 30 days by dispatch date. Switch to a specific month, or pick any custom window. Returned orders are included so their (sometimes negative) profit hits the totals honestly.',
    points: [
      'Quick filters: 7 / 30 / 90 days',
      'Month picker covering the last 24 months',
      'Custom date range with from/to pickers',
      'Eight stat cards: orders, revenue, cost, profit, returns, return-incoming, profit-orders, loss-orders',
    ],
    side: 'dashboard',
  },
  {
    eyebrow: 'Per-SKU pricing',
    title: 'The number that turns settlements into profit.',
    body: 'Set purchase price once per SKU. ProfX automatically detects SKUs that appear in your orders but have no price set, and walks you through filling them. Every linked order recalculates instantly.',
    points: [
      'Inline price input next to each missing SKU',
      'Bulk CSV upload for hundreds of SKUs at once',
      'Edit prices anytime; orders recalculate in the background',
    ],
    side: 'sku',
  },
  {
    eyebrow: 'Manual control',
    title: 'When Flipkart\u2019s data is wrong, you win.',
    body: 'Click any settlement cell to edit it inline. Mark or unmark any order as returned. Your overrides persist across future file uploads — the system never silently undoes your corrections.',
    points: [
      'Inline edit on settlement: positive, negative, decimal',
      'Manual return-status toggle per order',
      'Recalculate Profits button to re-apply current rules across your full history',
    ],
    side: 'manual',
  },
];

function MiniVisual({ kind }) {
  if (kind === 'matching') {
    return (
      <div className="pv-card pv-matching">
        <div className="pv-row">
          <span className="pv-tag pv-tag-blue">Pickup</span>
          <code>437405698119098100</code>
        </div>
        <div className="pv-row">
          <span className="pv-tag pv-tag-blue">Settlement</span>
          <code>437405698119098100</code>
        </div>
        <div className="pv-row">
          <span className="pv-tag pv-tag-yellow">Return</span>
          <code>FMPP3953214022</code>
        </div>
        <div className="pv-arrow">↓ matched</div>
        <div className="pv-result">
          <strong>1 order, fully reconciled</strong>
          <small>Profit: <span className="pos">₹38.12</span></small>
        </div>
      </div>
    );
  }
  if (kind === 'settlements') {
    return (
      <div className="pv-card pv-settlements">
        <div className="pv-ledger-head">Order 437405698119098100</div>
        <div className="pv-ledger-row">
          <span>Settlement file • May</span>
          <span className="pv-amt">₹27.97</span>
        </div>
        <div className="pv-ledger-row">
          <span>Settlement file • June</span>
          <span className="pv-amt">₹204.50</span>
        </div>
        <div className="pv-ledger-row pv-ledger-manual">
          <span>Manual adjustment</span>
          <span className="pv-amt">−₹5.00</span>
        </div>
        <div className="pv-ledger-total">
          <span>Total settlement</span>
          <span className="pv-amt pos">₹227.47</span>
        </div>
      </div>
    );
  }
  if (kind === 'returns') {
    return (
      <div className="pv-card pv-returns">
        <div className="pv-status pv-status-incoming">
          <span className="pv-status-dot" /> 🚚 Return Incoming
          <small>Flagged from in-transit file</small>
        </div>
        <div className="pv-arrow">↓ parcel arrives</div>
        <div className="pv-status pv-status-returned">
          <span className="pv-status-dot" /> ↩ Returned
          <small>Profit = settlement only (e.g. −₹50 shipping)</small>
        </div>
      </div>
    );
  }
  if (kind === 'dashboard') {
    return (
      <div className="pv-card pv-dashboard">
        <div className="pv-pills">
          <span>7d</span>
          <span className="active">30d</span>
          <span>90d</span>
          <span>Month</span>
          <span>Range</span>
        </div>
        <div className="pv-stats">
          <div><small>Revenue</small><strong>₹2.18L</strong></div>
          <div><small>Cost</small><strong>₹1.77L</strong></div>
          <div><small>Profit</small><strong className="pos">₹41,520</strong></div>
        </div>
        <svg viewBox="0 0 200 60" className="pv-spark" preserveAspectRatio="none">
          <defs>
            <linearGradient id="pvSpark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,50 L20,42 L40,46 L60,30 L80,36 L100,22 L120,28 L140,16 L160,22 L180,10 L200,16 L200,60 L0,60 Z"
                fill="url(#pvSpark)" stroke="#059669" strokeWidth="1.5" />
        </svg>
      </div>
    );
  }
  if (kind === 'sku') {
    return (
      <div className="pv-card pv-sku">
        <div className="pv-sku-alert">
          <span className="pv-pulse-dot" />
          <strong>3 SKUs need pricing</strong>
        </div>
        <div className="pv-sku-row">
          <code>2512CBC02</code>
          <span className="pv-price-input">₹ <em>227.50</em></span>
          <span className="pv-saved">✓ Saved</span>
        </div>
        <div className="pv-sku-row">
          <code>SH2O3CBC01</code>
          <span className="pv-price-input">₹ <em>308.75</em></span>
          <span className="pv-saved">✓ Saved</span>
        </div>
        <div className="pv-sku-row pv-sku-pending">
          <code>0211CBC51</code>
          <span className="pv-price-input">₹ <em>—</em></span>
          <span className="pv-pending">pending</span>
        </div>
      </div>
    );
  }
  if (kind === 'manual') {
    return (
      <div className="pv-card pv-manual">
        <div className="pv-manual-cell">
          <small>SETTLEMENT</small>
          <div className="pv-manual-input">
            <span>₹</span>
            <em>289.00</em>
            <span className="pv-pencil">✎</span>
          </div>
          <small className="pv-manual-hint">Click to edit</small>
        </div>
        <div className="pv-manual-buttons">
          <span className="pv-pill-btn">Mark Returned</span>
          <span className="pv-pill-btn pv-pill-btn-success">↻ Recalculate</span>
        </div>
      </div>
    );
  }
  return null;
}

export default function Product() {
  return (
    <MarketingLayout>
      <section className="pr-hero">
        <div className="mk-container pr-hero-inner">
          <span className="section-eyebrow">The Product</span>
          <h1>Built for one thing: <span className="hero-grad">real Flipkart profit.</span></h1>
          <p>
            ProfX isn{'\u2019'}t a generic accounting tool with a Flipkart plugin. Every feature exists
            because the Flipkart payout model demands it.
          </p>
        </div>
      </section>

      <section className="pr-blocks">
        <div className="mk-container">
          {BLOCKS.map((b, i) => (
            <div key={b.title} className={`pr-block ${i % 2 === 1 ? 'is-flipped' : ''}`}>
              <div className="pr-block-text">
                <span className="section-eyebrow">{b.eyebrow}</span>
                <h2>{b.title}</h2>
                <p>{b.body}</p>
                <ul>
                  {b.points.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
              <div className="pr-block-visual">
                <MiniVisual kind={b.side} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section section-final-cta">
        <div className="mk-container">
          <div className="final-cta">
            <h2>One number. Every day. Real profit.</h2>
            <p>Start your ProfX account in under a minute.</p>
            <Link to="/signup" className="mk-btn mk-btn-cta mk-btn-lg">Get started — ₹599/month →</Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
