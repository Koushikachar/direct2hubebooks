# SECURITY AUDIT — Direct2hub (pre-production)

_Scope: the full codebase, configuration, dependency tree and API surface in this repository, audited on 2026-09-20. No production system was contacted and nothing destructive was run. No secret values appear in this document._

## SECURITY AUDIT SUMMARY

**Critical:** 1 — **C-1** Live production credentials shipped inside the project archive

**High:** 5 — **H-1** Admin login lockout could be bypassed — password accepted on every admin endpoint; **H-2** Download access token disclosed to anyone who knew a paid Cashfree order id (BOLA/IDOR); **H-3** Personal data of any pending customer readable by typing their email or phone number; **H-4** Known-vulnerable dependencies in production; **H-5** Supabase Row Level Security not enabled on Prisma tables (auto-exposed REST API)

**Medium:** 6 — **M-1** Admin session could be forged from the password hash; sessions survived password changes; **M-2** CSV / spreadsheet formula injection in the admin export; **M-3** Admin content endpoint stored unvalidated URLs (stored-XSS links, broken/hostile media, arbitrary storage keys); **M-4** Email abuse: your Gmail can be made to email third parties (contact auto-reply, payment reminders); **M-5** Content-Security-Policy allows 'unsafe-inline' scripts; **M-6** Rate limiting depends on Upstash being configured in production

**Low:** 6 — **L-1** Download API worked with a bare token when no device had claimed the link; **L-2** Invoice logo fetch was server-side request forgery capable (admin-supplied URL); **L-3** Visitor cookie parsing: crash on malformed escapes, arbitrary values stored; **L-4** Upstream error text and HSTS preload; **L-5** No structured security logging or alert hooks; **L-6** Purchase enumeration, public first-name feed, stateless admin sessions, presigned PUT size


> This is **not** a statement that the app is secure. Section “Still requires manual testing” lists what code review cannot prove.


## Findings

### C-1 — Live production credentials shipped inside the project archive

- **Severity:** Critical  
- **Status:** ACTION REQUIRED (rotate) — repo hygiene fixed
- **Location/File:** .env (project root of the zip); no .gitignore existed originally
- **Evidence:** `.env` is present with values set for: DATABASE_URL + DIRECT_URL (Supabase Postgres, password embedded), GMAIL_APP_PASSWORD, UPSTASH_REDIS_REST_TOKEN, ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET (64 chars). No `.git` directory was included, so Git history could NOT be scanned. The original archive had no `.gitignore`.
- **Why it matters:** The database password grants full read/write on every buyer record (names, emails, phone numbers, download access tokens). The Gmail app password lets anyone send mail as your address. Removing the file is NOT enough once it has been shared or committed: the values remain valid until rotated.
- **How it could be abused:** Anyone who has the archive (or a repo/backup containing it) can connect to the database directly, dump `Submission`, take every accessToken and download the paid ebook, or send phishing email from the store's Gmail.
- **Recommended fix:** Rotate NOW: Supabase DB password (Project Settings → Database → Reset), Gmail app password (revoke + create new), Upstash REST token, ADMIN_SESSION_SECRET, and set a new admin password → new ADMIN_PASSWORD_HASH. Add real values only in the host's environment settings. `.gitignore` (added) now excludes `.env*`; `.env.example` (blank values) is the template. Run `gitleaks detect` / `trufflehog git file://.` on your REAL repository to check history; if anything was ever committed, rewrite history AND still rotate.
- **Verification test:** `git log --all -p | gitleaks stdin` returns no findings; old DB password fails `psql`; `git check-ignore .env` prints `.env`.

### H-1 — Admin login lockout could be bypassed — password accepted on every admin endpoint

