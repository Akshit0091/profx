import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from '../components/marketing/MarketingLayout';
import DashboardPreview from '../components/marketing/DashboardPreview';
import './Landing.css';

const FEATURES = [
  {
    icon: '🎯',
    title: 'True per-order profit',
    body: 'Settlement minus purchase price minus reverse-shipping. No spreadsheets, no math at midnight.',
  },
  {
    icon: '🔗',
    title: 'Auto-matched orders',
    body: 'Pickup, settlement, and return reports are matched by Order Item ID — automatically. Multi-file aware.',
  },
  {
    icon: '🔄',
    title: 'Returns done right',
    body: 'Two-stage returns (incoming → received). Reverse-shipping fees counted, recovered inventory not penalized.',
  },
  {
    icon: '📈',
    title: 'Real-time dashboard',
    body: 'Revenue, cost, net profit by dispatch date. Quick filters, month view, or any custom date range.',
  },
  {
    icon: '🏷️',
    title: 'SKU pricing in seconds',
    body: 'Detect missing prices, fill them inline, watch every linked order recalculate instantly.',
  },
  {
    icon: '✏️',
    title: 'Manual overrides',
    body: 'Edit any settlement, flag any order as returned. Your call beats the file when Flipkart gets weird.',
  },
];

const HOW = [
  { n: '01', t: 'Upload Pickup CSV',       d: 'Drop the Flipkart pickup export. Order Item IDs, SKUs, and tracking IDs ingested instantly.' },
  { n: '02', t: 'Upload Settlement Excel', d: 'Multi-file aware — every payout row across every settlement file is summed for each order.' },
  { n: '03', t: 'Set SKU purchase prices', d: 'Add a price once per SKU. We auto-detect missing ones and link them to every order.' },
  { n: '04', t: 'Upload Return reports',   d: 'Return on the way + Return received. Profit recalculates with reverse-shipping deducted.' },
];

const FAQ = [
  {
    q: 'How is "real profit" different from what Flipkart shows me?',
    a: 'Flipkart shows you payouts. ProfX shows you payouts minus your actual purchase cost minus reverse-shipping fees on returns. The number you walk away with — not the number that hits your bank account.',
  },
  {
    q: 'Which Flipkart reports do I need to upload?',
    a: 'Three: the Pickup CSV (orders dispatched), the Settlement Excel (payouts), and the Return reports (in-transit + received). All from Flipkart Seller Hub. ProfX parses them as-is, no formatting required.',
  },
  {
    q: 'What if the same order has multiple settlement entries across weeks?',
    a: 'They accumulate. We store every settlement line item, identify them by file hash, and sum across all uploads. Promotional reimbursements that hit weeks later are added to the order automatically.',
  },
  {
    q: 'Can I correct an order if Flipkart\u2019s data is wrong?',
    a: 'Yes. Click any settlement cell to edit it inline, or mark/unmark any order as returned manually. Your overrides survive future uploads.',
  },
  {
    q: 'Is my data secure?',
    a: 'Every account is isolated. Your orders, SKUs, and settlements are scoped to your user only and never shared, exported, or used for anything beyond your dashboard.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Email us at contact.profx@gmail.com and we cancel from the next billing cycle. Your data stays accessible until your current period ends.',
  },
];

function FaqItem({ q, a, open, onToggle }) {
  return (
    <div className={`faq-item ${open ? 'is-open' : ''}`}>
      <button className="faq-q" onClick={onToggle} aria-expanded={open}>
        <span>{q}</span>
        <span className="faq-chev">{open ? '−' : '+'}</span>
      </button>
      <div className="faq-a-wrap">
        <p className="faq-a">{a}</p>
      </div>
    </div>
  );
}

