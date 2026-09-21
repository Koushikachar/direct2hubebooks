// One place for security-relevant events, so they can be searched, counted and
// alerted on in your host's log viewer (Vercel/Netlify logs, or a log drain to
// Better Stack / Datadog / Axiom …). Each event is a single JSON line:
//
//   {"level":"security","event":"admin_login_failed","ip":"203.0.113.9","ts":"…"}
//
// Rules for what may go in `details`: identifiers and reasons only. NEVER pass
// a password, token, cookie, Authorization header, request body, or full
// email/phone number — logs are retained and read by more people than the
// database is. (IPs are logged on purpose: they are what you need to spot and
// block an attacker.)
export type SecurityEvent =
  | "admin_login_failed"
  | "admin_login_locked_out"
  | "admin_login_succeeded"
  | "admin_session_rejected"
  | "webhook_bad_signature"
  | "payment_amount_mismatch"
  | "payment_proof_missing"
  | "download_device_denied"
  | "cron_unauthorized"
  | "rate_limited";

export function logSecurityEvent(
  event: SecurityEvent,
  details: Record<string, string | number | boolean | null | undefined> = {}
): void {
  try {
    console.warn(JSON.stringify({ level: "security", event, ...details, ts: new Date().toISOString() }));
  } catch {
    // logging must never be able to break a request
  }
}