- **Severity:** High  
- **Status:** FIXED
- **Location/File:** lib/adminAuth.ts (requireAdmin), app/admin/page.tsx, app/api/reviews/[id]/route.ts
- **Evidence:** `requireAdmin()` accepted the raw admin password in an `x-admin-secret` header on ALL /api/admin/* routes, rate-limited at 20/min/IP, while /api/admin/login enforced 5 attempts/15 min. The admin UI also kept the password in React state and sent it on every request.
- **Why it matters:** The strict lockout only protected the login form; the same password could be guessed 20×/min/IP (28,800/day) through any other admin endpoint.
- **How it could be abused:** Script `curl -H 'x-admin-secret: guess' /api/admin/submissions` in a loop from many IPs; a weak admin password falls.
- **Recommended fix:** Session cookie is now the only admin credential; the header path was deleted, the admin UI no longer keeps or sends the password (cleared right after login), reviews moderation uses the cookie too. Rate limit for the (now cheap, unguessable) cookie check raised to 60/min.
- **Verification test:** `curl -H 'x-admin-secret: <correct password>' /api/admin/submissions` → 401. Covered by test-suite (58 checks).

### H-2 — Download access token disclosed to anyone who knew a paid Cashfree order id (BOLA/IDOR)

- **Severity:** High  
- **Status:** FIXED (introduced in the earlier Cashfree migration — my flaw)
- **Location/File:** app/api/payment/verify/route.ts, app/payment/return/page.tsx, lib/paymentFinalize.ts
- **Evidence:** `verify` returned `token: outcome.token` for ANY order id whose purchase was paid; `paymentFinalize` returned the token immediately for an already-paid submission regardless of which order id was presented. The order id is printed on the invoice PDF (“Order ID: d2h_…”), sits in return-URL query strings and browser history. Razorpay's old flow required a signature only the payer had, so this was a regression.
- **Why it matters:** An invoice is routinely forwarded to accountants/clients. Whoever sees it could obtain the buyer's access token and download the ebook (the token is the download credential).
- **How it could be abused:** Take the Order ID from a forwarded invoice → POST /api/payment/verify {orderId} → receive the token → open /access/<token>.
- **Recommended fix:** New lib/paymentProof.ts: create-order sets a signed httpOnly cookie proving THIS browser started the order; the token is only revealed when (a) the presented order id is the order that actually settled the purchase AND (b) the browser holds the matching signed proof. Everyone else gets “paid — check your email”. The email + webhook path is unaffected.
- **Verification test:** Test-suite: victim's browser → token; same order id without cookie → no token; attacker's own order id → no token; forged cookie → no token.

### H-3 — Personal data of any pending customer readable by typing their email or phone number

- **Severity:** High  
- **Status:** FIXED
- **Location/File:** app/api/submit/route.ts (resume branch), app/api/payment/create-order/route.ts
- **Evidence:** When a record matched by email OR phone existed unpaid, /api/submit returned its stored name, email, countryCode and whatsapp; create-order also echoed name+email for any submissionId.
- **Why it matters:** Broken object-level authorization: no proof the caller owns the record.
- **How it could be abused:** Enter a target's email (or number) with junk in the other fields → response contains their stored name/phone/email.
- **Recommended fix:** Both endpoints now return only ids; the UI displays what the buyer typed. Also added: dial-code validation (`^\+\d{1,4}$`), CR/LF/control-character stripping from names, and a site-wide submit cap.
- **Verification test:** Test-suite: resume response keys are exactly `ok,submissionId`; create-order body contains no name/email.

### H-4 — Known-vulnerable dependencies in production

- **Severity:** High  
- **Status:** FIXED (npm audit: 0 vulnerabilities)
- **Location/File:** package.json / package-lock.json
- **Evidence:** `npm audit` before: 1 critical + 3 high + 1 moderate. next@15.3.9 (GHSA-g5qg-72qw-gw5v cache-key confusion and GHSA-xv57-4mr9-wg8v content injection in the image optimizer), nodemailer@6 (GHSA-mm7p-fcc7-pg87 mail delivered to an unintended domain via address-parsing conflict; GHSA-c7w3-x93f-qmm8 SMTP command injection), sharp/libvips CVEs, postcss XSS/file-read, uuid (unused).
- **Why it matters:** nodemailer receives user-supplied recipient addresses (contact form, order form); the Next.js flaws sit in the public image endpoint.
- **How it could be abused:** Crafted addresses to divert mail to another domain; cache poisoning/content injection via /_next/image.
- **Recommended fix:** next 15.5.25, nodemailer 10.0.10, sharp 0.35.4 + postcss 8.5.28 via `overrides`, unused `uuid`/`@types/uuid` removed. Production build + all tests re-run on the upgraded set.
- **Verification test:** `npm ci && npm audit` → “found 0 vulnerabilities”. Re-run monthly / enable Dependabot.

### H-5 — Supabase Row Level Security not enabled on Prisma tables (auto-exposed REST API)

- **Severity:** High  
- **Status:** NEEDS MANUAL ACTION (script provided, not executed)
- **Location/File:** prisma/schema.prisma tables Product, Submission, Visit, Review — no RLS SQL existed anywhere in the repo
- **Evidence:** Tables live in the `public` schema where Supabase auto-exposes them via PostgREST. The repository contains no `ENABLE ROW LEVEL SECURITY` / REVOKE statements. I cannot see the live database, so actual state is UNVERIFIED.
- **Why it matters:** With RLS off and default grants, the public anon key can read and write these tables over HTTPS — including `Submission.accessToken`. The app itself never uses that API (Prisma connects as `postgres`, which bypasses RLS), so enabling RLS with no policies costs nothing.
- **How it could be abused:** `curl https://<ref>.supabase.co/rest/v1/Submission -H 'apikey: <anon>'` dumps buyers and tokens.
- **Recommended fix:** Run `prisma/security.sql` in the Supabase SQL editor (enables RLS, revokes anon/authenticated, tightens default privileges). Also confirm in Dashboard → Storage that `protected-files` is PRIVATE and no storage.objects policy allows anon access, and that the S3 access key is server-only.
- **Verification test:** The curl above returns `[]`/401/permission denied; `SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public'` shows true for all four.

### M-1 — Admin session could be forged from the password hash; sessions survived password changes

- **Severity:** Medium  
- **Status:** FIXED
- **Location/File:** lib/adminAuth.ts
- **Evidence:** `getSessionSecret()` fell back to ADMIN_PASSWORD_HASH as the HMAC key when ADMIN_SESSION_SECRET was unset; the token was `<expiry>.<hmac>` with nothing tying it to the password.
- **Why it matters:** Anyone who sees the bcrypt hash (leaked .env, backup) could mint a valid admin cookie without cracking the password; a stolen cookie survived a password change.
- **How it could be abused:** Compute HMAC-SHA256(expiry, hash) offline → set cookie → admin.
- **Recommended fix:** Dedicated ADMIN_SESSION_SECRET (≥32 chars) is now mandatory (fail closed, clear error at login); session embeds a fingerprint of the current password hash so changing the password kills all sessions; TTL 12h → 8h.
- **Verification test:** Test-suite: token forged with the hash → rejected; password change → old cookie rejected; missing/short secret → login 500, no cookie.

### M-2 — CSV / spreadsheet formula injection in the admin export

- **Severity:** Medium  
- **Status:** FIXED
- **Location/File:** app/api/admin/export/route.ts
- **Evidence:** csvEscape() only handled quotes/commas; name/email/phone are free text from anonymous visitors.
- **Why it matters:** Excel/Sheets execute cells starting with = + - @ ; opening the export could run formulas or exfiltrate data.
- **How it could be abused:** Submit name `=HYPERLINK("http://evil","x")` → admin exports and opens the CSV.
- **Recommended fix:** Cells beginning with = + - @ tab or CR are prefixed with an apostrophe (lib/validators.csvSafe).
- **Verification test:** Test-suite exports a record named `=HYPERLINK(...)` and asserts the cell starts with `'=`.

### M-3 — Admin content endpoint stored unvalidated URLs (stored-XSS links, broken/hostile media, arbitrary storage keys)

- **Severity:** Medium  
- **Status:** FIXED
- **Location/File:** app/api/admin/upload/route.ts; lib/storage.ts; app/api/admin/upload/sign/route.ts
- **Evidence:** whatsappUrl/whatsappGroupUrl/youtubeUrl/instagramUrl, logoUrl/heroImageUrl/videoUrl/previews and pdfUrl were stored exactly as sent (no scheme/host/length checks) and later rendered as `<a href>`, `<img>`, `<video>` or fed to the storage layer. Upload keys took their extension from the browser filename.
- **Why it matters:** Needs an admin session (or CSRF), but a `javascript:` link becomes stored XSS for every visitor; foreign hosts break next/image (page 500) or point browsers at third parties; a crafted pdfUrl could address another object in the bucket.
- **How it could be abused:** Compromised/phished admin sets `whatsappGroupUrl=javascript:…`; buyers who click “Join” run attacker JS.
- **Recommended fix:** Server-side validation: https-only links; media only same-site paths or this project's Supabase host; pdfUrl only a flat storage key; length caps; phone charset; storage keys re-validated at read time; upload extensions derived from the vetted content type.
- **Verification test:** Test-suite: 10 malicious payloads → 400; legitimate payload → 200.

### M-4 — Email abuse: your Gmail can be made to email third parties (contact auto-reply, payment reminders)

- **Severity:** Medium  
- **Status:** PARTIALLY FIXED — needs CAPTCHA / verification (manual)
- **Location/File:** app/api/contact/route.ts, app/api/submit/route.ts + app/api/cron/reminders/route.ts
- **Evidence:** The contact form auto-replies to any typed address; every new submission (unverified email) gets up to 3 reminder emails. Bot checks are a honeypot + minimum fill time, both trivial to script.
- **Why it matters:** Spam/harassment relay from your domain; Gmail may suspend the account (which also breaks purchase emails).
- **How it could be abused:** Loop the form with victims' addresses over many IPs.
- **Recommended fix:** Added global hourly caps (submit 300, contact 200) and a per-recipient cap (2 auto-replies/day). RECOMMENDED next: Cloudflare Turnstile (free) on both forms and/or double opt-in before reminders.
- **Verification test:** Test-suite: 3rd auto-reply to the same address → 429 even from a new IP.

### M-5 — Content-Security-Policy allows 'unsafe-inline' scripts

- **Severity:** Medium  
- **Status:** ACCEPTED RISK / manual hardening
- **Location/File:** next.config.ts
- **Evidence:** script-src includes 'unsafe-inline' (needed for Next.js inline bootstrap data and the no-flash theme script without nonces).
- **Why it matters:** Weakens CSP's second line of defence if an XSS bug is ever introduced. (I found no XSS sink today: the only dangerouslySetInnerHTML uses are JSON-LD and a static script.)
- **How it could be abused:** Only relevant after an injection bug exists.
- **Recommended fix:** Move to nonce-based CSP via middleware (note: forces dynamic rendering and loses static/ISR caching). Added object-src 'none', base-uri, form-action, frame-ancestors, upgrade-insecure-requests.
- **Verification test:** Browser console shows no CSP violations on /, /price, /access/*, checkout popup; A+ on securityheaders.com.

### M-6 — Rate limiting depends on Upstash being configured in production

- **Severity:** Medium  
- **Status:** NEEDS MANUAL REVIEW
- **Location/File:** lib/rateLimit.ts
- **Evidence:** Without UPSTASH_REDIS_REST_URL/TOKEN it falls back to per-instance memory (serverless instances don't share it) and it fails open if Upstash is unreachable. Keys use x-vercel-forwarded-for → x-real-ip → x-forwarded-for → 'unknown'.
- **Why it matters:** Per-instance limits are easy to sidestep; behind a proxy that doesn't set the platform header, all users can share one 'unknown' bucket.
- **How it could be abused:** Spread requests across cold instances to reset counters.
- **Recommended fix:** Set the Upstash variables in the production environment (they are present in the shared .env). Verify the IP header your host actually sets.
- **Verification test:** From two networks, hit /api/admin/login 6× — 6th is 429 on both; check logs for `rate_limited` events.

### L-1 — Download API worked with a bare token when no device had claimed the link

- **Severity:** Low  
- **Status:** FIXED
- **Location/File:** app/api/download/route.ts
- **Evidence:** Device-cookie check ran only `if (deviceTokens.length > 0)`.
- **Why it matters:** A leaked link could be used against the API directly without consuming a device slot.
- **How it could be abused:** POST {token} from a script.
- **Recommended fix:** Device claim is now always required; denied attempts are logged (`download_device_denied`).
- **Verification test:** Test-suite: token-only request with no cookie → 403.

### L-2 — Invoice logo fetch was server-side request forgery capable (admin-supplied URL)

- **Severity:** Low  
- **Status:** FIXED
- **Location/File:** lib/invoice.ts (tryEmbedLogo)
- **Evidence:** Any http(s) URL saved as logoUrl was fetched by the server with no timeout or size cap.
- **Why it matters:** Blind SSRF to internal/cloud-metadata addresses.
- **How it could be abused:** Admin (or attacker with admin cookie) sets logoUrl=http://169.254.169.254/….
- **Recommended fix:** Only same-site paths and this project's Supabase host are fetched; 5s timeout, 2 MB cap, redirects refused.
- **Verification test:** Test-suite: four internal/foreign URLs → zero outbound fetches.

### L-3 — Visitor cookie parsing: crash on malformed escapes, arbitrary values stored

- **Severity:** Low  
- **Status:** FIXED
- **Location/File:** lib/visitor.ts, app/api/track-visit/route.ts
- **Evidence:** `decodeURIComponent` on a raw cookie (throws on `%`), unbounded/unvalidated visitorId and path.
- **Why it matters:** 500s and analytics pollution.
- **How it could be abused:** Send `Cookie: d2h_vid=%E0%A4%A`.
- **Recommended fix:** Safe cookie reader, UUID-only visitor ids, path allow-list.
- **Verification test:** Test-suite: malformed and 3 KB cookies → 200 and a fresh UUID.

### L-4 — Upstream error text and HSTS preload

- **Severity:** Low  
- **Status:** FIXED
- **Location/File:** app/api/payment/create-order/route.ts, next.config.ts
- **Evidence:** Cashfree's raw validation message was reflected to visitors; HSTS carried the irreversible `preload` flag.
- **Why it matters:** Information disclosure; preload commits every subdomain to HTTPS-only forever.
- **How it could be abused:** —
- **Recommended fix:** Generic message (details stay in server logs); `preload` removed.
- **Verification test:** Response body contains no gateway wording; `curl -I` shows HSTS without preload.

### L-5 — No structured security logging or alert hooks

- **Severity:** Low  
- **Status:** NEW CAPABILITY
- **Location/File:** whole app
- **Evidence:** Only ad-hoc console.error; failed admin logins, webhook signature failures and refused downloads were not distinguishable in logs.
- **Why it matters:** You can't detect brute force or forged webhooks you can't see.
- **How it could be abused:** —
- **Recommended fix:** lib/securityLog.ts writes one JSON line per event (admin_login_failed / _locked_out / _succeeded, admin_session_rejected, webhook_bad_signature, payment_amount_mismatch, payment_proof_missing, download_device_denied, cron_unauthorized, rate_limited) with no passwords/tokens/bodies. Add alerts in your log drain (see checklist).
- **Verification test:** Attempt 3 wrong logins → 3 `admin_login_failed` lines and no password text in any line.

### L-6 — Purchase enumeration, public first-name feed, stateless admin sessions, presigned PUT size

- **Severity:** Low  
- **Status:** ACCEPTED / informational
- **Location/File:** app/api/submit (409 message), app/api/recent-activity, lib/adminAuth, app/api/admin/upload/sign
- **Evidence:** 409 “already used to get this file” reveals that an email/number bought; /api/recent-activity publishes buyers' first names + times (30 days); admin cookie can't be revoked individually (mitigated by 8h TTL + password binding); a presigned S3 PUT cannot enforce the declared size; PDFs aren't magic-byte checked (admin-only).
- **Why it matters:** Privacy/consent (India DPDP/GDPR) and minor abuse paths.
- **How it could be abused:** Probe whether a specific person bought.
- **Recommended fix:** Decide deliberately: keep the social-proof feed only if your privacy notice covers it; keep the 409 (UX) or make it generic.
- **Verification test:** Manual review.


## Attacker test

| Actor | What I would attempt | Result now |
|---|---|---|
| **A. Unauthenticated** | Call any `/api/admin/*` route; brute-force the admin password (login form and via `x-admin-secret`); forge an admin cookie; download the PDF with a guessed/leaked token; read `/uploads/*.pdf`; hit `/rest/v1/Submission` with the anon key; forge a Cashfree webhook; pull PII by typing a victim's email into the order form; replay a paid order id to get a token | Admin: 401, header path removed, 5-attempt lockout, cookie forgery fails (test-suite). PDF is no longer in `public/` and download needs payment + device claim + 3-download cap. Webhook: signature required (401). PII echo removed. Order-id replay returns no token. **RLS/PostgREST exposure is unverified — run `prisma/security.sql` (H-5).** |
| **B. Normal buyer** (there are no user accounts; a buyer is whoever holds an access link) | Use the link on a 3rd device; call `/api/download` without the page; call `/api/admin/*`; edit/delete someone else's review; reuse another buyer's invoice link | 3rd device blocked (2 claims); API needs the device cookie (L-1 fixed); admin routes 401; review edit/delete needs that review's httpOnly cookie or the admin session; invoice needs that buyer's token. |
| **C. Malicious user targeting another's data** | Change `submissionId`/`orderId`/review `id`; enumerate customers via the 409 message; read invoice PDFs; abuse the contact form to mail a victim | IDs alone no longer disclose data (H-2, H-3); order/submission ids are unguessable cuids; review edit cookies are per-review, 192-bit random and stored only as a SHA-256 hash server-side. Enumeration via 409 remains (L-6). Mail abuse capped but not eliminated (M-4). |

## PRE-LAUNCH SECURITY CHECKLIST

**Secrets**
- [FAIL] `.env` with live secrets was in the shared archive → rotate everything (C-1)
- [PASS] `.gitignore` excludes `.env*`; `.env.example` has no values
- [PASS] No secret uses a `NEXT_PUBLIC_` prefix; no `process.env` in client components
- [NEEDS MANUAL REVIEW] Git history secret scan (no `.git` in the archive) — run gitleaks/trufflehog

**Authentication**
- [PASS] Admin auth enforced server-side on every `/api/admin/*` route (cookie only)
- [PASS] Login lockout 5 / 15 min / IP; generic error; bcrypt cost 12 hash
- [PASS] Session cookie HttpOnly, Secure (prod), SameSite=Strict, 8 h, bound to password
- [NEEDS MANUAL REVIEW] Admin password strength (≥16 random chars) — cannot be verified from a hash

**Authorization**
- [PASS] Review edit/delete: owner cookie or admin only
- [PASS] Download: payment + device claim + limit enforced server-side
- [PASS] Payment token disclosure requires proof cookie + paid-order match (H-2)
- [PASS] No PII echoed for unowned records (H-3)

**Database / storage**
- [PASS] No raw SQL except one parameterised tagged template (device claim); no string-built queries
- [NEEDS MANUAL REVIEW] RLS enabled on all four tables — run `prisma/security.sql` (H-5)
- [NEEDS MANUAL REVIEW] `protected-files` bucket is private; no anon storage policies; S3 key server-only
- [PASS] Paid PDF is not in `public/`; uploads use random names + vetted extensions

**API / input**
- [PASS] Validation server-side on submit/contact/reviews/admin content; URLs/keys allow-listed
- [PASS] No SSRF path left (invoice logo, image optimizer host-restricted)
- [PASS] Rate limits on submit, contact, reviews, download, invoice, payment, admin
- [NEEDS MANUAL REVIEW] Upstash configured in production; real client-IP header (M-6)
- [FAIL] No CAPTCHA on public forms (M-4)

**Frontend / config**
- [PASS] No security decision made only in the browser; admin UI is presentation only
- [PASS] No CORS headers (same-origin only); security headers + CSP set
- [FAIL] CSP still allows `'unsafe-inline'` scripts (M-5, accepted)
- [PASS] Errors are generic; no stack traces or DB errors returned to users

**Dependencies / CI**
- [PASS] `npm audit` = 0 vulnerabilities after upgrades (H-4); lockfile present
- [NEEDS MANUAL REVIEW] No CI/CD workflows in the repo — when you add one, don't expose secrets to PR builds
- [NEEDS MANUAL REVIEW] Turn on Dependabot / monthly `npm audit`

**Logging / monitoring**
- [PASS] Structured security events, no secrets in logs (L-5)
- [NEEDS MANUAL REVIEW] Alerts: >10 `admin_login_failed`/10 min, any `webhook_bad_signature`, any `payment_amount_mismatch`, spike in `download_device_denied`, `cron_unauthorized`
- [NEEDS MANUAL REVIEW] Email: SPF, DKIM, DMARC on your sending domain

**Production configuration**
- [NEEDS MANUAL REVIEW] `CASHFREE_ENV=production`, production keys, domain whitelisted, webhook delivered once in sandbox
- [NEEDS MANUAL REVIEW] `CRON_SECRET` set (empty in the shared `.env` → reminders currently rejected with 401)
- [PASS] No debug mode, source maps off, `poweredByHeader` off

## TOP 5 THINGS TO FIX BEFORE LAUNCH

1. **Rotate every secret in the shared `.env`** (DB password, Gmail app password, Upstash token, new ADMIN_SESSION_SECRET + admin password) and scan the real repo history (C-1).
2. **Run `prisma/security.sql`** and verify the anon key cannot read `Submission`; confirm `protected-files` is private (H-5).
3. **Deploy this build** (`npm ci`): payment-token disclosure (H-2), PII echo (H-3), admin-lockout bypass (H-1) and 5 vulnerable packages (H-4) are fixed here, not in your old copy.
4. **Cashfree go-live checks**: whitelist domain, production keys, confirm the webhook arrives and the proof-cookie flow works in sandbox (including an in-app browser / second device → “check your email” path).
5. **Put a CAPTCHA (Turnstile) on the order + contact forms and set log alerts** (M-4, L-5) — the only remaining path to abuse your sending account and inflate costs.

## Still requires manual testing (I cannot prove these from code)

- Live Supabase state: RLS, storage policies, bucket visibility, key scopes, pooler/`sslmode`, backups, who has dashboard access.
- A real penetration test / DAST run (OWASP ZAP or Burp) against a staging deploy — especially the Cashfree popup flow, redirects and in-app browsers.
- Behaviour behind your real proxy/CDN: client-IP header, rate-limit counters across instances, header injection.
- Cashfree dashboard: webhook URL, IP/domain whitelisting, refund/dispute handling, settlement account access.
- Hosting account security: 2FA on Vercel/Netlify, Supabase, Google, Cashfree, GitHub; least-privilege team access.
- Legal/privacy review of the public purchase feed, reminder emails and data retention (DPDP/GDPR).
- Load/abuse testing of expensive endpoints (invoice PDF generation, `/_next/image`).
