import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { logger } from "../utils/logger";
import { seedCatalog } from "./catalog/seedCatalog";
import { ensureFinanceUser, ensureTestUser, seedSyntheticCustomers } from "./seedCustomers";
import { seedSalesHistory } from "./seedSalesHistory";

/**
 * SQLite via better-sqlite3: a real SQL database with no server to run, and
 * the only module that knows about it is `data/*Repository.ts`. Swapping in a
 * hosted database later is a change to those files, not to services.
 *
 * `DATABASE_PATH=:memory:` gives an isolated in-memory database, which is what
 * the black-box test suite uses. The path is read fresh on every init (like
 * `STORE_CONFIG_PATH`) so each test file can point at its own.
 */
let db: Database.Database | undefined;

const MIGRATIONS: string[] = [
  // v1: customers, addresses, sessions
  `
  CREATE TABLE customers (
    id                 TEXT PRIMARY KEY,
    email              TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash      TEXT NOT NULL,
    name               TEXT NOT NULL,
    phone              TEXT,
    preferred_store_id TEXT,
    marketing_opt_in   INTEGER NOT NULL DEFAULT 0,
    role               TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','store-manager','finance','admin')),
    status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    failed_logins      INTEGER NOT NULL DEFAULT 0,
    locked_until       TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
  );

  CREATE TABLE addresses (
    id          TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('shipping','billing')),
    recipient   TEXT NOT NULL,
    line1       TEXT NOT NULL,
    line2       TEXT,
    city        TEXT NOT NULL,
    region      TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country     TEXT NOT NULL,
    is_default  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX idx_addresses_customer ON addresses(customer_id);

  -- Only a SHA-256 of the bearer token is stored, so a leaked database
  -- can't be replayed as live sessions.
  CREATE TABLE sessions (
    token_hash  TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL
  );
  CREATE INDEX idx_sessions_customer ON sessions(customer_id);
  `,
  // v2: grocery catalog (products, dietary tags, full-text index)
  `
  CREATE TABLE products (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    brand            TEXT NOT NULL,
    is_private_label INTEGER NOT NULL,
    category         TEXT NOT NULL,
    subcategory      TEXT NOT NULL,
    subcategory_name TEXT NOT NULL,
    size_label       TEXT NOT NULL,
    sold_by          TEXT NOT NULL CHECK (sold_by IN ('each','weight')),
    price_minor      INTEGER NOT NULL CHECK (price_minor > 0),
    currency         TEXT NOT NULL DEFAULT 'USD',
    unit_minor       REAL NOT NULL,
    unit_label       TEXT NOT NULL,
    rating_avg       REAL NOT NULL,
    rating_count     INTEGER NOT NULL,
    snap_eligible    INTEGER NOT NULL,
    is_weekly_find   INTEGER NOT NULL,
    description      TEXT NOT NULL,
    stock            INTEGER NOT NULL CHECK (stock >= 0),
    tax_code         TEXT NOT NULL,
    age_restricted   INTEGER NOT NULL DEFAULT 0,
    emoji            TEXT NOT NULL,
    specs_json       TEXT NOT NULL,
    options_json     TEXT NOT NULL
  );
  CREATE INDEX idx_products_category ON products(category, subcategory);
  CREATE INDEX idx_products_brand ON products(brand);
  CREATE INDEX idx_products_price ON products(price_minor);

  CREATE TABLE product_tags (
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tag        TEXT NOT NULL,
    PRIMARY KEY (product_id, tag)
  );
  CREATE INDEX idx_product_tags_tag ON product_tags(tag);

  -- Porter stemming so "yogurts" finds "yogurt"; prefix matching handles search-as-you-type.
  CREATE VIRTUAL TABLE products_fts USING fts5(
    id UNINDEXED, name, brand, category_name, subcategory_name, description,
    tokenize = 'porter unicode61 remove_diacritics 2'
  );
  `,
  // v3: orders, order lines, invoices (one per order, per-store sequential numbers)
  `
  CREATE TABLE orders (
    id                TEXT PRIMARY KEY,
    customer_id       TEXT NOT NULL REFERENCES customers(id),
    cart_id           TEXT NOT NULL,
    store_id          TEXT NOT NULL,
    store_name        TEXT NOT NULL,
    tax_jurisdiction  TEXT NOT NULL,
    status            TEXT NOT NULL CHECK (status IN ('placed','payment_pending','cancelled')),
    currency          TEXT NOT NULL,
    subtotal_minor    INTEGER NOT NULL,
    tax_minor         INTEGER NOT NULL,
    total_minor       INTEGER NOT NULL,
    payment_method    TEXT NOT NULL,
    payment_status    TEXT NOT NULL,
    payment_reference TEXT,
    card_brand        TEXT,
    card_last4        TEXT,
    placed_at         TEXT NOT NULL
  );
  CREATE INDEX idx_orders_customer ON orders(customer_id, placed_at DESC);

  CREATE TABLE order_lines (
    order_id           TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    line_no            INTEGER NOT NULL,
    product_id         TEXT NOT NULL,
    name               TEXT NOT NULL,
    size_label         TEXT NOT NULL,
    sold_by            TEXT NOT NULL,
    quantity           INTEGER NOT NULL,
    unit_price_minor   INTEGER NOT NULL,
    net_minor          INTEGER NOT NULL,
    tax_code           TEXT NOT NULL,
    tax_rate_bps       INTEGER NOT NULL,
    tax_minor          INTEGER NOT NULL,
    configuration_json TEXT NOT NULL,
    PRIMARY KEY (order_id, line_no)
  );

  -- Legal invoice numbering is sequential per store with no gaps.
  CREATE TABLE invoice_sequences (
    store_id    TEXT PRIMARY KEY,
    last_number INTEGER NOT NULL
  );

  CREATE TABLE invoices (
    id            TEXT PRIMARY KEY,
    number        TEXT NOT NULL UNIQUE,
    order_id      TEXT NOT NULL UNIQUE REFERENCES orders(id),
    customer_id   TEXT NOT NULL REFERENCES customers(id),
    store_id      TEXT NOT NULL,
    store_name    TEXT NOT NULL,
    total_minor   INTEGER NOT NULL,
    currency      TEXT NOT NULL,
    issued_at     TEXT NOT NULL,
    snapshot_json TEXT NOT NULL
  );
  CREATE INDEX idx_invoices_customer ON invoices(customer_id, issued_at DESC);
  `,
  // v4: saved payment methods, password reset tokens, and expanded order statuses
  `
  CREATE TABLE saved_payment_methods (
    id          TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    token       TEXT NOT NULL,
    brand       TEXT NOT NULL,
    last4       TEXT NOT NULL,
    exp_month   INTEGER NOT NULL,
    exp_year    INTEGER NOT NULL,
    is_default  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX idx_saved_payments_customer ON saved_payment_methods(customer_id);

  CREATE TABLE password_reset_tokens (
    id          TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    expires_at  TEXT NOT NULL,
    used_at     TEXT,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX idx_reset_tokens_customer ON password_reset_tokens(customer_id);
  CREATE INDEX idx_reset_tokens_token ON password_reset_tokens(token);

  CREATE TABLE orders_v4 (
    id                TEXT PRIMARY KEY,
    customer_id       TEXT NOT NULL REFERENCES customers(id),
    cart_id           TEXT NOT NULL,
    store_id          TEXT NOT NULL,
    store_name        TEXT NOT NULL,
    tax_jurisdiction  TEXT NOT NULL,
    status            TEXT NOT NULL CHECK (status IN ('placed','payment_pending','packed','ready','collected','cancelled','refunded')),
    currency          TEXT NOT NULL,
    subtotal_minor    INTEGER NOT NULL,
    tax_minor         INTEGER NOT NULL,
    total_minor       INTEGER NOT NULL,
    payment_method    TEXT NOT NULL,
    payment_status    TEXT NOT NULL,
    payment_reference TEXT,
    card_brand        TEXT,
    card_last4        TEXT,
    placed_at         TEXT NOT NULL
  );
  INSERT INTO orders_v4 SELECT * FROM orders;
  DROP TABLE orders;
  ALTER TABLE orders_v4 RENAME TO orders;
  CREATE INDEX idx_orders_customer ON orders(customer_id, placed_at DESC);
  `,
  // v5: store inventory, goods receipts (GRN), batches, transfers, and adjustments
  `
  CREATE TABLE store_inventory (
    store_id             TEXT NOT NULL,
    product_id           TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    stock                INTEGER NOT NULL DEFAULT 0,
    reserved             INTEGER NOT NULL DEFAULT 0,
    unit_cost_minor      INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold  INTEGER NOT NULL DEFAULT 10,
    updated_at           TEXT NOT NULL,
    PRIMARY KEY (store_id, product_id)
  );
  CREATE INDEX idx_store_inventory_lookup ON store_inventory(store_id, product_id);

  CREATE TABLE grn_sequences (
    store_id    TEXT PRIMARY KEY,
    last_number INTEGER NOT NULL
  );

  CREATE TABLE goods_receipts (
    id                TEXT PRIMARY KEY,
    grn_number        TEXT NOT NULL UNIQUE,
    store_id          TEXT NOT NULL,
    supplier          TEXT NOT NULL,
    po_reference      TEXT NOT NULL,
    status            TEXT NOT NULL CHECK (status IN ('draft', 'received', 'cancelled')),
    total_cost_minor  INTEGER NOT NULL,
    received_by       TEXT NOT NULL,
    received_at       TEXT NOT NULL,
    notes             TEXT
  );
  CREATE INDEX idx_goods_receipts_store ON goods_receipts(store_id, received_at DESC);

  CREATE TABLE goods_receipt_items (
    id                TEXT PRIMARY KEY,
    grn_id            TEXT NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
    product_id        TEXT NOT NULL REFERENCES products(id),
    quantity          INTEGER NOT NULL,
    unit_cost_minor   INTEGER NOT NULL,
    batch_number      TEXT NOT NULL,
    expiry_date       TEXT NOT NULL,
    created_at        TEXT NOT NULL
  );
  CREATE INDEX idx_grn_items_receipt ON goods_receipt_items(grn_id);
  CREATE INDEX idx_grn_items_product ON goods_receipt_items(product_id);

  CREATE TABLE stock_transfers (
    id                TEXT PRIMARY KEY,
    transfer_number   TEXT NOT NULL UNIQUE,
    from_store_id     TEXT NOT NULL,
    to_store_id       TEXT NOT NULL,
    product_id        TEXT NOT NULL REFERENCES products(id),
    quantity          INTEGER NOT NULL,
    status            TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled')),
    created_at        TEXT NOT NULL,
    completed_at      TEXT
  );
  CREATE INDEX idx_transfers_stores ON stock_transfers(from_store_id, to_store_id);

  CREATE TABLE stock_adjustments (
    id                TEXT PRIMARY KEY,
    store_id          TEXT NOT NULL,
    product_id        TEXT NOT NULL REFERENCES products(id),
    quantity_delta    INTEGER NOT NULL,
    reason            TEXT NOT NULL CHECK (reason IN ('shrinkage', 'damage', 'expired', 'audit')),
    adjusted_by       TEXT NOT NULL,
    created_at        TEXT NOT NULL
  );
  CREATE INDEX idx_adjustments_store ON stock_adjustments(store_id, created_at DESC);
  `,
  // v6: performance indices for accounting ledger queries and aggregate reporting
  `
  CREATE INDEX IF NOT EXISTS idx_orders_placed_at ON orders(placed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_orders_store_placed ON orders(store_id, placed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_order_lines_prod ON order_lines(product_id);
  CREATE INDEX IF NOT EXISTS idx_invoices_store ON invoices(store_id, issued_at DESC);
  CREATE INDEX IF NOT EXISTS idx_invoices_issued ON invoices(issued_at DESC);
  `,
  // v7: update customers CHECK constraint to include 'finance' role
  `
  CREATE TABLE customers_v7 (
    id                 TEXT PRIMARY KEY,
    email              TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash      TEXT NOT NULL,
    name               TEXT NOT NULL,
    phone              TEXT,
    preferred_store_id TEXT,
    marketing_opt_in   INTEGER NOT NULL DEFAULT 0,
    role               TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','store-manager','finance','admin')),
    status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    failed_logins      INTEGER NOT NULL DEFAULT 0,
    locked_until       TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
  );
  INSERT INTO customers_v7 SELECT * FROM customers;
  DROP TABLE customers;
  ALTER TABLE customers_v7 RENAME TO customers;
  `,
  // v8: Conversational AI, RAG messages, and human-in-the-loop action drafts (WS N)
  `
  CREATE TABLE ai_conversations (
    id          TEXT PRIMARY KEY,
    customer_id TEXT,
    persona     TEXT NOT NULL CHECK (persona IN ('shopper', 'store_manager', 'support_desk')),
    title       TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX idx_ai_conversations_customer ON ai_conversations(customer_id, updated_at DESC);

  CREATE TABLE ai_messages (
    id                TEXT PRIMARY KEY,
    conversation_id   TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content           TEXT NOT NULL,
    tool_calls_json   TEXT,
    tool_results_json TEXT,
    created_at        TEXT NOT NULL
  );
  CREATE INDEX idx_ai_messages_conv ON ai_messages(conversation_id, created_at ASC);

  CREATE TABLE ai_action_drafts (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE SET NULL,
    customer_id     TEXT NOT NULL,
    action_type     TEXT NOT NULL CHECK (action_type IN ('refund', 'reschedule', 'transfer')),
    parameters_json TEXT NOT NULL,
    reason          TEXT NOT NULL,
    risk_score      REAL NOT NULL DEFAULT 0.0,
    status          TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    supervisor_id   TEXT,
    created_at      TEXT NOT NULL,
    reviewed_at     TEXT
  );
  CREATE INDEX idx_ai_action_drafts_status ON ai_action_drafts(status, created_at DESC);
  `,
];

