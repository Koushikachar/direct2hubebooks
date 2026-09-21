# Direct2Hub — Digital Product Landing Page

Next.js (App Router, TypeScript) + PostgreSQL (Prisma, hosted on Supabase) +
Cloudflare R2 file storage. No paid tiers required to run it.

## What's included
- **Nav**: sticky glass nav — logo + brand on the left, **Home / About / Contact / Price**
  links plus a sun/moon **dark-light toggle** on the right. The toggle follows your
  device's clock by default (light 6am–6pm, dark otherwise) and switches
  automatically as the day goes on; click it once to pin a theme manually,
  double-click to go back to automatic. No flash-of-wrong-theme on load.
- **Home page** (`/`): marketing landing page — a vertical showcase video in a
  phone-style player, feature highlights, stats, and a CTA into pricing.
- **About page** (`/about`): the company story, the showcase video again, and a
  **gamified PDF preview** — flip three real pages from the playbook to reveal
  chapter takeaways, then a locked "unlock the full playbook" card links to
  checkout. Only a 3-page teaser is ever shown here; the real file stays
  behind payment + the access-token gate below.
- **Contact page** (`/contact`): a working contact form (`/api/contact`) that
  emails the admin inbox and auto-replies to the sender via Gmail SMTP (see
  Email below), plus phone/WhatsApp/social links pulled from the same
  product content the admin panel edits.
- **Price page** (`/price`): the original product page + sticky order form
  (Name, Email, WhatsApp with country code, **Continue to payment**) and a
  **Terms** link that opens a full terms modal, plus the reviews list.
- **One request per person**: the same email or WhatsApp number can only be
  used once — a repeat attempt is rejected, not silently reissued.
- **On submit**: saved to Postgres, Cashfree order created, then straight to
  a private download page after payment — no manual approval step.
- **`/access/[token]`**: the buyer downloads the PDF first; **right after the
  download** an animated card invites them to join the WhatsApp community
  (group link set in `/admin` → Product Content). The file is never blocked
  behind the group. Each link allows **3 downloads total**; the 4th
  attempt is blocked with a clear message. The counter update is atomic, so
  a burst of simultaneous clicks can't sneak past the limit. Nothing is
  downloadable without a paid submission — this is the "no one gets in
  without filling the form" gate.
- **Customer reviews**: 33 seeded reviews (average **4.7**⭐) shown at the
  bottom of the pricing page, with a rating breakdown bar chart. Anyone can
  write a review; JSON-LD `AggregateRating` is included for SEO.
  - A reviewer can **edit or delete their own review** later from the same
    browser. A private edit token is issued once, as an **httpOnly,
    SameSite=Strict cookie** scoped to `/api/reviews` — page JavaScript (and
    so any injected script) can never read it, and nothing is kept in
    `localStorage`. `GET /api/reviews/mine` tells the page which reviews the
    cookie proves ownership of.
  - **Admins can edit or delete any review** (including the seeded ones)
    from `/admin`.
- **`/admin`**: cookie-session-protected (no password kept in localStorage —
  a refresh doesn't log you out, and a **Log out** button in the header
  clears the session and returns you to the homepage), four tabs:
  - **Analytics** — revenue, sales, unique visitors, and visitor→buyer
    conversion, each scoped to whichever range tab (Day / Week / Month /
    6 Months / Year) is selected, plus all-time totals, submissions,
    submission conversion rate, average rating, and three charts (sales,
    revenue, unique visitors) that share the same range tabs — all built
    with Recharts against `/api/admin/analytics`. Unique visitors are
    counted via an anonymous first-party cookie
    (`components/VisitorTracker.tsx` → `/api/track-visit`), deduplicated
    per browser per day server-side — no IP address or personal data is
    stored, and the admin panel itself is excluded from its own count.
  - **Product Content** — upload the logo, cover image, showcase video, and
    PDF (written straight to Cloudflare R2 — no local disk needed), and
    edit all text content including the new home-page tagline.
  - **Submissions** — paginated table of every form entry, plus a
    **Download as Excel (CSV)** export that streams in batches (safe even
    with millions of rows).
  - **Reviews** — edit or delete any customer review.

## Email (free, via Gmail)
`lib/mailer.ts` sends email through your own Gmail account's SMTP — no paid
email service, no third-party API key. Three kinds of email are wired up:
- **Order confirmation** — sent automatically the moment a payment is
  verified (`lib/paymentFinalize.ts`, reached from the browser check, the webhook
  or the return page), with a styled HTML email and
  a button linking straight to the buyer's private download page.
