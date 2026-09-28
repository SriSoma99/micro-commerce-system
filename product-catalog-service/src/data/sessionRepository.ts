import { getDb } from "../db/database";

/** Callers pass the SHA-256 of the bearer token; the raw token is never stored. */
export function createSession(tokenHash: string, customerId: string, expiresAt: string): void {
  getDb()
    .prepare("INSERT INTO sessions (token_hash, customer_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(tokenHash, customerId, new Date().toISOString(), expiresAt);
}

export function findSessionCustomerId(tokenHash: string, nowIso: string): string | undefined {
  const row = getDb()
    .prepare("SELECT customer_id FROM sessions WHERE token_hash = ? AND expires_at > ?")
    .get(tokenHash, nowIso) as { customer_id: string } | undefined;
  return row?.customer_id;
}

export function deleteSession(tokenHash: string): void {
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

/** Housekeeping on login, so expired rows don't need a timer (see boundedMap's no-timers rationale). */
export function purgeExpiredSessions(nowIso: string): void {
  getDb().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso);
}
