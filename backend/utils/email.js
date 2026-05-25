const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.FROM_EMAIL || 'noreply@profx.in';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'pathakakshit17@gmail.com';

const baseTemplate = (title, body) => `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
        <tr><td style="background:linear-gradient(135deg,#2563eb 0%,#059669 100%);padding:28px 32px;color:#fff;">
          <div style="display:inline-block;background:rgba(255,255,255,0.18);padding:8px 14px;border-radius:10px;font-weight:700;letter-spacing:1px;">PX</div>
          <h1 style="margin:14px 0 4px;font-size:22px;font-weight:700;color:#fff;">ProfX</h1>
          <p style="margin:0;font-size:13px;opacity:0.9;color:#fff;">Know exactly how much you earned today</p>
        </td></tr>
        <tr><td style="padding:32px;font-size:15px;line-height:1.6;color:#0f172a;">
          ${body}
        </td></tr>
        <tr><td style="padding:18px 32px;background:#f8fafc;color:#64748b;font-size:12px;text-align:center;">
          &copy; ${new Date().getFullYear()} ProfX. All rights reserved.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

async function sendEmail({ to, subject, html }) {
  if (!resend) {
    console.log('[email skipped — no RESEND_API_KEY]', to, subject);
    return null;
  }
  try {
    const res = await resend.emails.send({ from: FROM, to, subject, html });
    return res;
  } catch (err) {
    console.error('Resend error:', err.message || err);
    return null;
  }
}

async function sendWelcomeEmail(user) {
  const body = `
    <h2 style="margin:0 0 12px;font-size:20px;">Welcome to ProfX, ${user.name || 'Seller'}! 👋</h2>
    <p>Your account is now active. You can start uploading your Flipkart pickup and settlement reports right away.</p>
    <p><a href="${process.env.FRONTEND_URL}/app" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Open Dashboard →</a></p>
    <p style="margin-top:24px;color:#64748b;font-size:13px;">Need help? Reply to this email anytime.</p>
  `;
  return sendEmail({ to: user.email, subject: 'Welcome to ProfX 🎉', html: baseTemplate('Welcome', body) });
}

async function sendPaymentReceipt(user, payment) {
  const amount = (payment.amount / 100).toFixed(2);
  const nextBilling = payment.nextBilling ? new Date(payment.nextBilling).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
  const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const body = `
    <h2 style="margin:0 0 12px;font-size:20px;">Payment Receipt</h2>
    <p>Thank you for your payment, ${user.name || 'Seller'}!</p>
    <table cellpadding="8" style="width:100%;border-collapse:collapse;margin:18px 0;background:#f8fafc;border-radius:10px;">
      <tr><td style="color:#64748b;">Amount paid</td><td style="text-align:right;font-weight:600;">₹${amount}</td></tr>
      <tr><td style="color:#64748b;">Plan</td><td style="text-align:right;font-weight:600;">ProfX Starter</td></tr>
      <tr><td style="color:#64748b;">Payment date</td><td style="text-align:right;font-weight:600;">${date}</td></tr>
      <tr><td style="color:#64748b;">Payment ID</td><td style="text-align:right;font-family:monospace;font-size:12px;">${payment.paymentId || '-'}</td></tr>
      <tr><td style="color:#64748b;">Next billing</td><td style="text-align:right;font-weight:600;">${nextBilling}</td></tr>
    </table>
    <p style="color:#64748b;font-size:13px;">This is a system-generated receipt.</p>
  `;
  return sendEmail({ to: user.email, subject: 'Payment Receipt — ProfX', html: baseTemplate('Receipt', body) });
}

async function sendPaymentFailedEmail(user) {
  const body = `
    <h2 style="margin:0 0 12px;font-size:20px;color:#dc2626;">Payment failed</h2>
    <p>Hi ${user.name || 'Seller'}, your recent payment for ProfX could not be processed.</p>
    <p>Please retry by clicking below:</p>
    <p><a href="${process.env.FRONTEND_URL}/payment" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Retry Payment →</a></p>
  `;
  return sendEmail({ to: user.email, subject: 'Payment failed — ProfX', html: baseTemplate('Payment failed', body) });
}

async function notifyAdminNewSeller(user) {
  const body = `
    <h2 style="margin:0 0 12px;font-size:20px;">New seller signed up & paid 🎉</h2>
    <table cellpadding="8" style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:10px;">
      <tr><td style="color:#64748b;">Name</td><td style="text-align:right;font-weight:600;">${user.name || '-'}</td></tr>
      <tr><td style="color:#64748b;">Email</td><td style="text-align:right;font-weight:600;">${user.email}</td></tr>
      <tr><td style="color:#64748b;">Phone</td><td style="text-align:right;font-weight:600;">${user.phone || '-'}</td></tr>
    </table>
  `;
  return sendEmail({ to: ADMIN_EMAIL, subject: '[ProfX] New paid seller', html: baseTemplate('New seller', body) });
}

async function sendDeactivationEmail(user) {
  const body = `
    <h2 style="margin:0 0 12px;font-size:20px;">Your ProfX account has been deactivated</h2>
    <p>Hi ${user.name || 'Seller'}, your ProfX account has been deactivated by the admin.</p>
    <p>If you believe this is a mistake, please contact ${ADMIN_EMAIL}.</p>
  `;
  return sendEmail({ to: user.email, subject: 'Account deactivated — ProfX', html: baseTemplate('Deactivated', body) });
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPaymentReceipt,
  sendPaymentFailedEmail,
  notifyAdminNewSeller,
  sendDeactivationEmail,
};