- **Contact form** — every message from `/contact` emails your inbox
  (`GMAIL_USER`) and auto-replies to the sender.
- **Payment reminders** — see below.

Setup: enable 2-Step Verification on the sending Gmail account, generate an
**App Password** (Google Account → Security → App passwords), and set
`GMAIL_USER` / `GMAIL_APP_PASSWORD` in `.env`. If these aren't set, email
sending is skipped silently — it never blocks a payment or a form submit.

## Payment reminders ("filled the form but didn't pay")
Someone who submits the order form gets a `Submission` row with
`paymentStatus: "pending"` right away, before they've paid anything. If they
never come back to finish checkout, `/api/cron/reminders` emails them **up
to 3 times, and never more**:

| # | Sent after (from form submission) |
|---|---|
| 1 | 10 minutes |
| 2 | 1 hour |
| 3 | 24 hours |

Each email (`paymentReminderEmail` in `lib/mailer.ts`) links back to
`/price` to finish checkout — resubmitting the same email/WhatsApp resumes
the existing pending submission rather than creating a duplicate. The moment
`paymentStatus` flips to `"paid"`, the cron's `where: { paymentStatus:
"pending" }` filter excludes that row from every future run, so a buyer who
pays right after the 10-minute email never gets the 1-hour or 24-hour ones.
`Submission.reminderCount` (capped at 3) and `lastReminderAt` track this per
person; a failed send (e.g. mailer briefly down) leaves the count unbumped
so it's retried on the next run instead of being skipped forever.

**This needs a scheduler to actually run** — the route itself does nothing
on its own:
- **Vercel Hobby (free) plan**: `vercel.json` schedules a once-daily run
  (`0 3 * * *`) as a safety-net catch-all only — Hobby doesn't allow
  crons more often than once a day, so this alone can't deliver the
  10-minute/1-hour/24-hour timing above. For that, add a **free external
  scheduler** on top: sign up at cron-job.org (or use GitHub Actions, or
  your own server's crontab) and have it hit `GET /api/cron/reminders`
  every 5 minutes with header `x-cron-secret: <CRON_SECRET>`. The route's
  atomic per-submission update means it's safe to have both this and the
  daily Vercel cron running — they can never double-send the same email.
- **Vercel Pro plan**: change `vercel.json`'s schedule to `*/5 * * * *`
  and set `CRON_SECRET` in your project's environment variables — Vercel
  signs every cron request with it automatically, no external scheduler
  needed.

Without `CRON_SECRET` set, the route refuses every request — there's no way
to trigger it accidentally or from the outside.

## Adding your video
The showcase video used in the Home and About pages is expected at
`public/videos/showcase.mp4` (poster frame at `public/videos/video-poster.jpg`).
Drop your video file at that path — or upload it from `/admin` → **Product
Content** → **Showcase video**, which stores it in Cloudflare R2 and points
`Product.videoUrl` at it instead. A 300MB+ vertical video works but is heavy
for a lot of visitors; for production, consider compressing it or hosting it
on a CDN/video host (Cloudinary, Mux, Bunny, YouTube unlisted) and pointing
`videoUrl` at that instead of local storage.



## Security
- **Rate limiting** on every public and admin endpoint (`lib/rateLimit.ts`):
  5 form submissions / 10 min / IP, 30 downloads / min / IP, 20 admin
  requests / min / IP, 5 review submissions / hour / IP. Works out of the
  box with zero setup (in-memory); set `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN` (Upstash's free tier) once you run more than
  one server instance, so limits stay consistent across all of them.
- **Admin password is bcrypt-hashed** (`lib/adminAuth.ts`) — only
  `ADMIN_PASSWORD_HASH` (a bcrypt hash) is ever stored, never the plaintext
  password; login compares with `bcrypt.compare`, every attempt is
  rate-limited, and every auth failure returns the same generic
  "Unauthorized" regardless of the reason.
- **Admin sessions are an httpOnly signed cookie**, not localStorage —
  `POST /api/admin/login` verifies the password once, then sets a
  cookie page JavaScript can never read (so nothing to steal via XSS and
  nothing sitting in localStorage), which is what lets a refresh keep you
  logged in without ever persisting the password client-side. It's
  HMAC-signed with `ADMIN_SESSION_SECRET`, expires after 12 hours, and
  `POST /api/admin/logout` clears it (wired to the **Log out** button).
- **Review edit tokens are hashed** (`lib/reviewAuth.ts`) — only a SHA-256
  hash is stored in the database, so editing someone else's review isn't
  possible even with direct database access.
- **Strict upload validation** — server-side MIME-type allow-list and size
  caps (5MB images, 25MB PDF) on `/admin` uploads, with randomized
  filenames so nothing is ever saved using a user-supplied name/path.
- **Security headers** (`next.config.ts`): CSP, HSTS, X-Frame-Options,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- **No SQL injection surface** — every query goes through Prisma's
  parameterized query builder; there's no raw SQL anywhere in the app.
- **Uniqueness enforced at the database level** on email and WhatsApp
  number, so duplicate submissions can't slip through even under
  concurrent requests.
- Input length limits and format checks on every public endpoint to block
  malformed/oversized payloads.
- **Invoices**: every paid order gets a PDF invoice, generated server-side
  on demand (`lib/invoice.ts`) — attached automatically to the order
  confirmation email *and* downloadable anytime from the buyer's access
  page or `/api/invoice/[token]` (rate-limited, requires the paid access
  token; not device-locked so it's reachable from any of the buyer's
  devices). Admins can pull the same PDF for any paid submission from
  **Submissions → PDF** or `/api/admin/invoice/[id]` (admin-auth required).
- **Multi-device access links**: a paid `/access/[token]` link can be
  claimed on up to `MAX_DEVICES` (`lib/tokens.ts`, default 2) distinct
  browsers/devices — e.g. a buyer's phone and laptop — using an atomic
  `array_append` guarded by `cardinality(...) < MAX_DEVICES` so a burst of
  simultaneous opens can never exceed the limit. Once the limit is reached,
  any further device sees "This link is already in use" instead of the
  file, and the same check is enforced again directly on `/api/download`
  so it can't be bypassed by calling the API with just the token.

No app-level codebase can *guarantee* zero downtime at literally any load —
that also depends on your hosting plan's autoscaling and your database's
connection limits. What's built in here is everything within the code's
control: caching, pooling, indexes, pagination, and streaming.

## Built for heavy traffic
- **Cached home page** (`export const revalidate = 60` in `app/page.tsx`).
- **Pooled database connections** — a pooled `DATABASE_URL` (Supabase's
  Supavisor pooler, port 6543) for runtime queries, a separate `DIRECT_URL`
  (port 5432) only for migrations.
- **Indexed lookups** on `email`, `whatsapp`, `accessToken` (unique) and
  `createdAt` (for ordered pagination).
- **Paginated + streamed admin data** — submissions load 50 rows at a time;
  export streams the CSV in 1,000-row batches via cursor pagination.
- **Atomic download-limit check** — a single conditional database update,
  correct even under concurrent requests.

## SEO
- Full metadata (title template, description, keywords, canonical URL,
  Open Graph + Twitter cards) in `app/layout.tsx`.
- `app/robots.ts` and `app/sitemap.ts` generate `/robots.txt` and
  `/sitemap.xml` automatically.
- JSON-LD `Product` + `AggregateRating` structured data on the home page.
- Semantic HTML (single `<h1>`, descriptive `alt` text on every image).

## 1. Install
```bash
npm install
```

## 2. Free Postgres database
Create a free project at [Supabase](https://supabase.com), then grab the
connection strings from Project Settings → Database → Connection string.

```bash
# edit .env: DATABASE_URL (pooled, port 6543), DIRECT_URL (direct, port 5432),
# ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET, NEXT_PUBLIC_SITE_URL
npx prisma db push
npm run db:seed   # loads the 33 starter reviews into the database
```

## 3. Uploads (Supabase Storage)
Logo, cover image, video, and the ebook PDF uploaded from `/admin` are
written to Supabase Storage, not the server's own disk — this works on
any host, including Vercel, since nothing is written to local disk.
Uploads go through Supabase's **S3-compatible API**, so no extra SDK is
needed — the same `@aws-sdk/client-s3` package that talked to R2 talks to
Supabase now.

Get your credentials from Supabase dashboard → Project Settings → Storage
→ **S3 Connection**:
- `SUPABASE_URL` — your project URL, shown on that page (also the same
  project as `DATABASE_URL`).
- `SUPABASE_S3_REGION` — shown on that page, e.g. `us-east-1`.
- `SUPABASE_S3_ACCESS_KEY_ID` / `SUPABASE_S3_SECRET_ACCESS_KEY` — click
  "New access key" on that page. These are S3-protocol credentials,
  different from your anon/service_role API keys.

Two buckets are used. **Create both by hand** in the dashboard (Storage →
New bucket) before first use — unlike R2, a Supabase bucket's
public/private setting can only be chosen when it's created, so there's
no auto-create-on-first-upload step here:
- `SUPABASE_BUCKET` (default `uploads`) — create with **"Public bucket"
  ON**. Logo, hero image, and the showcase video live here, servable at a
  fixed `.../storage/v1/object/public/uploads/...` URL — no separate
  public-URL setting to look up, unlike R2's r2.dev subdomain.
- `SUPABASE_PDF_BUCKET` (default `protected-files`) — create with
  **"Public bucket" OFF**. The paid ebook PDF lives here. There's no
  public URL for it at all — every download goes through `/api/download`,
  which checks that the link's payment succeeded and that it hasn't hit
  its 3-download limit, then streams the file back from the server. This
  is what keeps a paid download link from turning into a permanently
  shareable direct file URL.

## 4. Run locally
```bash
npm run dev
```
Visit `http://localhost:3000`, then `/admin` to upload your real logo,
cover image, and PDF, and to moderate reviews.

