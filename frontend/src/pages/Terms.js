import React from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from '../components/marketing/MarketingLayout';
import './Legal.css';

export default function Terms() {
  return (
    <MarketingLayout>
      <section className="legal-hero">
        <div className="mk-container">
          <span className="section-eyebrow">Legal</span>
          <h1>Terms &amp; Conditions</h1>
          <p className="legal-effective">Effective: 27 May 2026</p>
        </div>
      </section>

      <section className="legal-body">
        <div className="mk-container legal-content">
          <p className="legal-lead">
            These Terms govern your use of ProfX. By signing up or using the service,
            you agree to them. Please read carefully — and email{' '}
            <a href="mailto:contact.profx@gmail.com">contact.profx@gmail.com</a> if
            anything is unclear.
          </p>

          <h2>1. The service</h2>
          <p>
            ProfX is a software-as-a-service product that helps Flipkart sellers
            reconcile pickup, settlement, and return reports to calculate per-order
            profitability. The features available at any time are described on this
            website and within the application.
          </p>

          <h2>2. Your account</h2>
          <ul>
            <li>You must provide accurate information when you sign up.</li>
            <li>
              You are responsible for keeping your password confidential and for any
              activity under your account.
            </li>
            <li>
              One account is for one seller / business. You may not share your account
              with others. Each business needs its own subscription.
            </li>
            <li>
              You must notify us immediately if you suspect unauthorized access at{' '}
              <a href="mailto:contact.profx@gmail.com">contact.profx@gmail.com</a>.
            </li>
          </ul>

          <h2>3. Subscription &amp; payment</h2>
          <ul>
            <li>
              ProfX is offered on a monthly subscription at ₹599 per month (inclusive
              of applicable taxes unless stated otherwise).
            </li>
            <li>
              Payments are collected via Razorpay. By subscribing, you authorize
              Razorpay to charge your payment method for each billing period.
            </li>
            <li>
              Your subscription auto-renews monthly unless you cancel before the next
              billing date.
            </li>
            <li>
              We may change pricing in future. You will be given at least 14 days'
              notice by email, and the change will only apply to your next billing
              cycle.
            </li>
          </ul>

          <h2>4. Cancellation &amp; refunds</h2>
          <p>
            See our{' '}
            <Link to="/refund" className="mk-inline-link">
              Refund &amp; Cancellation Policy
            </Link>{' '}
            for the full details. In summary:
          </p>
          <ul>
            <li>You can cancel anytime by emailing us — no fees, no exit penalties.</li>
            <li>
              First 7 days after your initial subscription: full refund on request if
              you're not happy.
            </li>
            <li>
              After 7 days: no pro-rated refund for the current month, but your
              cancellation stops all future billing immediately.
            </li>
          </ul>

          <h2>5. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use ProfX for any unlawful purpose or in violation of any law.</li>
            <li>
              Attempt to gain unauthorized access to any part of the service or its
              underlying infrastructure.
            </li>
            <li>
              Reverse-engineer, decompile, or attempt to extract the source code,
              except to the extent permitted by law.
            </li>
            <li>
              Use the service to send spam, malware, or content that infringes others'
              rights.
            </li>
            <li>Resell, sublicense, or white-label ProfX without our written consent.</li>
            <li>
              Stress-test, abuse, or interfere with the service in ways that affect
              other users.
            </li>
          </ul>

          <h2>6. Your data</h2>
          <p>
            You own the data you upload to ProfX. By using the service, you grant us a
            limited license to store, process, and display it solely to provide the
            service to you. We will never share your business data with other sellers
            or use it for any other purpose. See the{' '}
            <Link to="/privacy" className="mk-inline-link">Privacy Policy</Link> for
            details.
          </p>

          <h2>7. Accuracy disclaimer</h2>
          <p>
            ProfX calculates profit estimates based on the files you upload and the
            prices you enter. While we work hard to keep the matching engine accurate,
            you remain responsible for verifying the numbers before relying on them for
            tax, accounting, business, or financial decisions. ProfX is a tool, not a
            replacement for professional accounting advice.
          </p>

          <h2>8. Service availability</h2>
          <p>
            We aim for high availability but do not guarantee uninterrupted access.
            Planned maintenance, third-party outages (database, hosting, payment
            provider), or unforeseen incidents may cause temporary downtime. We will
            not be liable for any losses resulting from such interruptions.
          </p>

          <h2>9. Intellectual property</h2>
          <p>
            All ProfX branding, design, code, and documentation are owned by ProfX. The
            "ProfX" name and logo may not be used without written permission.
          </p>

          <h2>10. Account termination by us</h2>
          <p>
            We may suspend or terminate accounts that violate these Terms, that show
            signs of fraud or abuse, or whose payments fail repeatedly. Where possible,
            we will give notice and a chance to fix the issue first.
          </p>

          <h2>11. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, ProfX's total liability to you for
            any claim arising from your use of the service is limited to the amount you
            paid us in the 12 months preceding the claim. We are not liable for
            indirect, incidental, or consequential damages, including lost profits or
            business interruption.
          </p>

          <h2>12. Indemnity</h2>
          <p>
            You agree to indemnify and hold ProfX harmless from any claims arising from
            your misuse of the service, your breach of these Terms, or your violation
            of any rights of a third party.
          </p>

          <h2>13. Governing law &amp; jurisdiction</h2>
          <p>
            These Terms are governed by the laws of India. Any disputes shall be
            subject to the exclusive jurisdiction of the courts in India.
          </p>

          <h2>14. Changes to these Terms</h2>
          <p>
            We may update these Terms as the product evolves. Material changes will be
            notified by email. Continued use of ProfX after a change means you accept
            the updated Terms.
          </p>

          <h2>15. Contact</h2>
          <p>
            Email <a href="mailto:contact.profx@gmail.com">contact.profx@gmail.com</a>{' '}
            for any questions regarding these Terms.
          </p>

          <div className="legal-related">
            <p>See also:</p>
            <ul>
              <li><Link to="/privacy">Privacy Policy</Link></li>
              <li><Link to="/refund">Refund &amp; Cancellation Policy</Link></li>
              <li><Link to="/contact">Contact</Link></li>
            </ul>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
