# ProfX — Setup Guide

A complete guide to set up, run, and deploy ProfX — the SaaS profit-tracking app for Flipkart sellers.

---

## 📦 What's Inside

```
profx/
├── backend/              # Node.js + Express + Prisma API
├── frontend/             # React app
├── sample-return-report.csv
└── SETUP_GUIDE.md        # (this file)
```

---

## 🧰 Prerequisites

- **Node.js 18+** and npm
- **PostgreSQL 14+** (local or hosted — Railway works great)
- A **Razorpay** account (test mode is fine for development)
- A **Resend** account for transactional emails (optional but recommended)

---

## 1️⃣ Razorpay Setup

ProfX uses Razorpay for the ₹599/month subscription payment.

### a) Create the account & get API keys

1. Sign up at [https://dashboard.razorpay.com](https://dashboard.razorpay.com)
2. Go to **Settings → API Keys** and click **Generate Test Key**
3. Copy the **Key ID** (starts with `rzp_test_…`) and the **Key Secret**
4. For production, repeat on the live dashboard to get `rzp_live_…` keys

### b) Create a subscription plan (optional)

You only need this if you want to use Razorpay's native recurring subscriptions. The default flow in ProfX charges ₹599 as a one-time order and tracks the period in the database, so this is **not required**.

If you do want native subscriptions:

1. Dashboard → **Subscriptions → Plans → Create Plan**
2. Plan name: `ProfX Starter`
3. Amount: `599` INR, Period: `monthly`
4. Copy the `plan_xxx` ID into `RAZORPAY_PLAN_ID` in your `.env`

### c) Configure the webhook

The webhook lets Razorpay tell your backend when a payment fails or is captured.

1. Dashboard → **Settings → Webhooks → Add New Webhook**
2. **URL:** `https://<your-backend-domain>/api/payment/webhook`
3. **Secret:** generate a strong random string — paste it into both Razorpay and your `RAZORPAY_WEBHOOK_SECRET` env var
4. **Events to subscribe to:** at minimum
   - `payment.captured`
   - `payment.failed`
5. Save.

> The backend validates the `x-razorpay-signature` header on every webhook call. Requests that don't validate are rejected.

---

## 2️⃣ Resend Setup (Email)

Resend powers the welcome email, payment receipt, and payment-failed notifications.

1. Sign up at [https://resend.com](https://resend.com)
2. **Domains → Add Domain** — add `profx.in` (or your domain)
3. Add the DNS records Resend gives you (SPF, DKIM, optionally DMARC) to your DNS provider
4. Wait for verification (usually 5–30 minutes)
5. Once verified, you can send from `noreply@profx.in`
6. **API Keys → Create API Key** — copy and paste into `RESEND_API_KEY`

> If `RESEND_API_KEY` is missing or empty, emails are silently skipped — the app still works fine for development.

---

## 3️⃣ Local Development

### Backend

```bash
cd backend
npm install
cp .env .env.local   # or just edit .env directly
```

Fill in `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/profx
JWT_SECRET=replace-with-a-long-random-string
JWT_EXPIRES_IN=30d
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
ADMIN_EMAIL=pathakakshit17@gmail.com

RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxx
RAZORPAY_PLAN_ID=                       # optional
RAZORPAY_WEBHOOK_SECRET=your-webhook-secret

RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxx   # optional, leave blank to skip emails
FROM_EMAIL=noreply@profx.in
```

Set up the database:

```bash
npx prisma generate
npx prisma db push
```

Start the server:

```bash
npm run dev     # if you have nodemon installed globally
# or
npm start
```

The API will be live at **http://localhost:5000/api**. Visit `/api/health` to verify.

### Frontend

```bash
cd ../frontend
npm install
```

Edit `frontend/.env`:

```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxx
```

Start the dev server:

```bash
npm start
```

The app will open at **http://localhost:3000**.

### First admin login

1. Open `http://localhost:3000/signup`
2. Sign up with `pathakakshit17@gmail.com`
3. You'll be auto-promoted to admin and skip the payment step
4. After login you'll land on `/admin`

---

## 4️⃣ Production Deployment

### Backend → Railway

1. Push the repo to GitHub
2. Go to [https://railway.app](https://railway.app) → **New Project → Deploy from GitHub**
3. Select the repo, set the **root directory** to `backend/`
4. Add a **PostgreSQL** plugin to the project — Railway auto-injects `DATABASE_URL`
5. In the service **Variables** tab, add every env var from the local `.env` **except** `DATABASE_URL` (it's already injected)
6. Set `NODE_ENV=production` and `FRONTEND_URL=https://<your-vercel-domain>`
7. Railway runs `npm install`, then `npm run build`, then `npm start` — these are defined in `package.json`:
   - `build`: `npx prisma generate && npx prisma db push --accept-data-loss`
   - `start`: `node server.js`
8. The service listens on `process.env.PORT` (Railway sets this automatically) and binds to `0.0.0.0` — no manual config needed
9. Once deployed, copy the Railway public URL (e.g. `https://profx-api.up.railway.app`) — you'll plug it into Vercel next

> **Do not** add a `nixpacks.toml` — Railway's default Node builder works perfectly with the `build` and `start` scripts in `package.json`.

### Frontend → Vercel

1. [https://vercel.com](https://vercel.com) → **Add New Project → Import Git Repository**
2. Set the **Root Directory** to `frontend/`
3. Framework Preset: **Create React App** (auto-detected)
4. **Environment Variables:**

   ```
   REACT_APP_API_URL=https://<your-railway-domain>/api
   REACT_APP_RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxx
   ```

5. Deploy. Vercel gives you a URL like `https://profx.vercel.app`
6. Go back to Railway and update `FRONTEND_URL` to that Vercel URL

### Update Razorpay webhook URL

After Railway gives you the production URL, go back to the Razorpay dashboard and update the webhook URL to:

```
https://<your-railway-domain>/api/payment/webhook
```

---

## 5️⃣ Admin Panel Usage

The admin panel lives at `/admin` and is only accessible to the user whose email matches `ADMIN_EMAIL`.

### Dashboard stats
- **Total Sellers** — every signup
- **Active** — sellers with active subscription
- **Pending Payment** — signed up but not paid
- **Expired** — subscription period ended
- **Monthly Revenue** — sum of active subscriptions in the last 30 days, in ₹
- **Last 30 Days** — signups in the last 30 days

### Manual UPI activation

If a seller pays you directly via UPI instead of Razorpay:

1. Open `/admin`
2. Find the seller in the table (use search)
3. Click **Activate** in the actions column
4. Pick the duration: **1, 2, 3, 6, or 12 months**
5. Click **Activate for N month(s)** — done

This sets:
- `user.isActive = true`
- `subscription.status = "active"`
- `subscription.currentPeriodStart = now`
- `subscription.currentPeriodEnd = now + N months`

The seller will be able to log in immediately and use the app for that period.

### Deactivate

Click **Deactivate** in the seller's row. The seller is locked out and gets a notification email. They can re-activate by paying again.

### Delete

The 🗑 icon permanently removes the seller along with all their orders, SKUs, and subscription data. **This cannot be undone.** The admin account itself cannot be deleted.

---

## 6️⃣ Report Formats (for sellers)

### Pickup Report (CSV)
Required columns (case-sensitive header names):
- `ORDER ITEM ID` — the join key
- `Order Id`
- `SKU`
- `Dispatch by date`
- `Tracking ID`

All other columns are ignored.

### Settlement Report (Flipkart Excel)
- The file must contain a sheet named **`Orders`**
- Rows 0 and 1 are headers (skipped automatically)
- Data starts at row 2
- Column positions used: col 1 = Payment Date, col 2 = Bank Settlement Value (₹), col 6 = Order ID, col 7 = Order item ID (the join key)

### Return Report (CSV or Excel)
A single column of tracking IDs. The column can be named:
- `Tracking ID`
- `TrackingID`
- `tracking_id`
- …or the first column is used as fallback

See `sample-return-report.csv` in the repo root for a working example.

---

## 7️⃣ How the Matching Works

1. Seller uploads **Pickup Report** → rows go into `Order` table keyed on `orderItemId`, with `hasPickup = true` and `trackingId` stored
2. Seller uploads **Settlement Report** → rows match on `orderItemId`, set `hasSettlement = true`, `bankSettlement`, `paymentDate`
3. When both pickup and settlement exist for an order, `isMatched = true` and:
   ```
   profit = bankSettlement − SKU.purchasePrice
   ```
4. Seller uploads **Return Report** → orders matching the tracking IDs get `isReturned = true`, `profit = 0`, `returnDate = now`. Returned orders are excluded from dashboard totals.
5. When a seller adds or edits a **SKU purchase price**, profits for all matched orders with that SKU are immediately recalculated.

---

## 8️⃣ Troubleshooting

**Prisma can't connect / SSL errors on Railway**
Append `?sslmode=require` to your `DATABASE_URL` if Railway requires it.

**Razorpay checkout doesn't open**
Make sure `<script src="https://checkout.razorpay.com/v1/checkout.js"></script>` is the last tag inside `<body>` in `frontend/public/index.html`. Verify `REACT_APP_RAZORPAY_KEY_ID` is set.

**Welcome / receipt emails aren't sending**
Confirm the Resend domain is verified and `RESEND_API_KEY` + `FROM_EMAIL` are set on Railway. Check Railway logs for "Resend error" lines. If `RESEND_API_KEY` is missing, emails are silently skipped — this is intentional.

**"Payment required" loop in the frontend**
Either the seller's subscription has expired (check `/admin`) or `isActive` is `false`. As admin, activate the seller manually for the desired duration.

**Frontend can't reach the API in production**
Confirm `REACT_APP_API_URL` on Vercel points to the Railway URL **including `/api`** at the end. Check CORS — `server.js` already allows all origins by default; restrict in production if needed.

**Prisma engine errors on Railway ("binary not found")**
The schema already includes the required `binaryTargets`: `["native", "linux-musl-openssl-3.0.x", "debian-openssl-3.0.x"]`. If you change the schema, regenerate with `npx prisma generate`.

---

## 9️⃣ License

Proprietary — © ProfX. Not for redistribution.
