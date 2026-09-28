import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "../db/database";
import { findCustomerByEmail, updateCustomerPasswordHash } from "../data/customerRepository";
import { hashPassword } from "../utils/passwordHasher";
import { getEmailProvider } from "../platform/email/emailProvider";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface PasswordResetRow {
  id: string;
  customer_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export async function requestPasswordReset(email: string): Promise<{ success: boolean; resetToken?: string }> {
  const customer = findCustomerByEmail(email);
  if (!customer) {
    // Avoid email enumeration, return success true
    return { success: true };
  }

  const token = randomBytes(32).toString("hex");
  const id = `prt_${randomUUID()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS).toISOString();
  const createdAt = now.toISOString();

  const db = getDb();
  db.prepare(
    `INSERT INTO password_reset_tokens (id, customer_id, token, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, customer.id, token, expiresAt, createdAt);

  const emailProvider = getEmailProvider();
  await emailProvider.sendEmail({
    to: customer.email,
    subject: "Reset your password",
    body: `You requested a password reset. Use token: ${token} to reset your password. It expires in 1 hour.`,
  });

  return { success: true, resetToken: token };
}

export async function resetPasswordWithToken(token: string, newPlainPassword: string): Promise<{ ok: boolean; message: string; code?: string }> {
  if (!token || !newPlainPassword || newPlainPassword.length < 8) {
    return { ok: false, message: "Invalid token or password too short (min 8 characters)", code: "INVALID_INPUT" };
  }

  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM password_reset_tokens WHERE token = ?`)
    .get(token) as PasswordResetRow | undefined;

  if (!row) {
    return { ok: false, message: "Invalid or expired reset token", code: "INVALID_TOKEN" };
  }

  if (row.used_at !== null) {
    return { ok: false, message: "Reset token has already been used", code: "TOKEN_ALREADY_USED" };
  }

  const now = new Date().toISOString();
  if (row.expires_at < now) {
    return { ok: false, message: "Reset token has expired", code: "TOKEN_EXPIRED" };
  }

  const newHash = await hashPassword(newPlainPassword);
  updateCustomerPasswordHash(row.customer_id, newHash);

  db.prepare(`UPDATE password_reset_tokens SET used_at = ? WHERE id = ?`).run(now, row.id);

  return { ok: true, message: "Password updated successfully" };
}
