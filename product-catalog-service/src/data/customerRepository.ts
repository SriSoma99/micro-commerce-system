import { randomUUID } from "node:crypto";
import { getDb } from "../db/database";
import { Customer, CustomerRole } from "../types/customer";

interface CustomerRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  phone: string | null;
  preferred_store_id: string | null;
  marketing_opt_in: number;
  role: CustomerRole;
  status: "active" | "deleted";
  failed_logins: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

/** Login bookkeeping that must never leave the data/service layers. */
export interface CustomerAuthRecord {
  customer: Customer;
  passwordHash: string;
  failedLogins: number;
  lockedUntil: string | null;
}

export interface ProfilePatch {
  name?: string;
  phone?: string | null;
  preferredStoreId?: string | null;
  marketingOptIn?: boolean;
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    preferredStoreId: row.preferred_store_id,
    marketingOptIn: row.marketing_opt_in === 1,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAuthRecord(row: CustomerRow): CustomerAuthRecord {
  return {
    customer: toCustomer(row),
    passwordHash: row.password_hash,
    failedLogins: row.failed_logins,
    lockedUntil: row.locked_until,
  };
}

export function findAuthByEmail(email: string): CustomerAuthRecord | undefined {
  const row = getDb().prepare("SELECT * FROM customers WHERE email = ?").get(email) as CustomerRow | undefined;
  return row ? toAuthRecord(row) : undefined;
}

export function findAuthById(id: string): CustomerAuthRecord | undefined {
  const row = getDb().prepare("SELECT * FROM customers WHERE id = ?").get(id) as CustomerRow | undefined;
  return row ? toAuthRecord(row) : undefined;
}

/** Active customers only - a deleted (anonymized) account is invisible. */
export function findCustomerById(id: string): Customer | undefined {
  const row = getDb().prepare("SELECT * FROM customers WHERE id = ? AND status = 'active'").get(id) as
    | CustomerRow
    | undefined;
  return row ? toCustomer(row) : undefined;
}

export function findCustomerByEmail(email: string): Customer | undefined {
  const row = getDb().prepare("SELECT * FROM customers WHERE LOWER(email) = LOWER(?) AND status = 'active'").get(email) as
    | CustomerRow
    | undefined;
  return row ? toCustomer(row) : undefined;
}

export function updateCustomerPasswordHash(id: string, newHash: string): void {
  getDb().prepare("UPDATE customers SET password_hash = ?, updated_at = ? WHERE id = ?").run(newHash, new Date().toISOString(), id);
}

/** Returns the new customer, or `"EMAIL_TAKEN"` when the (case-insensitive) email is already registered. */
export function insertCustomer(input: {
  email: string;
  passwordHash: string;
  name: string;
  role?: CustomerRole;
}): Customer | "EMAIL_TAKEN" {
  const now = new Date().toISOString();
  const id = `cust_${randomUUID()}`;
  const role = input.role ?? "customer";
  try {
    getDb()
      .prepare(
        `INSERT INTO customers (id, email, password_hash, name, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.email, input.passwordHash, input.name, role, now, now);
  } catch (err) {
    if ((err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") return "EMAIL_TAKEN";
    throw err;
  }
  return findCustomerById(id) as Customer;
}

export function updateProfile(id: string, patch: ProfilePatch): Customer | undefined {
  const current = findCustomerById(id);
  if (!current) return undefined;

  const next = {
    name: patch.name ?? current.name,
    phone: patch.phone === undefined ? current.phone : patch.phone,
    preferredStoreId: patch.preferredStoreId === undefined ? current.preferredStoreId : patch.preferredStoreId,
    marketingOptIn: patch.marketingOptIn ?? current.marketingOptIn,
  };

  getDb()
    .prepare(
      `UPDATE customers
          SET name = ?, phone = ?, preferred_store_id = ?, marketing_opt_in = ?, updated_at = ?
        WHERE id = ?`
    )
    .run(next.name, next.phone, next.preferredStoreId, next.marketingOptIn ? 1 : 0, new Date().toISOString(), id);

  return findCustomerById(id);
}

/**
 * Counts a failed login and, on reaching `maxAttempts`, locks the account
 * until `lockUntil` and resets the counter. One transaction so concurrent
 * failures can't both slip under the threshold.
 */
export function recordFailedLogin(id: string, maxAttempts: number, lockUntil: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE customers SET failed_logins = failed_logins + 1 WHERE id = ?").run(id);
    db.prepare("UPDATE customers SET locked_until = ?, failed_logins = 0 WHERE id = ? AND failed_logins >= ?").run(
      lockUntil,
      id,
      maxAttempts
    );
  })();
}

export function clearLoginState(id: string): void {
  getDb().prepare("UPDATE customers SET failed_logins = 0, locked_until = NULL WHERE id = ?").run(id);
}

/**
 * Account deletion = anonymization. The row is kept (orders and tax records
 * must survive) but every personal field is scrubbed and the password hash is
 * replaced with a value no password can ever verify against.
 */
export function anonymizeCustomer(id: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `UPDATE customers
          SET email = ?, name = 'Deleted customer', phone = NULL, preferred_store_id = NULL,
              marketing_opt_in = 0, password_hash = '!', status = 'deleted',
              failed_logins = 0, locked_until = NULL, updated_at = ?
        WHERE id = ?`
    ).run(`deleted+${id}@deleted.invalid`, new Date().toISOString(), id);
    db.prepare("DELETE FROM addresses WHERE customer_id = ?").run(id);
    db.prepare("DELETE FROM sessions WHERE customer_id = ?").run(id);
  })();
}
