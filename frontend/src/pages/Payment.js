// pages/Payment.js - Razorpay Checkout
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import "./Payment.css";

export default function Payment() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // If already active, redirect to app
  if (user?.isActive || user?.isAdmin) {
    navigate("/app");
    return null;
  }

  // If not logged in, redirect to signup
  if (!user) {
    navigate("/signup");
    return null;
  }

  const handlePayment = async () => {
    setLoading(true);
    try {
      // Step 1: Create order on backend
      const orderRes = await api.post("/payment/create-order");
      const { orderId, amount, currency, key, prefill } = orderRes.data;

      // Step 2: Open Razorpay checkout
      const options = {
        key,
        amount,
        currency,
        name: "ProfX",
        description: "ProfX Starter Plan - ₹599/month",
        order_id: orderId,
        prefill,
        theme: { color: "#2563eb" },
        handler: async function (response) {
          // Step 3: Verify payment on backend
          try {
            await api.post("/payment/verify", {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            // Update user state
            updateUser({ isActive: true });
            toast.success("Payment successful! Welcome to ProfX 🎉");
            navigate("/app");
          } catch (err) {
            toast.error("Payment verification failed. Contact support.");
          }
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
            toast.error("Payment cancelled");
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to initiate payment");
      setLoading(false);
    }
  };

  return (
    <div className="payment-page">
      <div className="payment-card fade-in">
        {/* Header */}
        <div className="payment-header">
          <Link to="/" className="payment-logo">
            <div className="payment-logo-box">PX</div>
            <span>ProfX</span>
          </Link>
        </div>

        {/* Plan details */}
        <div className="payment-plan">
          <div className="plan-icon">📊</div>
          <div className="plan-name">ProfX Starter Plan</div>
          <div className="plan-price">
            <span className="plan-rupee">₹</span>
            <span className="plan-amount">599</span>
            <span className="plan-per">/month</span>
          </div>
          <div className="plan-desc">Billed monthly · Cancel anytime</div>
        </div>

        {/* What's included */}
        <div className="plan-includes">
          <div className="includes-title">What's included:</div>
          {[
            "Unlimited order uploads",
            "Pickup + Settlement auto-matching",
            "Real-time profit dashboard",
            "SKU price management",
            "Export reports as Excel",
          ].map((f, i) => (
            <div key={i} className="include-row">
              <span className="include-check">✓</span>
              <span>{f}</span>
            </div>
          ))}
        </div>

        {/* Account info */}
        <div className="payment-account">
          <div className="account-label">Signing up as</div>
          <div className="account-email">{user?.email}</div>
        </div>

        {/* Pay button */}
        <button
          className="pay-btn"
          onClick={handlePayment}
          disabled={loading}
        >
          {loading ? (
            <><span className="spinner" style={{ borderTopColor: "white" }} /> Processing...</>
          ) : (
            "Pay ₹599 & Activate Account →"
          )}
        </button>

        <div className="payment-security">
          🔒 Secured by Razorpay · UPI, Cards, Net Banking accepted
        </div>

        <div className="payment-footer">
          Wrong account? <Link to="/login">Sign in with different email</Link>
        </div>
      </div>
    </div>
  );
}