export default function Landing() {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="hero">
        <div className="hero-bg" aria-hidden="true">
          <div className="hero-blob hero-blob-1" />
          <div className="hero-blob hero-blob-2" />
        </div>

        <div className="mk-container hero-inner">
          <span className="hero-eyebrow">
            <span className="hero-eyebrow-dot" />
            Built for Flipkart sellers
          </span>
          <h1 className="hero-title">
            Know your <span className="hero-grad">real profit</span>,<br />
            on every Flipkart order.
          </h1>
          <p className="hero-sub">
            Stop guessing what you actually made. ProfX matches your pickup, settlement, and return
            reports automatically — and shows you the one number that matters: profit per order, after
            every fee and return.
          </p>
          <div className="hero-ctas">
            <Link to="/signup" className="mk-btn mk-btn-cta">
              Get started — ₹599/month
            </Link>
            <a href="#how" className="mk-btn mk-btn-ghost mk-btn-lg" onClick={(e) => {
              e.preventDefault();
              document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' });
            }}>
              See how it works ↓
            </a>
          </div>
          <div className="hero-trust">
            <div><strong>100%</strong> accurate matching</div>
            <div><strong>3</strong> file types supported</div>
            <div><strong>0</strong> spreadsheets needed</div>
          </div>
        </div>

        <div className="mk-container hero-preview-wrap">
          <DashboardPreview />
        </div>
      </section>

      {/* Pain / Promise */}
      <section className="section section-pain">
        <div className="mk-container">
          <div className="pain-grid">
            <div className="pain-card pain-bad">
              <span className="pain-tag">Without ProfX</span>
              <ul>
                <li>Settlement Excel opens in 47 columns of confusion</li>
                <li>Returns silently erase your profit and you only notice in the bank statement</li>
                <li>Promotional reimbursements paid 3 weeks late, never reconciled</li>
                <li>No idea which SKUs actually make money</li>
                <li>Spreadsheets that take 4 hours and are wrong anyway</li>
              </ul>
            </div>
            <div className="pain-card pain-good">
              <span className="pain-tag">With ProfX</span>
              <ul>
                <li>One screen shows revenue, cost, profit, returns — by day</li>
                <li>Returns auto-detected with reverse-shipping math built in</li>
                <li>Multi-file settlements summed correctly, every time</li>
                <li>Per-SKU profitability visible the moment you set a price</li>
                <li>Upload three files. Done in 30 seconds.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section">
        <div className="mk-container">
          <div className="section-head">
            <span className="section-eyebrow">Features</span>
            <h2 className="section-title">Everything you need.<br />Nothing you don't.</h2>
            <p className="section-sub">
              ProfX is built around one job: telling you the truth about your Flipkart profit.
              No charts you'll never look at, no integrations you don't need.
            </p>
          </div>

          <div className="feat-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="feat-card">
                <div className="feat-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="section section-soft">
        <div className="mk-container">
          <div className="section-head">
            <span className="section-eyebrow">How it works</span>
            <h2 className="section-title">From file to profit in four steps.</h2>
            <p className="section-sub">
              Drop the same Flipkart reports you already download. ProfX handles the rest.
            </p>
          </div>

          <div className="how-grid">
            {HOW.map((h, i) => (
              <div key={h.n} className="how-card">
                <div className="how-num">{h.n}</div>
                <h3>{h.t}</h3>
                <p>{h.d}</p>
                {i < HOW.length - 1 && <div className="how-connector" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="section">
        <div className="mk-container">
          <div className="section-head">
            <span className="section-eyebrow">Pricing</span>
            <h2 className="section-title">One plan. Everything included.</h2>
            <p className="section-sub">No tiers, no upsells, no per-order pricing.</p>
          </div>

          <div className="price-card-wrap">
            <div className="price-card">
              <div className="price-badge">Most popular</div>
              <div className="price-name">ProfX Starter</div>
              <div className="price-amount">
                <span className="price-currency">₹</span>
                <span className="price-number">599</span>
                <span className="price-period">/month</span>
              </div>
              <p className="price-tag">Everything you need to track real profit, forever.</p>

              <ul className="price-features">
                <li>✓ Unlimited orders, SKUs, and uploads</li>
                <li>✓ Pickup, settlement, and return matching</li>
                <li>✓ Multi-file accumulative settlements</li>
                <li>✓ Real-time profit dashboard with custom date ranges</li>
                <li>✓ Per-SKU profitability and bulk pricing</li>
                <li>✓ Excel export of every order with full breakdown</li>
                <li>✓ Manual settlement and return overrides</li>
                <li>✓ Priority email support</li>
              </ul>

              <Link to="/signup" className="mk-btn mk-btn-cta mk-btn-lg price-cta">
                Get started — ₹599/month
              </Link>

              <p className="price-fine">
                Cancel anytime. No setup fees. UPI &amp; cards accepted via Razorpay.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="section section-soft">
        <div className="mk-container">
          <div className="section-head">
            <span className="section-eyebrow">FAQ</span>
            <h2 className="section-title">Questions, answered.</h2>
            <p className="section-sub">
              Still curious? Email{' '}
              <a href="mailto:contact.profx@gmail.com" className="mk-inline-link">
                contact.profx@gmail.com
              </a>
              .
            </p>
          </div>

          <div className="faq-list">
            {FAQ.map((item, i) => (
              <FaqItem
                key={item.q}
                {...item}
                open={openFaq === i}
                onToggle={() => setOpenFaq(openFaq === i ? -1 : i)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section section-final-cta">
        <div className="mk-container">
          <div className="final-cta">
            <h2>Ready to see what you actually earn?</h2>
            <p>Three files, one screen, real profit. ₹599/month.</p>
            <Link to="/signup" className="mk-btn mk-btn-cta mk-btn-lg">
              Get started now →
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
