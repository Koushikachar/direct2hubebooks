# What changed

## 15. Policy pages for Cashfree's domain review

Cashfree only whitelists a domain (required for live payments) after checking that
the site has Contact Us, Terms & Conditions and Refunds & Cancellations pages. The
project had only a Terms *popup*. Added `/terms`, `/privacy` and `/refund-policy`
(shared `components/PolicyPage.tsx`, wording in the pages), a `SiteFooter` with the
legal links on every public page, sitemap entries, and a Refund Policy link next to
the Terms link at checkout. The wording follows what the app really does (Cashfree
payments, 2 devices / 3 downloads, cookies, reminder emails, service providers) but
is a **template to review** — the 7-day refund window and "laws of India" are
defaults you may want to change. `README.md` has the go-live checklist.

## 14. Security audit + fixes, and skeleton loading

Full write-up: **`SECURITY-AUDIT.md`**. Fixed in code (58 automated security
checks, 24 checkout-UI checks, production build all pass):

- **Payment token disclosure (my flaw in the Cashfree migration):** an order id
  — printed on the invoice — was enough to be handed the buyer's download token.
  Now needs a signed httpOnly proof cookie from the browser that started the
  payment *and* the order that actually settled the purchase
  (`lib/paymentProof.ts`). Other browsers see "Payment received — check your
  email".
- **Admin login lockout bypass:** the raw password was accepted in an
  `x-admin-secret` header on every admin route. Removed: session cookie only.
  `ADMIN_SESSION_SECRET` (32+ chars) is now mandatory (no fallback to the
  password hash); sessions are bound to the current password (changing it logs
  everyone out); 8-hour lifetime.
- **PII disclosure:** `/api/submit` and `/api/payment/create-order` no longer echo
  stored name/email/phone.
- **Dependencies:** next 15.5.25, nodemailer 10, sharp 0.35.4, postcss 8.5.28,
  unused `uuid` removed → `npm audit` 0 vulnerabilities (was 1 critical, 3 high).
- **CSV formula injection** in the admin export; **admin content validation**
  (https-only links, allow-listed media hosts, safe storage keys, length caps);
  **SSRF guard** for the invoice logo fetch; storage-key traversal guard; upload
  extensions derived from the vetted content type.
- **Abuse limits:** site-wide caps on submit/contact, per-recipient cap on
  contact auto-replies; dial-code validation; CR/LF stripped from names.
- **Download API** now always requires the device-claim cookie.
- **Visitor tracking:** safe cookie parsing, UUID-only ids, path allow-list.
- **Security logging:** `lib/securityLog.ts` (JSON events, never secrets).
- **Headers:** HSTS without `preload`; payment pages `no-store`.
- **`prisma/security.sql`:** Row Level Security lockdown script (run it once —
  not executed automatically).

**Skeleton loading:** `components/Skeleton.tsx` + shimmer CSS, and `loading.tsx`
screens for home, price, about, contact, access page, payment return and admin
(each mirrors the real layout, announces "Loading…" to screen readers, honours
reduced motion). Admin analytics/submissions/reviews, "Load more reviews", the
lazy review form, charts and the About game also show skeletons.

## 13. Payment gateway: Razorpay → Cashfree

Razorpay is fully replaced. `razorpay` (and the 24 packages it dragged in) is
removed from `package.json`; Cashfree is called over its REST API with `fetch`,
so there is **no new dependency**.

- **Server:** `lib/cashfree.ts` (create order, read back order/payments, webhook
  signature check), `lib/paymentFinalize.ts` (the single place a purchase is
  marked paid), `app/api/payment/create-order`, `.../verify`, new
  `.../webhook`, new `/payment/return` page.
- **Client:** `OrderForm` opens Cashfree's popup; `lib/loadCashfreeScript.ts`
  replaces the Razorpay loader (still loaded only on demand, connection warmed on
  form focus).
- **Trust model:** the browser only ever reports *which order* to check. The
  server asks Cashfree with the secret key and requires `PAID`, INR and exactly
  ₹199 before unlocking. Previously a client-side HMAC was the only proof.