## 5. Tunable limits
- Downloads per person: `MAX_DOWNLOADS` in `app/api/download/route.ts`.
- Devices per link: `MAX_DEVICES` in `lib/tokens.ts` (default 2).
- Duplicate rule: the `OR` check in `app/api/submit/route.ts`.
- Rate limits: the `rateLimit(...)` calls throughout `app/api/*`.
- Starter reviews: edit `lib/reviewsData.ts`, then re-run `npm run db:seed`
  on a fresh database (it skips seeding if reviews already exist).

## 6. Deploy
Any Node host with a writable filesystem works. Set the same env vars, plus
a live `NEXT_PUBLIC_SITE_URL`. For multi-instance/high-traffic deployments,
also set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.

## Project structure
```
app/
  layout.tsx, robots.ts, sitemap.ts   SEO + global setup
  page.tsx                             home page (cached, JSON-LD, reviews)
  access/[token]/                      download page (3-download limit)
  admin/                                content + submissions + reviews dashboard
  api/submit/                          rate-limited, blocks duplicates
  api/download/                        rate-limited, atomic limit check
  api/reviews/                          list + create reviews
  api/reviews/[id]/                    edit/delete (owner token or admin)
  api/admin/upload/                    validated local file uploads
  api/admin/submissions/               paginated submissions list
  api/admin/export/                    streamed CSV export
components/
  Header.tsx, ProductDetails.tsx, OrderForm.tsx, TermsModal.tsx,
  DownloadButton.tsx, DownloadFlow.tsx, WhatsAppJoinCard.tsx, Reviews.tsx
lib/
  db.ts             Prisma client
  mailer.ts          Gmail SMTP sender + HTML email templates
  rateLimit.ts       in-memory / Upstash rate limiter
  adminAuth.ts        timing-safe admin auth + rate limiting
  reviewAuth.ts       hashed review edit tokens
  reviews.ts, reviewsData.ts, types.ts, product.ts, pricing.ts
prisma/
  schema.prisma      Product + Submission + Review models
  seed.ts            loads lib/reviewsData.ts into the database
```


