# ProfX — Business Setup Guide

## ✅ Step 1 — Razorpay Setup (Do This First)

1. Go to razorpay.com → Sign up
2. Complete KYC (PAN + Bank account)
3. Go to Settings → API Keys → Generate Key
4. Copy: `Key ID` and `Key Secret`
5. Go to Products → Subscriptions → Plans → Create Plan:
   - Name: ProfX Starter
   - Amount: 599
   - Currency: INR
   - Period: Monthly
6. Copy the `Plan ID` (starts with `plan_`)

---

## ✅ Step 2 — Resend Email Setup (Free - 3000 emails/month)

1. Go to resend.com → Sign up with Google
2. Add your domain OR use their test domain
3. Go to API Keys → Create API Key
4. Copy the `re_xxxxxxxx` key

---

## ✅ Step 3 — Update Environment Variables

### backend/.env
```env
DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/profx_db"
JWT_SECRET="profx-secret-key-change-this"
PORT=5000
NODE_ENV=development
FRONTEND_URL="http://localhost:3000"

ADMIN_EMAIL="pathakakshit17@gmail.com"

RAZORPAY_KEY_ID="rzp_live_xxxxxxxxxxxxxxxx"
RAZORPAY_KEY_SECRET="xxxxxxxxxxxxxxxxxxxxxxxx"
RAZORPAY_PLAN_ID="plan_xxxxxxxxxxxxxxxx"

RESEND_API_KEY="re_xxxxxxxxxxxxxxxx"
FROM_EMAIL="noreply@profx.in"
```

### frontend/.env
```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxxxxx
```

---

## ✅ Step 4 — Local Setup

```bash
# Backend
cd backend
npm install
npx prisma generate
npx prisma db push
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm start
```

---

## ✅ Step 5 — How Seller Onboarding Works

1. Seller visits your site → clicks "Get Started"
2. Fills signup form (name, email, password)
3. Redirected to Payment page → pays ₹599 via Razorpay
4. Payment verified → account activated instantly
5. Welcome email sent automatically
6. Seller lands on Dashboard ✅

---

## ✅ Step 6 — Admin Panel (For You)

Visit: `yoursite.com/admin`
Login with: `pathakakshit17@gmail.com`

**What you can do:**
- See all sellers + their payment status
- Activate sellers manually (for UPI payments)
- Deactivate sellers who haven't paid
- View each seller's order count
- See monthly revenue at a glance

**Manual UPI Activation:**
1. Seller pays you ₹599 via UPI
2. You go to Admin Panel
3. Find the seller → click "Activate"
4. Select 1 month → Confirm
5. Seller gets access immediately ✅

---

## ✅ Step 7 — Deploy to Production

### Backend (Railway)
```
Start Command: node server.js
Environment Variables: (same as .env above but with production values)
NODE_ENV: production
FRONTEND_URL: https://profx.vercel.app
```

### Frontend (Vercel)
```
Environment Variables:
REACT_APP_API_URL: https://your-railway-url.up.railway.app/api
REACT_APP_RAZORPAY_KEY_ID: rzp_live_xxxxxxxx
```

---

## 💰 Revenue Tracking

| Sellers | Monthly Revenue | Your Cost | Profit |
|---------|----------------|-----------|--------|
| 5       | ₹2,995         | ₹3,500    | -₹505  |
| 10      | ₹5,990         | ₹3,500    | +₹2,490|
| 20      | ₹11,980        | ₹4,000    | +₹7,980|
| 50      | ₹29,950        | ₹5,000    | +₹24,950|

**Break-even: ~6 sellers**

---

## 📞 Support Email
pathakakshit17@gmail.com
