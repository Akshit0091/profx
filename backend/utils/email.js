// utils/email.js - Send emails via Resend (free tier: 3000/month)

const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.FROM_EMAIL || "noreply@profx.in";
const APP_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// ─── Welcome email after payment ─────────────────────────────────────────────
async function sendWelcomeEmail(email, name) {
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: "Welcome to ProfX! Your account is active 🎉",
      html: `
        <div style="font-family: DM Sans, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #f8faff; border-radius: 16px;">
          <div style="background: linear-gradient(135deg, #2563eb, #059669); padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
            <h1 style="color: white; font-size: 28px; margin: 0; font-weight: 800;">ProfX</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Flipkart Profit Tracker</p>
          </div>

          <h2 style="color: #0f172a; font-size: 20px;">Welcome${name ? `, ${name}` : ""}! 🎉</h2>
          <p style="color: #475569; line-height: 1.6;">Your ProfX account is now <strong style="color: #059669;">active</strong>. You can now start tracking your Flipkart order profits.</p>

          <div style="background: white; border: 1px solid #e2e8f4; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #0f172a; margin: 0 0 12px; font-size: 15px;">Get started in 3 steps:</h3>
            <p style="margin: 8px 0; color: #475569; font-size: 14px;">1️⃣ Go to <strong>SKU Pricing</strong> → Add your purchase prices</p>
            <p style="margin: 8px 0; color: #475569; font-size: 14px;">2️⃣ Go to <strong>Upload Reports</strong> → Upload Pickup CSV + Settlement Excel</p>
            <p style="margin: 8px 0; color: #475569; font-size: 14px;">3️⃣ View your <strong>Dashboard</strong> → See exact profit per order</p>
          </div>

          <div style="text-align: center; margin: 24px 0;">
            <a href="${APP_URL}" style="background: #2563eb; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block;">
              Open ProfX Dashboard →
            </a>
          </div>

          <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 24px;">
            Questions? Reply to this email. We'll help you get set up.<br/>
            ProfX · Flipkart Profit Tracker
          </p>
        </div>
      `,
    });
    console.log("Welcome email sent to:", email);
  } catch (err) {
    console.error("Email error:", err.message);
  }
}

// ─── Payment receipt email ────────────────────────────────────────────────────
async function sendPaymentReceiptEmail(email, name, amount, paymentId) {
  try {
    const date = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    const nextDate = new Date();
    nextDate.setMonth(nextDate.getMonth() + 1);
    const nextBilling = nextDate.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `ProfX - Payment Receipt ₹${amount/100} ✅`,
      html: `
        <div style="font-family: DM Sans, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #f8faff; border-radius: 16px;">
          <div style="background: linear-gradient(135deg, #2563eb, #059669); padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
            <h1 style="color: white; font-size: 28px; margin: 0; font-weight: 800;">ProfX</h1>
          </div>

          <h2 style="color: #059669;">Payment Successful ✅</h2>
          <p style="color: #475569;">Hi${name ? ` ${name}` : ""}, your payment has been received successfully.</p>

          <div style="background: white; border: 1px solid #e2e8f4; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; color: #475569; font-size: 14px;">Amount Paid</td>
                <td style="padding: 10px 0; font-weight: 700; color: #0f172a; text-align: right;">₹${amount/100}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; color: #475569; font-size: 14px;">Plan</td>
                <td style="padding: 10px 0; font-weight: 600; color: #0f172a; text-align: right;">ProfX Starter</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; color: #475569; font-size: 14px;">Payment Date</td>
                <td style="padding: 10px 0; color: #0f172a; text-align: right;">${date}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; color: #475569; font-size: 14px;">Next Billing</td>
                <td style="padding: 10px 0; color: #0f172a; text-align: right;">${nextBilling}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #475569; font-size: 13px;">Payment ID</td>
                <td style="padding: 10px 0; color: #94a3b8; font-size: 12px; text-align: right; font-family: monospace;">${paymentId}</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin: 24px 0;">
            <a href="${APP_URL}" style="background: #2563eb; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px;">
              Go to Dashboard →
            </a>
          </div>

          <p style="color: #94a3b8; font-size: 12px; text-align: center;">ProfX · Flipkart Profit Tracker</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Receipt email error:", err.message);
  }
}

// ─── Payment failed / renewal reminder ───────────────────────────────────────
async function sendPaymentFailedEmail(email, name) {
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: "ProfX - Action Required: Payment Failed ⚠️",
      html: `
        <div style="font-family: DM Sans, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #f8faff; border-radius: 16px;">
          <div style="background: linear-gradient(135deg, #2563eb, #059669); padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
            <h1 style="color: white; font-size: 28px; margin: 0; font-weight: 800;">ProfX</h1>
          </div>

          <h2 style="color: #dc2626;">Payment Failed ⚠️</h2>
          <p style="color: #475569;">Hi${name ? ` ${name}` : ""}, your monthly payment of <strong>₹599</strong> could not be processed.</p>
          <p style="color: #475569;">Your account has been temporarily suspended. Please renew to continue accessing ProfX.</p>

          <div style="text-align: center; margin: 24px 0;">
            <a href="${APP_URL}/renew" style="background: #dc2626; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px;">
              Renew Subscription →
            </a>
          </div>

          <p style="color: #94a3b8; font-size: 12px; text-align: center;">ProfX · Flipkart Profit Tracker</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Failed email error:", err.message);
  }
}

module.exports = { sendWelcomeEmail, sendPaymentReceiptEmail, sendPaymentFailedEmail };
