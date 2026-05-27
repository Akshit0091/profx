import React, { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../utils/AuthContext';
import Logo from '../Logo';
import './MarketingLayout.css';

function BrandLogo() {
  return (
    <Link to="/" className="mk-logo" aria-label="Profx home">
      <Logo variant="lockup" size={44} />
    </Link>
  );
}

export default function MarketingLayout({ children }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <div className="mk-site">
      <header className={`mk-nav ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="mk-container mk-nav-inner">
          <BrandLogo />

          <nav className={`mk-nav-links ${mobileOpen ? 'is-open' : ''}`}>
            <NavLink to="/product" className="mk-nav-link">Product</NavLink>
            <NavLink to="/#pricing" className="mk-nav-link" onClick={(e) => {
              if (location.pathname === '/') {
                e.preventDefault();
                document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
              }
            }}>Pricing</NavLink>
            <NavLink to="/#how" className="mk-nav-link" onClick={(e) => {
              if (location.pathname === '/') {
                e.preventDefault();
                document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' });
              }
            }}>How it works</NavLink>
            <NavLink to="/#faq" className="mk-nav-link" onClick={(e) => {
              if (location.pathname === '/') {
                e.preventDefault();
                document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' });
              }
            }}>FAQ</NavLink>
            <NavLink to="/contact" className="mk-nav-link">Contact</NavLink>
          </nav>

          <div className="mk-nav-actions">
            {user ? (
              <Link to={user.isAdmin ? '/admin' : (user.isActive ? '/app' : '/payment')} className="mk-btn mk-btn-primary">
                Open app →
              </Link>
            ) : (
              <>
                <Link to="/login" className="mk-link-quiet">Sign in</Link>
                <Link to="/signup" className="mk-btn mk-btn-primary">Get started</Link>
              </>
            )}
            <button
              className="mk-burger"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="mk-footer">
        <div className="mk-container mk-footer-inner">
          <div className="mk-footer-brand">
            <BrandLogo />
            <p className="mk-footer-tag">Know your real profit, every order, every day.</p>
          </div>
          <div className="mk-footer-cols">
            <div className="mk-footer-col">
              <h4>Product</h4>
              <Link to="/product">Features</Link>
              <Link to="/#pricing">Pricing</Link>
              <Link to="/#how">How it works</Link>
              <Link to="/#faq">FAQ</Link>
            </div>
            <div className="mk-footer-col">
              <h4>Company</h4>
              <Link to="/contact">Contact</Link>
              <a href="mailto:support.profx@gmail.com">Email us</a>
              <Link to="/signup">Create account</Link>
              <Link to="/login">Sign in</Link>
            </div>
            <div className="mk-footer-col">
              <h4>Legal</h4>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms &amp; Conditions</Link>
              <Link to="/refund">Refund &amp; Cancellation</Link>
            </div>
          </div>
        </div>
        <div className="mk-footer-bottom">
          <div className="mk-container mk-footer-bottom-inner">
            <span>© {new Date().getFullYear()} ProfX. Made in India.</span>
            <span className="mk-footer-bottom-meta">Built for Flipkart sellers.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
