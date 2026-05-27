import React from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from '../components/marketing/MarketingLayout';
import './Legal.css';

export default function Refund() {
  return (
    <MarketingLayout>
      <section className="legal-hero">
        <div className="mk-container">
          <span className="section-eyebrow">Legal</span>
          <h1>Refund &amp; Cancellation Policy</h1>
          <p className="legal-effective">Effective: 27 May 2026</p>
        </div>
      </section>

      <section className="legal-body">
        <div className="mk-container legal-content">
          <p className="legal-lead">
            We want ProfX to feel low-risk. If it isn't working out for you, here's
            exactly how cancellations and refunds work — no fine print, no surprises.
          </p>

          <h2>1. Cancelling your subscription</h2>
          <p>
            You can cancel anytime by emailing{' '}
            <a href="mailto:contact.profx@gmail.com">contact.profx@gmail.com</a> from
            the email address on your ProfX account. State that you'd like to cancel.
            We'll confirm the cancellation by reply.
          </p>
          <p>After we process your cancellation:</p>
          <ul>
            <li>Auto-renewal stops immediately. No further charges will occur.</li>
            <li>
              You keep access to your dashboard and data until the end of your current
              billing period.
            </li>
            <li>
              After that period, your account moves to inactive status. You can
              reactivate any time by subscribing again.
            </li>
          </ul>

          <h2>2. Refunds</h2>

          <h3>7-day refund window</h3>
          <p>
            If you're not happy with ProfX, email us within <strong>7 calendar days</strong>{' '}
            of your first subscription payment and we will refund 100% of that payment.
            No long forms, no justifications required. Just tell us what went wrong so
            we can learn from it.
          </p>

          <h3>After 7 days</h3>
          <p>
            We do not offer pro-rated refunds for partial months after the 7-day window
            ends. Your subscription continues to work until the end of the paid period.
            If you cancel mid-month, you'll keep access until the period expires; no
            further charge will be made.
          </p>

          <h3>Exceptional refunds</h3>
          <p>
            We may issue a discretionary refund if:
          </p>
          <ul>
            <li>
              The service was unavailable for an extended period due to our fault and
              you couldn't use it.
            </li>
            <li>You were charged twice for the same period due to a billing error.</li>
            <li>You believe there's a fraudulent or unauthorized charge.</li>
          </ul>
          <p>
            Email us with the details and we'll review case by case, usually within 3
            business days.
          </p>

          <h2>3. How refunds reach you</h2>
          <ul>
            <li>
              All refunds are issued back through Razorpay to the original payment
              method (card, UPI, or net banking) used for the original transaction.
            </li>
            <li>
              Once processed on our side, the refund typically takes 5–10 business days
              to reflect in your bank or card account, depending on the issuing bank.
            </li>
            <li>We do not issue refunds as cash, cheque, or to a different account.</li>
          </ul>

          <h2>4. Data after cancellation</h2>
          <p>
            Your business data (orders, SKUs, settlements) remains intact for{' '}
            <strong>30 days</strong> after your subscription ends, so you can
            reactivate without losing history. After 30 days, if you have not
            reactivated, we delete your business data permanently. Records required by
            law (payment receipts, tax records) may be retained longer as legally
            required.
          </p>
          <p>
            If you want immediate deletion of your data before the 30 days are up, email
            us with that request and we'll process it within 30 days of your request.
          </p>

          <h2>5. Failed payments</h2>
          <p>
            If a renewal payment fails (expired card, insufficient funds, etc.), we'll
            notify you by email and retry once after 3 days. If the second attempt also
            fails, your account is moved to inactive status until you update your
            payment method.
          </p>

          <h2>6. Disputes &amp; chargebacks</h2>
          <p>
            If you have a concern about a charge, please contact us first — most issues
            are resolved within a day. Initiating a chargeback before reaching out can
            delay the resolution. Repeated unfounded chargebacks may result in account
            closure.
          </p>

          <h2>7. Contact</h2>
          <p>
            All refund and cancellation requests must be sent to{' '}
            <a href="mailto:contact.profx@gmail.com">contact.profx@gmail.com</a> from
            the email on your ProfX account.
          </p>

          <div className="legal-related">
            <p>See also:</p>
            <ul>
              <li><Link to="/privacy">Privacy Policy</Link></li>
              <li><Link to="/terms">Terms &amp; Conditions</Link></li>
              <li><Link to="/contact">Contact</Link></li>
            </ul>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
