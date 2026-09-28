import { getDb } from "../db/database";
import { DEPARTMENT_BY_ID } from "../db/catalog/taxonomy";
import { ProductDetail, ProductListPage, ProductQuery } from "../types/product";
import { ProductRow, loadTags, rowToDetail } from "./productMapper";
import { queryDepartments, queryProducts } from "./productQuery";

/**
 * Catalog persistence. The data lives in SQLite (see `db/database.ts`); this
 * module and `productQuery.ts` are the only places that know that. Swapping in
 * a hosted database or a search engine means changing these files, not the
 * service layer.
 */

/**
 * Injects configurable network jitter and a configurable random failure rate so
 * the circuit breaker in the service layer has real conditions to react to
 * instead of only being exercisable via manual test toggles.
 */
async function simulateDatabaseConditions(): Promise<void> {
  // Random latency between 100ms and DB_SIMULATED_LATENCY_MAX_MS (default 1900);
  // 0 disables it. Both knobs are read fresh on every call.
  const maxLatencyMs = Number(process.env.DB_SIMULATED_LATENCY_MAX_MS ?? 1900);
  if (maxLatencyMs > 0) {
    const minLatencyMs = Math.min(100, maxLatencyMs);
    const latencyMs = minLatencyMs + Math.floor(Math.random() * (maxLatencyMs - minLatencyMs + 1));
    await new Promise((resolve) => setTimeout(resolve, latencyMs));
  }

  const FAILURE_RATE = Number(process.env.DB_SIMULATED_FAILURE_RATE ?? 0.25);
  if (Math.random() < FAILURE_RATE) {
    throw new Error("ProductRepository: simulated downstream datastore timeout");
  }
}

export async function findProductPage(query: ProductQuery): Promise<ProductListPage> {
  await simulateDatabaseConditions();
  return queryProducts(getDb(), query);
}

export async function findProductById(id: string, storeId?: string): Promise<ProductDetail | undefined> {
  await simulateDatabaseConditions();
  const db = getDb();
  const sql = storeId
    ? `SELECT p.*, si.store_id, COALESCE(si.stock, p.stock) AS store_stock, COALESCE(si.reserved, 0) AS store_reserved
       FROM products p
       LEFT JOIN store_inventory si ON si.product_id = p.id AND si.store_id = ?
       WHERE p.id = ?`
    : "SELECT * FROM products WHERE id = ?";
  const row = storeId
    ? (db.prepare(sql).get(storeId, id) as ProductRow | undefined)
    : (db.prepare(sql).get(id) as ProductRow | undefined);
  return row ? rowToDetail(row, loadTags(db, [id]).get(id) ?? []) : undefined;
}

// ---- Stale snapshot (circuit-breaker fallback) --------------------------------------

let snapshot: ProductDetail[] | undefined;
let snapshotOwner: unknown;

/**
 * Loads the whole catalog into memory. Done at boot so the fallback path never
 * has to touch the database at the moment the database is misbehaving. Call it
 * again after any write that changes prices or stock.
 */
export function warmCatalogSnapshot(): void {
  const db = getDb();
  const tags = loadTags(db);
  const rows = db.prepare("SELECT * FROM products ORDER BY id").all() as ProductRow[];
  snapshot = rows.map((row) => rowToDetail(row, tags.get(row.id) ?? []));
  snapshotOwner = db;
}

/**
 * Synchronous, latency-free accessor used exclusively to build the circuit
 * breaker's stale-cache fallback payload. Bypassing the failure injector
 * here is intentional: a fallback path must never itself be able to fail.
 */
export function getStaticSnapshot(): ProductDetail[] {
  if (!snapshot || snapshotOwner !== getDb()) warmCatalogSnapshot();
  return snapshot as ProductDetail[];
}

// ---- Reads that are not breaker-protected --------------------------------------------
// Static-ish reference data (images, navigation): cheap, no downstream to fail.

export interface ProductImageSpec {
  emoji: string;
  name: string;
  brand: string;
  sizeLabel: string;
  colors: [string, string];
}

export function findProductImageSpec(id: string): ProductImageSpec | undefined {
  const row = getDb().prepare("SELECT emoji, name, brand, size_label, category FROM products WHERE id = ?").get(id) as
    | { emoji: string; name: string; brand: string; size_label: string; category: keyof typeof DEPARTMENT_BY_ID }
    | undefined;
  if (!row) return undefined;
  return {
    emoji: row.emoji,
    name: row.name,
    brand: row.brand,
    sizeLabel: row.size_label,
    colors: DEPARTMENT_BY_ID[row.category].colors,
  };
}

export function findDepartmentTree(): ReturnType<typeof queryDepartments> {
  return queryDepartments(getDb());
}
