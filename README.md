# LendBook

A personal lending ledger you install on your phone as an app (PWA). It tracks:

- **Customers and KYC:** contact details, PAN, the last 4 digits of Aadhaar, and photos of their documents.
- **Loans with monthly interest:** interest is calculated automatically every month.
- **Payments:** each payment is split automatically into interest and principal.
- **Ledger:** a passbook for every loan, plus a business-wide cash book you can download as a CSV file for Excel.
- **Agreements:** the app makes the agreement PDF, and the customer gets a link to download it, sign it, and upload it back with their ID proof.
- **Reminders:** sent automatically by WhatsApp and email (before the due date, on the due date, and when overdue), plus payment receipts.

Stack (all free tiers): **Next.js 16** on **Cloudflare Workers**, **Supabase** (Postgres database, login, file storage), **Brevo** (email), and the WhatsApp Cloud API.

---

## How interest works

| Rule | Detail |
|---|---|
| Due date | Every month on the same date as the loan date. A loan given on 31 Jan falls due on 28/29 Feb, then 31 Mar. |
| Monthly interest | Principal at the **start** of that month × rate %. ₹1,00,000 at 2% = ₹2,000. |
| Payment split (automatic) | 1) Unpaid old interest, oldest first → 2) this month's interest in advance → 3) principal. |
| Manual split | Fill in "towards principal" on the payment to override the automatic split. |
| Part principal repaid | Interest goes down from the **next** month. |
| Full repayment mid-month | Pay principal + interest till today. The loan page shows this as **"To close today"**. Interest then stops. |
| Rounding | Interest is rounded to the nearest rupee. |

The rules live in `src/lib/engine.ts` and are covered by tests (`npm test`).

---

## One-time setup (about 45 minutes)

### 1. Supabase (database, login, file storage)

1. Create a free account at https://supabase.com, then create a **New project** (choose region **Mumbai / ap-south-1**).
2. Open **SQL Editor**, paste all of `supabase/migrations/20261017000000_init.sql`, and click **Run**.
3. Go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up". The app creates your owner account itself.
4. Go to **Project Settings → API** and copy the Project URL, the `anon` key and the `service_role` key.

### 2. Run it on your computer (optional)

```bash
cp .env.example .env.local
```

Fill in the Supabase values in `.env.local`, then:

```bash
npm install
npm run dev
```

Open http://localhost:3000. The first screen asks you to **create the owner account**. Only this first account can ever see data.

### 3. Put it online on Cloudflare (free)

The app runs on **Cloudflare Workers** through the OpenNext adapter. Cloudflare builds it from GitHub on every push.

