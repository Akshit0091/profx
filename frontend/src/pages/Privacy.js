import React from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from '../components/marketing/MarketingLayout';
import './Legal.css';

export default function Privacy() {
  return (
    <MarketingLayout>
      <section className="legal-hero">
        <div className="mk-container">
          <span className="section-eyebrow">Legal</span>
          <h1>Privacy Policy</h1>
          <p className="legal-effective">Effective: 27 May 2026</p>
        </div>
      </section>

      <section className="legal-body">
        <div className="mk-container legal-content">
          <p className="legal-lead">
            ProfX ("we", "us", or "our") respects your privacy. This policy explains what
            we collect, why we collect it, how we use it, and your rights. We try to keep
            this short and honest.
          </p>

          <h2>1. Who we are</h2>
          <p>
            ProfX is a software-as-a-service product that helps Flipkart sellers track
            order-level profitability. We are based in India. The data controller for the
            purposes of this policy is the ProfX team, reachable at{' '}
            <a href="mailto:contact.profx@gmail.com">contact.profx@gmail.com</a>.
          </p>

          <h2>2. What we collect</h2>
          <p>We collect only what we need to run the service:</p>
          <ul>
            <li>
              <strong>Account information:</strong> your name (optional), email address,
              phone number (optional), and a hashed password. Email is required to log in.
            </li>
            <li>
              <strong>Business data:</strong> the contents of the Flipkart reports you
              upload — order item IDs, SKU codes, tracking IDs, settlement amounts,
              purchase prices, and the orders, returns, and dashboards derived from them.
            </li>
            <li>
              <strong>Payment metadata:</strong> when you subscribe, we store the
              subscription status, billing period, and Razorpay payment identifiers. We
              do <em>not</em> store your card number, UPI ID, or any bank credentials.
              Those are handled by Razorpay.
            </li>
            <li>
              <strong>Operational logs:</strong> standard server logs (IP address,
              timestamps, error traces) kept briefly for debugging and abuse prevention.
            </li>
          </ul>

          <h2>3. Why we collect it</h2>
          <ul>
            <li>To provide the ProfX dashboard, matching engine, and reports.</li>
            <li>To process your subscription payment and send receipts.</li>
            <li>To respond to support requests you send us.</li>
            <li>To keep the service secure and to investigate abuse or fraud.</li>
            <li>To comply with applicable Indian laws, including tax laws.</li>
          </ul>

          <h2>4. What we do not do</h2>
          <ul>
            <li>We do not sell your data.</li>
            <li>We do not share your business data with other sellers, ever.</li>
            <li>We do not run advertising networks on the product.</li>
            <li>
              We do not use your uploaded order data to train machine-learning models or
              for any purpose outside your own dashboard.
            </li>
          </ul>

          <h2>5. Who can see your data</h2>
          <p>
            Within ProfX, each seller's data is strictly isolated by user account. The
            only people with access to the raw database are the ProfX team, and only when
            required for support, security investigations, or essential operations.
          </p>
          <p>Some data flows through third-party services:</p>
          <ul>
            <li><strong>Razorpay</strong> — payment processing</li>
            <li><strong>Neon</strong> — managed PostgreSQL database hosting</li>
            <li><strong>Render</strong> — backend application hosting</li>
            <li><strong>Vercel</strong> — frontend application hosting</li>
            <li><strong>Resend</strong> (when enabled) — transactional email delivery</li>
          </ul>
          <p>
            Each of these providers has its own privacy and security policies. We choose
            providers that maintain strong protections.
          </p>

          <h2>6. How long we keep your data</h2>
          <p>
            We keep your data for as long as your account is active. If you delete your
            account, we remove your business data and login credentials within 30 days,
            except for records we are required by law to retain (such as payment records
            for tax and accounting purposes).
          </p>

          <h2>7. Your rights</h2>
          <p>You can, at any time:</p>
          <ul>
            <li>Access your data — it's already visible in your dashboard, and exportable to Excel.</li>
            <li>Correct your data — using the inline edit, recalculate, and SKU pricing tools.</li>
            <li>Delete your account and data — email us and we'll process it within 30 days.</li>
            <li>Ask questions about how your data is handled.</li>
          </ul>
          <p>
            To exercise any of these rights, email{' '}
            <a href="mailto:contact.profx@gmail.com">contact.profx@gmail.com</a>.
          </p>

          <h2>8. Security</h2>
          <p>
            Passwords are hashed with bcrypt. Connections to ProfX and between our
            services use HTTPS/TLS. Access to production systems is restricted. We
            cannot, however, guarantee absolute security — no online service can.
          </p>

          <h2>9. Cookies</h2>
          <p>
            We use a single authentication token stored in your browser's local storage
            to keep you logged in. We do not use third-party advertising cookies or
            cross-site trackers.
          </p>

          <h2>10. Children</h2>
          <p>
            ProfX is intended for businesses and adults. We do not knowingly collect data
            from children under 18.
          </p>

          <h2>11. Changes to this policy</h2>
          <p>
            We may update this policy as the product evolves. Material changes will be
            communicated by email to registered users. The "Effective" date at the top
            always shows when the latest version took effect.
          </p>

          <h2>12. Contact</h2>
          <p>
            Questions, concerns, or requests:{' '}
            <a href="mailto:contact.profx@gmail.com">contact.profx@gmail.com</a>.
          </p>

          <div className="legal-related">
            <p>See also:</p>
            <ul>
              <li><Link to="/terms">Terms &amp; Conditions</Link></li>
              <li><Link to="/refund">Refund &amp; Cancellation Policy</Link></li>
              <li><Link to="/contact">Contact</Link></li>
            </ul>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