function migrate(conn: Database.Database): void {
  const current = conn.pragma("user_version", { simple: true }) as number;
  for (let version = current; version < MIGRATIONS.length; version++) {
    conn.pragma("foreign_keys = OFF");
    conn.transaction(() => {
      conn.exec(MIGRATIONS[version] as string);
      conn.pragma(`user_version = ${version + 1}`);
    })();
    conn.pragma("foreign_keys = ON");
  }
}

export function getDb(): Database.Database {
  if (!db) throw new Error("Database not initialised - call initDatabase() first");
  return db;
}

/** Called from `createApp()`. Closes any previous handle so tests can re-launch. */
export function initDatabase(): Database.Database {
  db?.close();

  const file = process.env.DATABASE_PATH ?? path.resolve(process.cwd(), "data", "app.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });

  db = new Database(file);
  db.pragma("foreign_keys = ON");
  migrate(db);

  if (process.env.SEED_SYNTHETIC_DATA !== "false") {
    const seeded = seedSyntheticCustomers(db);
    if (seeded > 0) {
      logger.info("Database", `Seeded ${seeded} synthetic customers (see docs for the demo credentials)`);
    }
    if (ensureTestUser(db)) logger.info("Database", "Seeded test account testuser@mydomain.com");
    if (ensureFinanceUser(db)) logger.info("Database", "Seeded finance account finance@example.com");
    const products = seedCatalog(db);
    if (products > 0) logger.info("Database", `Seeded ${products} synthetic grocery products`);
    const sales = seedSalesHistory(db);
    if (sales > 0) logger.info("Database", `Seeded ${sales} historical transactions across ~12 months (DATA-03)`);
  }
  return db;
}
