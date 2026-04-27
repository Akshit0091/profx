// pages/Signup.js
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import "./Auth.css";

export default function Signup() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast.error("Email and password required");
    if (form.password.length < 6) return toast.error("Password must be at least 6 characters");
    if (form.password !== form.confirm) return toast.error("Passwords do not match");
    setLoading(true);
    try {
      const res = await api.post("/auth/signup", { name: form.name, email: form.email, phone: form.phone, password: form.password });
      login(res.data.token, res.data.user);
      if (res.data.user.isAdmin) { navigate("/admin"); return; }
      // Redirect to payment
      navigate("/payment");
      toast.success("Account created! Please complete payment to activate.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Signup failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-split fade-in">
        <div className="auth-left">
          <div className="auth-brand">
            <Link to="/" className="auth-brand-logo-wrap">
              <div className="auth-brand-logo">PX</div>
            </Link>
            <div className="auth-brand-name">ProfX</div>
            <div className="auth-brand-tag">Start tracking your Flipkart profit today.</div>
          </div>
          <div className="auth-features">
            {["Get started in 10 minutes", "Know profit per order instantly", "Unlimited order uploads", "Cancel anytime"].map((f, i) => (
              <div key={i} className="auth-feature">
                <div className="auth-feature-check">✓</div>
                <div className="auth-feature-text">{f}</div>
              </div>
            ))}
          </div>
          <div className="auth-price-box">
            <div className="auth-price-amount">₹599<span>/month</span></div>
            <div className="auth-price-note">All features included</div>
          </div>
        </div>
        <div className="auth-right">
          <h1 className="auth-title">Create account ✨</h1>
          <p className="auth-sub">One step away from knowing your real profit</p>
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="field">
              <label>Full Name <span style={{ color: "var(--text3)", fontWeight: 400 }}>(optional)</span></label>
              <input type="text" placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Email address</label>
              <input type="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoFocus />
            </div>
            <div className="field">
              <label>Phone <span style={{ color: "var(--text3)", fontWeight: 400 }}>(optional)</span></label>
              <input type="tel" placeholder="9876543210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" placeholder="Min. 6 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="field">
              <label>Confirm Password</label>
              <input type="password" placeholder="Repeat password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
            </div>
            <button type="submit" className="btn-primary auth-btn" disabled={loading}>
              {loading ? <span className="spinner" /> : "Create Account & Pay →"}
            </button>
            <p style={{ fontSize: 12, color: "var(--text3)", textAlign: "center" }}>
              You'll be redirected to payment (₹599) after signup
            </p>
          </form>
          <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
