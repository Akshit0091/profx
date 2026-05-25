import React, { useState } from 'react';
import MarketingLayout from '../components/marketing/MarketingLayout';
import './Contact.css';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // No backend endpoint for contact yet — open the user's mail client
    // with a prefilled message. Most reliable, requires nothing extra.
    const subject = encodeURIComponent(form.subject || 'ProfX enquiry');
    const body = encodeURIComponent(
      `${form.message}\n\n—\nFrom: ${form.name || 'Someone'} (${form.email || 'no email provided'})`
    );
    window.location.href = `mailto:contact.profx@gmail.com?subject=${subject}&body=${body}`;
    setSent(true);
  };

  return (
    <MarketingLayout>
      <section className="ct-hero">
        <div className="mk-container ct-hero-inner">
          <span className="section-eyebrow">Contact</span>
          <h1>Let's talk.</h1>
          <p>
            Questions about ProfX, a feature request, a billing issue, or just want to say hi?
            We read every message.
          </p>
        </div>
      </section>

      <section className="ct-body">
        <div className="mk-container ct-grid">
          <div className="ct-info">
            <h2>Reach us directly</h2>

            <div className="ct-info-block">
              <div className="ct-info-icon">✉️</div>
              <div>
                <h3>Email</h3>
                <a href="mailto:contact.profx@gmail.com" className="ct-info-value">
                  contact.profx@gmail.com
                </a>
                <p>For product questions, billing, and support. We reply within one business day.</p>
              </div>
            </div>

            <div className="ct-info-block">
              <div className="ct-info-icon">🇮🇳</div>
              <div>
                <h3>Based in</h3>
                <span className="ct-info-value">India</span>
                <p>Built by Indian sellers, for Indian sellers. We understand the Flipkart payout model
                because we live it too.</p>
              </div>
            </div>

            <div className="ct-info-block">
              <div className="ct-info-icon">⏱️</div>
              <div>
                <h3>Response time</h3>
                <span className="ct-info-value">Within 24 hours</span>
                <p>Monday to Saturday. Sunday emails get answered Monday morning, IST.</p>
              </div>
            </div>
          </div>

          <div className="ct-form-card">
            <h2>Send us a message</h2>
            <p className="ct-form-tag">We'll open your email client with the message prefilled — quickest way to keep a record on both sides.</p>

            {sent && (
              <div className="ct-form-success">
                ✓ Your email client should have opened with the message. If not, write to{' '}
                <a href="mailto:contact.profx@gmail.com">contact.profx@gmail.com</a> directly.
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="ct-form-row">
                <div className="ct-form-group">
                  <label>Your name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Akshit"
                  />
                </div>
                <div className="ct-form-group">
                  <label>Your email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@example.com"
                  />
                </div>
              </div>
              <div className="ct-form-group">
                <label>Subject</label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Billing question / Feature request / Bug report"
                />
              </div>
              <div className="ct-form-group">
                <label>Message</label>
                <textarea
                  rows={6}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="What's on your mind?"
                />
              </div>
              <button type="submit" className="mk-btn mk-btn-cta mk-btn-lg ct-submit">
                Send message →
              </button>
            </form>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