- **Robustness added (Razorpay flow had none of this):** a signed webhook and a
  return page complete the purchase even if the buyer closes the tab or is in an
  in-app browser; every payment attempt gets its own order id with the purchase
  embedded in it, so paying an *earlier* attempt still unlocks the right
  purchase; the paid flag is set with a conditional update, so webhook + browser
  arriving together send **one** email; expired sessions are refreshed
  automatically; UPI payments that confirm a few seconds late are polled for.
- **Invoices:** work exactly as before — emailed as a PDF attachment the moment
  a payment is confirmed, linked from the email, downloadable from the buyer's
  access page and from the admin panel. New: a "Payment details" block with
  *Paid via Cashfree*, the Cashfree payment id and order id (long ids no longer
  get cut off in the table). Purchases made with Razorpay keep their invoices,
  labelled *Razorpay*. The invoice is generated (and attached) after the response
  is sent, so the buyer never waits on it.
- **Logo on the invoice:** the Direct2hub logo is now in the invoice PDF —
  large in the orange header and small in the footer. It is bundled with the
  app (`lib/brandLogo.ts`, base64), so it can never go missing or depend on a
  network fetch. If an admin uploads their own PNG/JPEG logo (Product Content)
  the header uses that instead; the "D2H" placeholder circle, WebP logos
  (PDFs can't embed them here) and unreachable logos all fall back to the
  built-in Direct2hub logo.
- **CSP:** Razorpay hosts replaced by `sdk.cashfree.com` (script) and
  `*.cashfree.com` (frame/connect/form).
- **Database:** two new nullable columns, `cashfreeOrderId` / `cashfreePaymentId`.
  The Razorpay columns are kept as *legacy* so old purchases and their invoices
  are untouched. Run `npx prisma db push` once (adds columns, drops nothing).
- **Env:** `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV`
  (`sandbox` default → `production`). The old `RAZORPAY_*` lines in `.env` are
  commented out and unused.
- **Go-live checklist:** finish Cashfree KYC, generate *production* keys,
  **whitelist your domain** in the dashboard (popup won't open otherwise), set
  `CASHFREE_ENV=production`.

## 12. Download first, then join WhatsApp (animated)

The order on `/access/[token]` is reversed. Before: join the WhatsApp group →
unlock the download. Now: **download the PDF first → then the WhatsApp invite
appears** — the file is never blocked behind the group.

- `DownloadButton` turns into a green animated **Downloaded ✓** confirmation
  the moment the PDF is received, then reveals the next step.
- New `components/DownloadFlow.tsx` runs the two steps; new
  `components/WhatsAppJoinCard.tsx` (replaces `WhatsAppGate.tsx`) is the invite:
  slide-up card with a flowing green/orange gradient border, WhatsApp badge with
  sonar ripples, perk chips ("Launch updates / Bonus resources / Direct
  support") that pop in one by one, a green **Join the WhatsApp group** button
  with a light sweep, and **I've joined the group**, which draws a check mark,
  fires a confetti burst and switches the card to "You're in the community!".
- Returning buyers: if the file was already downloaded (server-known from
  `downloadCount`), the invite is shown on load; if they already confirmed
  joining (the existing httpOnly cookie), they see the compact "You're in"
  state instead. Before the first download a one-line teaser hints at the next
  step. If no group URL is set in the admin, the WhatsApp step is skipped.
- Animations live in `app/globals.css` (`wa-*`), are pure CSS (no new
  dependency), and are disabled under `prefers-reduced-motion`.
- After the 3rd (last) download the limit message still replaces the button,
  but the invite stays visible.

## 11. No localStorage, faster loads, security pass (login/auth checklist)

**Bug fix that breaks `next build`:** `app/api/download/route.ts` returned
`new NextResponse(buffer, …)`. With the installed `@types/node`, a Node
`Buffer` isn't a valid `BodyInit`, so type-checking (and therefore
`next build`) failed with *"Buffer is not assignable to BodyInit"*. The body is
now `new Uint8Array(buffer)`. Also: if fetching the file from storage fails,
the download that was just counted is given back instead of burning one of
the buyer's 3 downloads.

**Real hole closed — the paid ebook was publicly downloadable.**
`public/uploads/the-ecommerce-playbook.pdf` was served by Next as a static
file: anyone could fetch it at `/uploads/the-ecommerce-playbook.pdf` with no
payment, no device claim and no download limit. Moved to `private-assets/`
(not served). The protected copy belongs in the private Supabase bucket via
`/admin` → Product Content.

**localStorage removed completely** (it was used in 3 places):
- *Review edit tokens* → httpOnly, Secure, SameSite=Strict cookie scoped to
  `/api/reviews`. The token is no longer in the JSON response or the request
  body. New `GET /api/reviews/mine` returns just the ids the cookie proves
  ownership of (never a token). Admins can now also delete/edit reviews with
  their session cookie (previously header-only).
- *WhatsApp "I've joined" flag* → httpOnly cookie set by new
  `POST /api/access/joined` (paid token required) and read on the server, so
  the gate renders in the right state on first paint (no skeleton flash).
- *Theme* → plain first-party cookie `d2h-theme`, read by the same no-flash
  inline script (verified by test).

**Login-screen checklist, applied to this app** (admin password is the only
login — there are no user accounts): (1) tokens in localStorage → done, none
left; (2) server-side authorization → audited: every `/api/admin/*` route
except login/logout/session calls `requireAdmin()`, payment verification checks
the Razorpay signature, cron is secret-gated; (4) rate limiting → login now
locks out after 5 attempts / 15 min / IP with `429 + Retry-After`; admin
cookie is now SameSite=Strict; client-IP detection prefers the platform's
`x-vercel-forwarded-for` over a spoofable `X-Forwarded-For`. (3) email
verification and (5) password rules don't apply (no sign-up flow).

**Performance:**
- Images: `formats: [avif, webp]`, 30-day optimizer cache, fewer size
  variants, video poster re-encoded 121 KB → 23 KB.
  `remotePatterns` was `**` (an open image proxy for the whole internet) →
  now only your Supabase public bucket.
- Fonts: dropped unused Sora 600; Inter stays one variable file; `swap`.
- JS split/lazy: Recharts moved out of the admin bundle (`/admin` page JS
  112 kB → 9.9 kB), review form + terms modal load on click, recent-activity
  toast loads when idle, `/about` game loads near the viewport, visit beacon
  waits for idle.
- Third-party: Razorpay only on demand, `preconnect` on form focus, retries
  after a failed load; CSP gained `object-src 'none'`, `base-uri`, `form-action`,
  `upgrade-insecure-requests` (prod).
- Caching/CDN: cache headers for public assets and public API GETs;
  `no-store` for admin/access/download; optional `CDN_URL` (assetPrefix + CSP +
  CORS). `.gitignore` + `.env.example` added (`.env` holds real secrets).

## 10. Supabase Postgres + Cloudflare R2, payment reminder emails, admin session cookie

- **Database**: no code change needed (Prisma already spoke plain
  Postgres) — schema comments and `.env`/README updated to point at
  Supabase's connection strings (Supavisor pooler on 6543 for
  `DATABASE_URL`, direct on 5432 for `DIRECT_URL`) instead of Neon's.
- **Storage moved from Supabase Storage to Cloudflare R2.** New
  `lib/r2.ts` (S3-compatible client via `@aws-sdk/client-s3` +
  `@aws-sdk/s3-request-presigner`) replaces `lib/supabase.ts` and
  `lib/supabaseBrowser.ts`, which are deleted. The browser now uploads
  with a plain `fetch(presignedUrl, { method: "PUT" })` instead of the
  Supabase JS client — one less client-side dependency.
  `app/api/admin/upload/sign/route.ts` and `app/api/download/route.ts`
  were rewritten against the new lib; `next.config.ts`'s CSP
  `connect-src`/`media-src` now allow the R2 origin instead of Supabase's.
- **"Filled the form, didn't pay" reminder emails.** `Submission` gained
  `reminderCount` (0–3) and `lastReminderAt`. New
  `app/api/cron/reminders/route.ts`, scheduled via `vercel.json` every 5
  minutes (needs a Vercel Pro plan, or an external scheduler — see
  README), sends exactly 3 emails per pending submission at 10 minutes, 1
  hour, and 24 hours after form submission, then stops permanently. Stops
  early the moment `paymentStatus` becomes `"paid"`. Protected by
  `CRON_SECRET`, checked against either the `Authorization: Bearer …`
  header Vercel Cron sends automatically or a plain `x-cron-secret`
  header for any other scheduler. New `paymentReminderEmail()` in
  `lib/mailer.ts` for the three email variants.
- **Admin panel no longer logs out on refresh, and never touches
  localStorage.** The password was previously kept only in React state,
  so a refresh always lost it. `lib/adminAuth.ts` now also issues an
  httpOnly, HMAC-signed session cookie (`ADMIN_SESSION_SECRET`, 12-hour
  expiry) via new `POST /api/admin/login`; `GET /api/admin/session`
  checks it on page load instead of showing the login form every time;
  `POST /api/admin/logout` (wired to a new **Log out** button in the
  dashboard header) clears it and sends the admin back to `/`.
  `requireAdmin()` now accepts either this cookie or the existing
  `x-admin-secret` header, so every other admin API route needed no
  changes.


Two real bugs from §8, both visible in the admin panel after visitor
tracking had a few hours of real data:

- **KPI cards were using the chart's trend window, not "this period".**
  `rangeStats` reused the same lookback as the chart underneath it (Day
  → last 14 days, Week → last 8 weeks, etc.), so clicking "Day" showed a
  two-week total, not today's. `RANGE_WINDOW_DAYS` in
  `app/api/admin/analytics/route.ts` now matches what each tab's name
  actually says: Day = last 24 hours, Week = last 7 days, Month = last
  30 days, 6 Months = last 180 days, Year = last 365 days — computed as
  a true rolling window from `Date.now()` (not a calendar-day bucket),
  so "Day" is genuinely the last 24 hours and not "since midnight IST".
  The chart itself is unchanged — it still shows a longer trend (14
  daily points, 8 weekly points, etc.) than the single current-period
  number above it, on purpose.
- **Visitor conversion could read over 100%** (e.g. 533.3%) because paid
  orders from *before* visitor tracking existed still counted as sales
  in a window, while the visitor side of the same window had almost no
  data yet (the feature was brand new). `visitorConversion` (both
  per-range and the all-time `overallVisitorConversion`) is now clamped
  with `Math.min(100, …)` — a buyer is conceptually always a visitor
  first, so the rate can't legitimately exceed it. The number will keep
  looking a little off for a few days until enough post-launch traffic
  is tracked to outweigh the pre-launch sales; the clamp just stops it
  from displaying something impossible in the meantime.
- Frontend: the KPI cards now show their own hint text ("Last 24
  hours", "Last 7 days", …) instead of reusing the chart's hint ("Last
  14 days", "Last 8 weeks", …), so the two numbers on screen no longer
  claim to cover the same period when they don't.

## 8. Unique-visitor analytics + range-aware admin KPIs

**Unique visitors, without tracking anyone personally:**
- New `Visit` model (`prisma/schema.prisma`) — one row per anonymous
  visitor per IST calendar day. No IP address or PII is stored, only a
  random id from a first-party cookie.
- `lib/visitor.ts` issues/reads that cookie (`d2h_vid`, 400-day max
  lifetime, `Secure`/`SameSite=Lax`).
- `components/VisitorTracker.tsx` fires one small POST to the new
  `POST /api/track-visit` on every real page load (mounted once in
  `app/layout.tsx`), and explicitly skips `/admin` so the dashboard
  doesn't count its own admin's visits. The endpoint is rate-limited per
  IP and the `(visitorId, day)` unique constraint makes it idempotent —
  refreshing the page or browsing five pages in a minute still only ever
  counts as **one** visitor for that day.
- **Setup required:** run `npx prisma db push` again to create the new
  `Visit` table.

**Admin panel — visitor count, a second conversion metric, and range-aware totals:**
- `/api/admin/analytics` now also returns `rangeStats` — unique
  visitors, sales, revenue, and **visitor→buyer conversion** scoped to
  the *same lookback window each range tab's chart already shows* (e.g.
  "Week" = last 8 weeks), plus each chart's per-bucket data now includes
  a `visitors` field. `totals` gained an all-time `totalUniqueVisitors`
  and `overallVisitorConversion`.
- `app/admin/page.tsx`: the top KPI row (Revenue, Sales, Unique
  visitors, Visitor conv.) now updates when you click Day / Week / Month
  / 6 Months / Year — previously "Total revenue" and "Total sales" were
  frozen at their all-time value regardless of which tab was selected,
  while the chart underneath them changed. All-time totals are still
  shown, just moved to their own row below. The existing submission→paid
  conversion is kept too, relabelled "Submission conv." to sit next to
  the new "Visitor conv." A third chart (unique visitors) sits alongside
  the existing sales and revenue charts, all driven by the same range
  tabs.

**SEO:** `app/sitemap.ts` was only listing the homepage even though
`/about`, `/price`, and `/contact` already had their own metadata —
added them so they're discoverable via the sitemap, not just on-site
links. `/admin` was already correctly disallowed in `app/robots.ts`.

**Security checklist review:** the pasted "vibe-coded login screen"
checklist assumes a standard email/password signup flow, which this app
doesn't have — admin access is a single server-verified, bcrypt-hashed,
rate-limited secret (already never stored in `localStorage`; see
`lib/adminAuth.ts`), and the only other "auth" is a per-order access
token, not a login. So items 1–3 and 5 don't apply as written. The one
applicable pattern — rate limiting — was already in place for admin
auth and has now been added to the new `/api/track-visit` endpoint too
(120 requests/min/IP) so it can't be used to inflate the visitor count.

## 7. Invoices, multi-device access links, and bcrypt admin auth

**Invoice PDFs (customer + admin):**
- New `lib/invoice.ts` renders a one-page order invoice as a PDF, on
  demand, from data already in the database (buyer details, product,
  payment reference, amount, a deterministic invoice number, paid date).
- `app/api/payment/verify/route.ts` now generates that PDF the moment a
  payment is confirmed — **before** the download link is ever emailed —
  and attaches it directly to the order confirmation email, alongside a
  "view invoice" link.
- New `app/api/invoice/[token]/route.ts`: the buyer can re-download their
  invoice anytime from their access page. Rate-limited and gated on a paid
  access token, but deliberately **not** device-locked, since it's not the
  paid product itself and buyers reasonably want it from any device.
- New `app/api/admin/invoice/[id]/route.ts` + a **PDF** button per row in
  the admin **Submissions** table, so support/finance can pull any paid
  order's invoice without touching the database.

**Access links were locked to a single device — this was the "already in
use" problem:**
The previous fix (see #2 below) bound a paid link to the *first* device
that opened it, which meant a genuine buyer confirming on their phone and
then trying to read the file on their laptop got blocked exactly like a
stranger with a forwarded link would.
- `prisma/schema.prisma`: `deviceToken String?` → `deviceTokens String[]`.
- `MAX_DEVICES` (`lib/tokens.ts`, default **2**) is the new cap. Claiming
  (`app/api/access/claim/route.ts`) uses a single atomic SQL statement —
  `array_append(...)` guarded by `cardinality(...) < MAX_DEVICES` — so a
  burst of near-simultaneous opens (two tabs, a slow redirect) can never
  push the array past the limit.
- `app/access/[token]/page.tsx` and `app/api/download/route.ts` both check
  membership in the array instead of equality against a single token.
- **Setup required:** run `npx prisma db push` again — the column changed
  shape from `String?` to `String[]`.

**Admin password is now bcrypt-hashed:**
- `ADMIN_SECRET` (plaintext, compared with `crypto.timingSafeEqual`) is
  replaced by `ADMIN_PASSWORD_HASH` (a bcrypt hash, compared with
  `bcrypt.compare`) in `lib/adminAuth.ts`. The real password is never
  stored anywhere now, not even in `.env` — only its hash.
- Generate the hash once with:
  `node -e "console.log(require('bcryptjs').hashSync('your-password', 12))"`
  and put the result in `ADMIN_PASSWORD_HASH`.
- `app/api/reviews/[id]/route.ts` had its own duplicate admin check — it
  now reuses the same `verifyAdminPassword` helper instead of comparing a
  separate copy of the secret.
- **Setup required:** set `ADMIN_PASSWORD_HASH` in your environment (see
  `.env.example`) before deploying — the old `ADMIN_SECRET` var no longer
  does anything.

---

# Before you deploy

1. `npm install`
2. `npx prisma db push` — required for the `deviceTokens` column change.
3. Set `ADMIN_PASSWORD_HASH` in your environment (see above) — logins with
   the old `ADMIN_SECRET` will stop working.
4. `npm run build` locally to catch anything environment-specific (this
   sandbox couldn't reach `binaries.prisma.sh`, so `prisma generate`
   couldn't run and the Prisma-typed files couldn't be fully verified here
   — everything was checked by hand against the schema and by
   syntax-checking every changed file, but a real `npm run build` is worth
   doing before you push live).

---

## 0. Video/file uploads 413'd, and the analytics chart's day/week/month buckets were wrong

**413 FUNCTION_PAYLOAD_TOO_LARGE on upload (even a 5MB image):**
The old `/api/admin/upload` received the file itself as a multipart POST
body. Vercel serverless Functions hard-cap the request body at ~4.5MB —
a platform limit, not something app code (or `maxDuration`/route config)
can raise — so any file near or over that size 413'd before this app's
own size checks ever ran.

**Fix — upload straight from the browser to Storage:**
- New `app/api/admin/upload/sign/route.ts`: validates the file's type/size,
  then mints a one-time Supabase Storage signed upload URL (service-role
  key stays server-side).
- `app/admin/page.tsx`: the browser now calls that endpoint, then uploads
  the file bytes directly to Supabase Storage with
  `supabase.storage.from(bucket).uploadToSignedUrl(...)` — the file never
  passes through this app's server at all.
- `app/api/admin/upload/route.ts` now only receives the small JSON result
  (text fields + the resulting URLs) to save to the database — well under
  any body-size limit no matter how large the video is.
- New `lib/supabaseBrowser.ts` — a browser-only Supabase client using the
  public **anon** key (never the service role key). **Requires two new env
  vars**, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` —
  see `.env.example`; both come from the same Supabase dashboard page as
  the keys you already have.

**Analytics dashboard bucketing was wrong:**
- All day/week/month bucketing used UTC. Since the store's numbers are in
  IST (UTC+5:30), a sale made after ~5:30pm IST was counted as happening
  the *next* day in UTC — the cause of "today's sales"/daily numbers
  looking off. Every date bucket (`app/api/admin/analytics/route.ts`) is
  now computed in IST.
- The 6-month and yearly charts built each month's bucket with
  `date.setUTCMonth(date.getUTCMonth() - i)` starting from *today's*
  day-of-month. That overflows in months shorter than the current day
  (e.g. Aug 31 minus 6 months lands on Mar 2/3, since February doesn't
  have 31 days), silently duplicating one month and skipping another —
  the "gap between months isn't right" bug. Fixed by computing each
  month's bucket from the 1st of the month instead.
- Added the missing **Month** tab (last 30 days, daily buckets) between
  Week and 6 Months — the range picker only had Day/Week/6 Months/Year
  before.

## 1. Theme toggle alignment
`components/ThemeToggle.tsx` — rewrote the track/knob/icon layout with exact,
symmetric measurements (w-14 h-8 track, h-6 w-6 knob inset by 4px on every
side) instead of hand-picked offsets, so the sun/moon icons and the sliding
knob now line up correctly in both states.

## 2. Access links were shareable after payment
This was real: anyone who got hold of `/access/{token}` could open it and
download the file — there was nothing tying it to the original buyer beyond
the (forwardable) URL itself.

**Fix — one-device claim:**
- Added a `deviceToken` column on `Submission` (`prisma/schema.prisma`).
- The *first* browser to open a paid `/access/{token}` link "claims" it: a
  new route (`app/api/access/claim/route.ts`) generates a random secret,
  saves it on the submission, and sets it as an httpOnly cookie, then
  redirects back to the access page.
- Every visit after that compares the request's cookie to the saved
  `deviceToken`. If they match, the page shows normally. If they don't
  (a different device/browser opened the same link), the page now shows a
  clear **"This link is already in use"** message with a **Back to home**
  button, instead of the file.
- The same check was added to `/api/download` directly, so the block can't
  be bypassed by calling the download API with just the token.

**Trade-off to know about:** this binds the link to one device. If a
genuine buyer wants it on a second device (e.g. confirmed on phone, wants
it on a laptop too), they'll also see the blocked page and need to contact
support. If you'd rather allow e.g. 2–3 devices instead of 1, that's a small
change to the claim logic — say the word and I'll adjust it.

**Setup required:** run `npx prisma db push` (or your usual migration
command) against your database before deploying, so the new `deviceToken`
column actually exists.

## 3. Uploaded video not playing
Found the likely real cause: `lib/supabase.ts`'s `ensureBucket()` only
created the storage bucket if it didn't exist yet — if the `uploads` bucket
already existed (e.g. created manually in the Supabase dashboard, or from
before the public/private split existed in this codebase) with the wrong
visibility, new video uploads would succeed but the public URL the app
returns would 400/403 in the browser. That looks exactly like "uploaded
fine, just won't play."

**Fix:** `ensureBucket()` now checks the existing bucket's `public` flag and
corrects it automatically if it doesn't match what's expected.

Also hardened `components/VideoShowcase.tsx`: calls `.load()` before
`.play()` so a `preload="none"` video actually has something to play,
remounts the `<video>` element when the source changes (so a fresh upload
can't get stuck showing a previous error state), and switched
`preload="none"` → `"metadata"` for more reliable first-tap playback.

**If it's still not playing after this:** check your Supabase project has
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` set correctly and that the
`uploads` bucket is reachable — the admin upload form will now surface a
clearer error if not.

## 4. Admin dashboard unreadable in dark mode
Root cause: your site auto-switches to dark mode at night (or when
manually toggled), which flips heading/body text colors (`text-brick-950`,
`text-brick-700`) to a near-white color for readability against a dark
background — but the entire `/admin` dashboard had **hardcoded light
backgrounds** (`bg-white`, `bg-cream`) with no dark-mode variants. Result:
near-white text on a white background — invisible, exactly like your
screenshots.

**Fix:** added `dark:` variants throughout `app/admin/page.tsx` — page
background, header, cards, inputs, table rows, status badges, chart grid
lines and axis labels — all now adapt properly. Reused the site's existing
`.card` utility class where possible for consistency.

## 5. Dark/light toggle added to the admin nav
`ThemeToggle` is now rendered in the admin header (top-right, next to the
tabs) and on the login screen — previously it only existed on the public
site, not the admin dashboard.

## 6. Analytics page redesign
`app/api/admin/analytics/route.ts` now returns four time ranges instead of
two: `daily` (last 14 days), `weekly` (last 8 weeks), `sixMonth` (last 6
months), `yearly` (last 12 months).

`app/admin/page.tsx` analytics tab:
- Stat cards now have icons and proper dark-mode contrast.
- Sales & revenue is now one chart pair (bar = sales, line = revenue) with
  a **Day / Week / 6 Months / Year** range switcher, instead of four
  separately-titled charts.
- Rating breakdown replaced the pie chart with a proper review-summary
  card: big average number + stars on the left, a 5★→1★ bar breakdown with
  counts on the right — reads at a glance, same pattern Amazon/Flipkart use.
