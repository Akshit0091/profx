// pages/Login.js
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import "./Auth.css";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast.error("Please fill all fields");
    setLoading(true);
    try {
      const res = await api.post("/auth/login", form);
      login(res.data.token, res.data.user);
      const u = res.data.user;
      if (u.isAdmin) { navigate("/admin"); return; }
      if (!u.isActive) { navigate("/payment"); return; }
      navigate("/app");
      toast.success("Welcome back!");
    } catch (err) {
      toast.error(err.response?.data?.message || "Login failed");
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
            <div className="auth-brand-tag">Track every rupee.<br />Know your real profit.</div>
          </div>
          <div className="auth-features">
            {["Real-time profit dashboard", "Auto-match pickup & settlement", "Upload Flipkart reports instantly", "Export profit reports as CSV"].map((f, i) => (
              <div key={i} className="auth-feature">
                <div className="auth-feature-check">✓</div>
                <div className="auth-feature-text">{f}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="auth-right">
          <h1 className="auth-title">Welcome back 👋</h1>
          <p className="auth-sub">Sign in to your ProfX account</p>
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="field">
              <label>Email address</label>
              <input type="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoFocus />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" placeholder="Enter your password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <button type="submit" className="btn-primary auth-btn" disabled={loading}>
              {loading ? <span className="spinner" /> : "Sign In →"}
            </button>
          </form>
          <p className="auth-switch">New here? <Link to="/signup">Create an account</Link></p>
        </div>
      </div>
    </div>
  );
}