## Performance & security notes

- **No `localStorage` / `sessionStorage` anywhere.** Admin session, review edit
  tokens, device claims and the WhatsApp "joined" flag are server-set
  **httpOnly** cookies; the only client-written cookie is the harmless
  light/dark preference (`d2h-theme`).
- **Images**: `next/image` serves AVIF → WebP → original per browser
  (`images.formats`), cached 30 days. Remote images are limited to your
  Supabase public bucket (no open image proxy).
- **Fonts**: Sora 700/800 only + Inter as one variable file, `display: swap`.
- **JavaScript**: Recharts (admin), the review form, the terms modal, the
  "recent purchase" toast and the /about flip-card game are all code-split and
  load only when needed (idle / on click / near viewport).
- **Third-party scripts**: the only one is Cashfree's checkout SDK, loaded on demand
  when a visitor starts paying, with the origin warmed up on form focus.
  Pinned in the CSP; nothing else third-party runs.
- **Caching / CDN**: public assets `max-age=1d, s-maxage=1y, swr=7d`; public
  API GETs `s-maxage=30`; `/admin`, `/api/admin/*`, `/access/*`, downloads are
  `no-store`. Set `CDN_URL` only if you run your own CDN (see `.env.example`).
- **Login brute-force**: `/api/admin/login` allows 5 attempts / 15 min / IP
  (then `429` + `Retry-After`), on top of bcrypt (cost 12). Use a password of
  12+ characters when generating `ADMIN_PASSWORD_HASH`.
