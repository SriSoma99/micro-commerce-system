import { randomUUID } from "node:crypto";
import { getDb } from "../db/database";
import { Address, AddressKind, NewAddress } from "../types/customer";

interface AddressRow {
  id: string;
  customer_id: string;
  kind: AddressKind;
  recipient: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  is_default: number;
  created_at: string;
}

function toAddress(row: AddressRow): Address {
  return {
    id: row.id,
    customerId: row.customer_id,
    kind: row.kind,
    recipient: row.recipient,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    country: row.country,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
  };
}

export function listAddresses(customerId: string): Address[] {
  const rows = getDb()
    .prepare("SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_default DESC, created_at ASC, id ASC")
    .all(customerId) as AddressRow[];
  return rows.map(toAddress);
}

/** Scoped by owner: another customer's address id resolves to `undefined`, same as a nonexistent one. */
export function findAddress(customerId: string, id: string): Address | undefined {
  const row = getDb().prepare("SELECT * FROM addresses WHERE id = ? AND customer_id = ?").get(id, customerId) as
    | AddressRow
    | undefined;
  return row ? toAddress(row) : undefined;
}

export function countAddresses(customerId: string): number {
  const { count } = getDb().prepare("SELECT COUNT(*) AS count FROM addresses WHERE customer_id = ?").get(customerId) as {
    count: number;
  };
  return count;
}

function clearDefault(customerId: string, kind: AddressKind, exceptId: string): void {
  getDb()
    .prepare("UPDATE addresses SET is_default = 0 WHERE customer_id = ? AND kind = ? AND id <> ?")
    .run(customerId, kind, exceptId);
}

/** The first address of a kind is always the default; otherwise `isDefault` takes it over from the previous one. */
export function insertAddress(customerId: string, country: string, input: NewAddress): Address {
  const db = getDb();
  const id = `addr_${randomUUID()}`;

  db.transaction(() => {
    const { count } = db
      .prepare("SELECT COUNT(*) AS count FROM addresses WHERE customer_id = ? AND kind = ?")
      .get(customerId, input.kind) as { count: number };
    const isDefault = count === 0 || input.isDefault;

    db.prepare(
      `INSERT INTO addresses (id, customer_id, kind, recipient, line1, line2, city, region, postal_code, country, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      customerId,
      input.kind,
      input.recipient,
      input.line1,
      input.line2,
      input.city,
      input.region,
      input.postalCode,
      country,
      isDefault ? 1 : 0,
      new Date().toISOString()
    );
    if (isDefault) clearDefault(customerId, input.kind, id);
  })();

  return findAddress(customerId, id) as Address;
}

/** `kind` is immutable: changing it could orphan the old kind's default. */
export function updateAddress(customerId: string, id: string, next: Omit<NewAddress, "kind">): Address | undefined {
  const db = getDb();
  const current = findAddress(customerId, id);
  if (!current) return undefined;

  db.transaction(() => {
    db.prepare(
      `UPDATE addresses
          SET recipient = ?, line1 = ?, line2 = ?, city = ?, region = ?, postal_code = ?, is_default = ?
        WHERE id = ? AND customer_id = ?`
    ).run(
      next.recipient,
      next.line1,
      next.line2,
      next.city,
      next.region,
      next.postalCode,
      next.isDefault ? 1 : 0,
      id,
      customerId
    );
    if (next.isDefault) clearDefault(customerId, current.kind, id);
  })();

  return findAddress(customerId, id);
}

/** Deleting a default promotes the newest remaining address of the same kind. */
export function deleteAddress(customerId: string, id: string): boolean {
  const db = getDb();
  const current = findAddress(customerId, id);
  if (!current) return false;

  db.transaction(() => {
    db.prepare("DELETE FROM addresses WHERE id = ? AND customer_id = ?").run(id, customerId);
    if (current.isDefault) {
      db.prepare(
        `UPDATE addresses SET is_default = 1
          WHERE id = (SELECT id FROM addresses WHERE customer_id = ? AND kind = ? ORDER BY created_at DESC, id DESC LIMIT 1)`
      ).run(customerId, current.kind);
    }
  })();
  return true;
}
