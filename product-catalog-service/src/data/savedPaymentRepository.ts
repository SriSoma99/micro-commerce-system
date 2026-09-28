import { randomUUID } from "node:crypto";
import { getDb } from "../db/database";

export interface SavedPaymentMethod {
  id: string;
  customerId: string;
  token: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
  createdAt: string;
}

interface SavedPaymentRow {
  id: string;
  customer_id: string;
  token: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: number;
  created_at: string;
}

function toSavedPayment(row: SavedPaymentRow): SavedPaymentMethod {
  return {
    id: row.id,
    customerId: row.customer_id,
    token: row.token,
    brand: row.brand,
    last4: row.last4,
    expMonth: row.exp_month,
    expYear: row.exp_year,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
  };
}

export function listSavedPaymentMethods(customerId: string): SavedPaymentMethod[] {
  const rows = getDb()
    .prepare("SELECT * FROM saved_payment_methods WHERE customer_id = ? ORDER BY is_default DESC, created_at DESC")
    .all(customerId) as SavedPaymentRow[];
  return rows.map(toSavedPayment);
}

export function savePaymentMethod(
  customerId: string,
  input: { token: string; brand: string; last4: string; expMonth: number; expYear: number; isDefault?: boolean }
): SavedPaymentMethod {
  const db = getDb();
  const id = `pm_${randomUUID()}`;
  const now = new Date().toISOString();
  const isDefault = input.isDefault ?? false;

  db.transaction(() => {
    if (isDefault) {
      db.prepare("UPDATE saved_payment_methods SET is_default = 0 WHERE customer_id = ?").run(customerId);
    }
    db.prepare(
      `INSERT INTO saved_payment_methods (id, customer_id, token, brand, last4, exp_month, exp_year, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, customerId, input.token, input.brand, input.last4, input.expMonth, input.expYear, isDefault ? 1 : 0, now);
  })();

  const row = db.prepare("SELECT * FROM saved_payment_methods WHERE id = ?").get(id) as SavedPaymentRow;
  return toSavedPayment(row);
}

export function deleteSavedPaymentMethod(customerId: string, methodId: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM saved_payment_methods WHERE id = ? AND customer_id = ?")
    .run(methodId, customerId);
  return result.changes > 0;
}

export function setDefaultPaymentMethod(customerId: string, methodId: string): boolean {
  const db = getDb();
  let updated = false;
  db.transaction(() => {
    db.prepare("UPDATE saved_payment_methods SET is_default = 0 WHERE customer_id = ?").run(customerId);
    const res = db
      .prepare("UPDATE saved_payment_methods SET is_default = 1 WHERE id = ? AND customer_id = ?")
      .run(methodId, customerId);
    updated = res.changes > 0;
  })();
  return updated;
}