- **Never put the paid PDF in `public/`** — everything there is downloadable
  without paying. See `private-assets/README.md`.

## Payments (Cashfree)

Checkout is Cashfree's popup (`redirectTarget: "_modal"`): UPI, cards,
netbanking, wallets. The flow:

1. `POST /api/payment/create-order` — creates a Cashfree order **server-side**
   (amount comes from `lib/pricing.ts`, never from the browser) and returns a
   one-time `paymentSessionId`.
2. The browser opens the popup with that session (`lib/loadCashfreeScript.ts`
   loads Cashfree's SDK only when someone starts paying).
3. `POST /api/payment/verify` — when the popup closes the browser only sends the
   **order id**; the server asks Cashfree whether it is `PAID` and checks
   amount + currency before unlocking anything. All confirmation logic lives in
   `lib/paymentFinalize.ts`.
4. **Safety nets** so a buyer who pays and then closes the tab still gets their
   link: a signed **webhook** (`POST /api/payment/webhook`, attached to every
   order automatically — nothing to set up in the dashboard) and a return page
   (`/payment/return`) for browsers that can't report back to the page. All three
   paths are idempotent; the confirmation email is sent exactly once.

Setup: `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV` (`sandbox` while
testing, `production` when live) — see `.env.example`. **Before going live you
must whitelist your domain in the Cashfree dashboard** or the popup will not
open. Purchases made before the switch keep their Razorpay references (legacy
columns), so old invoices still show them. After pulling this change run
`npx prisma db push` once to add the two new Cashfree columns (nothing is
dropped).

## Security

The full pre-production audit is in **`SECURITY-AUDIT.md`** (findings, evidence,
fixes, checklist). Things you must do yourself, in order:

1. **Rotate every secret** that was ever in a shared `.env` (database password,
   Gmail app password, Upstash token; set a fresh `ADMIN_SESSION_SECRET` of 32+
   characters and a new admin password → new `ADMIN_PASSWORD_HASH`). Real values
   live only in your host's environment settings — never in the repo.
2. Run **`prisma/security.sql`** once in the Supabase SQL editor (turns on Row
   Level Security so the auto-generated REST API can't expose your tables).
3. Confirm the `protected-files` storage bucket is **private**.
4. Set `CRON_SECRET` (reminder emails are rejected without it).
5. Turn on alerts for the JSON `security` log events (see `lib/securityLog.ts`).
6. Run `npm ci && npm audit` after every dependency change.

## Going live with Cashfree — checklist

Cashfree will not let live payments through until each of these is done. None of
them can be done from code, and the domain review takes up to ~24 hours, so start early.

1. **Activate your Cashfree account** (business KYC / bank details) so production keys unlock.
2. **Deploy to your real domain over HTTPS** first — only `https://` sites are accepted.
3. **Whitelist your domain:** Cashfree dashboard → Payment Gateway → Developers → Whitelisting → Add New.
   The reviewer checks that the site has **Contact Us, Terms & Conditions and
   Refunds & Cancellations** pages, lists the product, and shows prices in INR.
   This project now ships `/terms`, `/privacy`, `/refund-policy` and `/contact`, linked from
   the footer of every public page. **Read and edit the wording** (it is a starting template,
   not legal advice — especially the 7-day refund window and "laws of India").
4. **Production keys:** Developers → API Keys (production) → set `CASHFREE_APP_ID`,
   `CASHFREE_SECRET_KEY` and `CASHFREE_ENV=production` in your host's environment settings, then redeploy.
5. **Set `NEXT_PUBLIC_SITE_URL`** to the exact live https domain (used for the return and webhook URLs).
6. **Do one real ₹199 payment yourself**, then confirm: download works, WhatsApp card appears,
   email + invoice arrive, and the payment shows in the Cashfree dashboard. Refund it from the dashboard.
7. **Check the webhook:** in Cashfree → Webhooks the delivery to `/api/payment/webhook` should show HTTP 200.
8. If API calls fail with an *IP not whitelisted* error, ask Cashfree support how to handle hosts
   with dynamic IPs (serverless platforms do not have a fixed IP).
