// pages/Landing.js - ProfX Marketing Landing Page
import React from "react";
import { Link } from "react-router-dom";
import "./Landing.css";

const FEATURES = [
  { icon: "📤", title: "Upload Reports", desc: "Upload Flipkart Pickup CSV and Settlement Excel in seconds" },
  { icon: "🔗", title: "Auto Matching", desc: "Orders matched automatically by Order Item ID — no manual work" },
  { icon: "💰", title: "Exact Profit", desc: "See Bank Settlement minus your Purchase Price = Real Profit" },
  { icon: "📊", title: "Live Dashboard", desc: "Charts showing profit trends, revenue, loss orders at a glance" },
  { icon: "⚠️", title: "SKU Alerts", desc: "Instantly notified when an SKU has no purchase price set" },
  { icon: "⬇️", title: "Export Reports", desc: "Download profit reports as Excel for your records or CA" },
];

const STEPS = [
  { n: "01", title: "Sign Up & Pay", desc: "Create your account and pay ₹599/month. Instant activation." },
  { n: "02", title: "Add SKU Prices", desc: "Enter your purchase price for each SKU you sell." },
  { n: "03", title: "Upload Reports", desc: "Upload your Pickup CSV and Flipkart Settlement Excel file." },
  { n: "04", title: "See Your Profit", desc: "Dashboard shows exact profit per order, per SKU, per day." },
];

export default function Landing() {
  return (
    <div className="landing">
      {/* Navbar */}
      <nav className="landing-nav">
        <div className="nav-inner">
          <div className="nav-logo">
            <div className="nav-logo-box">PX</div>
            <span className="nav-logo-text">ProfX</span>
          </div>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
          </div>
          <div className="nav-cta">
            <Link to="/login" className="nav-login">Sign In</Link>
            <Link to="/signup" className="nav-signup">Get Started →</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="hero-badge">🚀 Built for Flipkart Sellers</div>
        <h1 className="hero-title">
          Know Exactly How Much<br />
          <span className="hero-gradient">You Earned Today</span>
        </h1>
        <p className="hero-sub">
          Upload your Flipkart Pickup and Settlement reports.<br />
          ProfX calculates your exact profit per order — automatically.
        </p>
        <div className="hero-cta">
          <Link to="/signup" className="hero-btn-primary">
            Start Tracking Profit →
          </Link>
          <div className="hero-price-note">₹599/month · Cancel anytime</div>
        </div>

        {/* Stats */}
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-value">100%</div>
            <div className="hero-stat-label">Accurate profit data</div>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <div className="hero-stat-value">Auto</div>
            <div className="hero-stat-label">Order matching</div>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <div className="hero-stat-value">Real-time</div>
            <div className="hero-stat-label">Dashboard updates</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section" id="features">
        <div className="section-inner">
          <div className="section-tag">Features</div>
          <h2 className="section-title">Everything you need to track profit</h2>
          <p className="section-sub">No spreadsheets. No manual calculations. Just upload and see your numbers.</p>
          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <div key={i} className="feature-card">
                <div className="feature-icon">{f.icon}</div>
                <div className="feature-title">{f.title}</div>
                <div className="feature-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section section-alt" id="how">
        <div className="section-inner">
          <div className="section-tag">How it works</div>
          <h2 className="section-title">Set up in 10 minutes</h2>
          <div className="steps-grid">
            {STEPS.map((s, i) => (
              <div key={i} className="step-card">
                <div className="step-num">{s.n}</div>
                <div className="step-title">{s.title}</div>
                <div className="step-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="section" id="pricing">
        <div className="section-inner">
          <div className="section-tag">Pricing</div>
          <h2 className="section-title">Simple, honest pricing</h2>
          <p className="section-sub">One plan. Everything included. No hidden fees.</p>

          <div className="pricing-card">
            <div className="pricing-badge">Most Popular</div>
            <div className="pricing-name">ProfX Starter</div>
            <div className="pricing-amount">
              <span className="pricing-rupee">₹</span>
              <span className="pricing-number">599</span>
              <span className="pricing-per">/month</span>
            </div>
            <div className="pricing-desc">Everything you need to track your Flipkart profit</div>

            <ul className="pricing-features">
              {[
                "Unlimited order uploads",
                "Pickup + Settlement report matching",
                "Real-time profit dashboard",
                "SKU purchase price management",
                "Export reports as Excel",
                "Email support",
              ].map((f, i) => (
                <li key={i}>
                  <span className="check">✓</span> {f}
                </li>
              ))}
            </ul>

            <Link to="/signup" className="pricing-cta">
              Get Started Now →
            </Link>
            <div className="pricing-note">Secure payment via Razorpay · Cancel anytime</div>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="cta-banner">
        <div className="section-inner" style={{ textAlign: "center" }}>
          <h2 className="cta-title">Stop guessing your profit.<br />Start knowing it.</h2>
          <p className="cta-sub">Join Flipkart sellers who track their real earnings with ProfX</p>
          <Link to="/signup" className="hero-btn-primary" style={{ display: "inline-block", marginTop: 24 }}>
            Start for ₹599/month →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="nav-inner">
          <div className="nav-logo">
            <div className="nav-logo-box">PX</div>
            <span className="nav-logo-text">ProfX</span>
          </div>
          <div className="footer-links">
            <span>Built for Flipkart Sellers</span>
            <span>·</span>
            <a href="mailto:pathakakshit17@gmail.com">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