1. Create a free account at https://dash.cloudflare.com.
2. Go to **Workers & Pages → Create → Import a repository**, connect GitHub, and pick the `lendbook` repository.
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx opennextjs-cloudflare deploy`
3. Under **Build variables**, add these. They are baked into the app when it is built:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL`: your app address, e.g. `https://lendbook.<your-subdomain>.workers.dev`
4. Deploy once. Then open the Worker → **Settings → Variables and Secrets** and add, as **Secret**:
   - the same `NEXT_PUBLIC_APP_URL` again (the daily job reads it)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`: any long random string
   - the Brevo and WhatsApp keys from `.env.example` (when you have them)
5. The daily reminder job is already configured in `wrangler.jsonc`. It runs every day at **9:00 AM IST** (03:30 UTC); you can see it under **Settings → Trigger events**.

Free-plan limits: the app bundle is about 1.8 MB (the limit is 3 MB), and there are 100,000 requests a day. If a page ever fails with "Worker exceeded CPU time limit" (the free plan allows 10 ms of CPU per request), upgrade to Workers Paid (US$5 a month). Nothing in the code needs to change.

To deploy from your own computer instead: `npx wrangler login`, then `npm run deploy`. OpenNext recommends running this from WSL on Windows.

### 4. Install on your phone

Open your app's address in Chrome on Android, then tap **⋮ → Add to Home screen / Install app**. On iPhone, open it in Safari and tap **Share → Add to Home Screen**.

### 5. Email (free, Brevo)

1. Create a free account at https://www.brevo.com. The free plan sends 300 emails a day.
2. Go to **Senders, Domains & Dedicated IPs → Senders** and add the email address you want to send from, e.g. your Gmail. Verify it from the email Brevo sends you.
3. Go to **SMTP & API → API Keys** and create a key.
4. Add these as Secrets on the Worker:
   - `BREVO_API_KEY`: the key from step 3
   - `MAIL_FROM_EMAIL`: the address you verified
   - `MAIL_FROM_NAME`: your business name

Email goes out over Brevo's web API rather than SMTP, because Cloudflare Workers can't reliably make SMTP connections.

### 6. WhatsApp automatic messages (small cost)

Uses the **official WhatsApp Cloud API from Meta**. Avoid unofficial "WhatsApp Web" tools: they get numbers banned.

1. Create a Meta Business portfolio at https://business.facebook.com, then go to https://developers.facebook.com, create an App, and add the **WhatsApp** product.
2. Add a phone number to send from. Either:
   - use a separate SIM that is **not** registered on WhatsApp, or
   - use Meta's "coexistence" onboarding to keep using your WhatsApp Business app on the same number.
3. Add a payment method in WhatsApp Manager. Reminder and receipt templates are the "Utility" category, charged per message (roughly ₹0.12–0.15 each; check Meta's current India rate card). 50 customers × about 3 messages a month comes to roughly ₹20–30 a month.
4. In WhatsApp Manager → **Message templates**, create these four **Utility** templates in language **English (en)**:

   | Name | Body |
   |---|---|
   | `lendbook_due_reminder` | `Hello {{1}}, this is a reminder that interest of Rs. {{2}} for your loan {{3}} is due on {{4}}. Please ignore if already paid. - {{5}}` |
   | `lendbook_overdue` | `Hello {{1}}, interest of Rs. {{2}} for your loan {{3}} has been pending since {{4}}. Kindly pay at the earliest. - {{5}}` |
   | `lendbook_payment_received` | `Hello {{1}}, we have received Rs. {{2}} on {{3}} towards your loan {{4}}. Principal outstanding: Rs. {{5}}. Thank you. - {{6}}` |
   | `lendbook_agreement` | `Hello {{1}}, your loan agreement for Rs. {{2}} is ready. Please download it, sign it, and upload the signed copy with your ID proof here: {{3}} - {{4}}` |

   You can also make Tamil versions under the same names with language `ta`, then set `WA_TEMPLATE_LANG=ta`.
5. Create a **System User** in Business Settings with a **permanent token** that has the `whatsapp_business_messaging` permission. Put it in `WHATSAPP_TOKEN`, and the phone number ID in `WHATSAPP_PHONE_NUMBER_ID`.
6. In the app, go to **Settings** and tick **Automatic WhatsApp**.

**Until WhatsApp is set up:** every reminder has a green **WhatsApp** button. It opens WhatsApp with the message already typed, and you just press send. This costs nothing.

---

## Daily use

| Task | Where |
|---|---|
| New customer + KYC photos | Customers → Add customer → upload documents (the camera opens on a phone) |
| Give a loan | **+ New loan** → the agreement link goes out automatically |
| Customer signs | They open the link → download → sign → upload photos + ID. You get a banner on the Dashboard; open the loan → **Verify** |
| Money received | Open the loan → **Record payment** → a receipt goes to the customer |
| Who hasn't paid? | Dashboard → Overdue, or Loans → Overdue filter |
| Monthly accounts | Ledger → pick a month → **Download Excel (CSV)** |
| Reminders | Run automatically every morning. Reminders → "Send today's reminders now" to run them by hand |

## Backups

- Download **Ledger → All time → CSV** once a month and keep it in Google Drive.
- Supabase's free plan does not include automatic backups. You can also run `pg_dump` with the database connection string under Supabase → Connect.

## Free-tier limits

| Service | Limit |
|---|---|
| Supabase | 500 MB database (enough for many thousands of loans) and 1 GB files. Photos are shrunk on the phone to about 400 KB before uploading, so 1 GB holds roughly 2,000 documents. Projects pause after 7 days with no activity; the daily reminder job keeps yours awake. |
| Cloudflare Workers | 100,000 requests a day and 10 ms of CPU per request on the free plan. |

## Privacy and legal notes

- Store only the **last 4 digits of Aadhaar**, and use **masked** Aadhaar copies. Files are private and open only through short-lived links for your owner account.
- The customer link asks for consent before they upload their ID, as the DPDP Act 2023 expects.
- The agreement PDF says it should be executed on stamp paper / e-stamp of the right value. Ask a local lawyer to review the terms once (Settings → Agreement terms).

## Project layout

```
supabase/migrations/   database tables, security rules (RLS), storage buckets, audit log
src/lib/engine.ts      interest and payment-split calculations (tested)
src/lib/notify.ts      WhatsApp Cloud API + email sending, message log
src/lib/reminders.ts   which reminders go out each day
src/lib/agreement-pdf.ts  agreement PDF
src/app/(app)/         owner screens: dashboard, customers, loans, ledger, reminders, settings
src/app/a/[token]/     public page where the customer downloads, signs and uploads
src/app/api/cron/daily daily reminder job (run by the cron in wrangler.jsonc, via custom-worker.ts)
```
