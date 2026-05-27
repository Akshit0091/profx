import React, { useState } from 'react';
import MarketingLayout from '../components/marketing/MarketingLayout';
import api from '../utils/api';
import './Contact.css';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status === 'sending') return;

    // Client-side validation mirrors backend
    if (!form.email || !form.message.trim()) {
      setStatus('error');
      setErrorMsg('Please fill in your email and message.');
      return;
    }
    if (form.message.trim().length < 3) {
      setStatus('error');
      setErrorMsg('Please write a longer message.');
      return;
    }

    setStatus('sending');
    setErrorMsg('');

    try {
      await api.post('/contact', {
        name: form.name.trim(),
        email: form.email.trim(),
        subject: form.subject.trim(),
        message: form.message.trim(),
      });
      setStatus('sent');
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      setStatus('error');
      setErrorMsg(
        err.response?.data?.error ||
        'Could not send right now. Please email support.profx@gmail.com directly.'
      );
    }
  };

  return (
    <MarketingLayout>
      <section className="ct-hero">
        <div className="mk-container ct-hero-inner">
          <span className="section-eyebrow">Contact</span>
          <h1>Let's talk.</h1>
          <p>
            Questions about Profx, a feature request, a billing issue, or just want to say hi?
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
                <a href="mailto:support.profx@gmail.com" className="ct-info-value">
                  support.profx@gmail.com
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
            <p className="ct-form-tag">
              We reply within one business day. Drop a note and we'll get back to you over email.
            </p>

            {status === 'sent' && (
              <div className="ct-form-success">
                ✓ Message sent! We'll reply to your email within one business day.
              </div>
            )}
            {status === 'error' && errorMsg && (
              <div className="ct-form-error">⚠ {errorMsg}</div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="ct-form-row">
                <div className="ct-form-group">
                  <label>Your name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your name"
                    disabled={status === 'sending'}
                  />
                </div>
                <div className="ct-form-group">
                  <label>Your email *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@example.com"
                    disabled={status === 'sending'}
                    required
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
                  disabled={status === 'sending'}
                />
              </div>
              <div className="ct-form-group">
                <label>Message *</label>
                <textarea
                  rows={6}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="What's on your mind?"
                  disabled={status === 'sending'}
                  required
                />
              </div>
              <button
                type="submit"
                className="mk-btn mk-btn-cta mk-btn-lg ct-submit"
                disabled={status === 'sending'}
              >
                {status === 'sending' ? 'Sending…' : 'Send message →'}
              </button>
            </form>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
