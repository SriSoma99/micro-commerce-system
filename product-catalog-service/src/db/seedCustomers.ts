import type Database from "better-sqlite3";
import { hashPasswordSync } from "../utils/passwordHasher";

/**
 * Synthetic demo data - no real people. Emails use the reserved `example.com`
 * domain, names/streets are invented, and generation is index-based so the
 * dataset is identical on every boot.
 *
 * Every synthetic account shares one password (hashed once at boot with a
 * random salt), which is fine for demo data and keeps boot to one scrypt call.
 */
export const SYNTHETIC_PASSWORD = "Demo@1234";

const CREATED_BASE = Date.parse("2026-01-05T09:00:00.000Z");
const DAY_MS = 86_400_000;

const FIRST_NAMES = ["Emma", "Liam", "Olivia", "Noah", "Ava", "Ethan", "Sophia", "Mason", "Isabella", "Logan", "Mia", "Lucas"];
const LAST_NAMES = ["Johnson", "Miller", "Davis", "Wilson", "Anderson", "Thomas", "Moore", "Taylor", "Clark", "Lewis", "Walker", "Hall"];
const STREETS = ["Maple Ave", "Oak St", "Cedar Ln", "Elm Dr", "Lake Rd", "Park Blvd", "Hillcrest Ct", "River Rd"];
const PLACES = [
  { city: "Batavia", region: "IL", postalCode: "60510" },
  { city: "Aurora", region: "IL", postalCode: "60505" },
  { city: "Naperville", region: "IL", postalCode: "60540" },
  { city: "Columbus", region: "OH", postalCode: "43215" },
  { city: "Dayton", region: "OH", postalCode: "45402" },
  { city: "Toledo", region: "OH", postalCode: "43604" },
  { city: "Pittsburgh", region: "PA", postalCode: "15222" },
  { city: "Erie", region: "PA", postalCode: "16501" },
  { city: "Allentown", region: "PA", postalCode: "18101" },
];

interface SeedCustomer {
  id: string;
  email: string;
  name: string;
  role: "customer" | "store-manager" | "finance" | "admin";
  marketingOptIn: boolean;
}

function buildCustomers(): SeedCustomer[] {
  const named: SeedCustomer[] = [
    { id: "cust_demo", email: "demo@example.com", name: "Demo Shopper", role: "customer", marketingOptIn: true },
    { id: "cust_manager", email: "manager@example.com", name: "Morgan Store-Manager", role: "store-manager", marketingOptIn: false },
    { id: "cust_finance", email: "finance@example.com", name: "Finley Finance", role: "finance", marketingOptIn: false },
    { id: "cust_admin", email: "admin@example.com", name: "Alex Admin", role: "admin", marketingOptIn: false },
  ];

  const generated = Array.from({ length: 24 }, (_, i): SeedCustomer => {
    const first = FIRST_NAMES[i % FIRST_NAMES.length] as string;
    const last = LAST_NAMES[(i * 5 + 3) % LAST_NAMES.length] as string;
    return {
      id: `cust_${String(i + 1).padStart(4, "0")}`,
      email: `${first}.${last}${i + 1}@example.com`.toLowerCase(),
      name: `${first} ${last}`,
      role: "customer",
      marketingOptIn: i % 3 === 0,
    };
  });

  return [...named, ...generated];
}

/** Seeds only into an empty customers table. Returns how many were inserted. */
export function seedSyntheticCustomers(db: Database.Database): number {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM customers").get() as { count: number };
  if (count > 0) return 0;

  const passwordHash = hashPasswordSync(SYNTHETIC_PASSWORD);
  const insertCustomer = db.prepare(
    `INSERT INTO customers (id, email, password_hash, name, phone, marketing_opt_in, role, created_at, updated_at)
     VALUES (@id, @email, @passwordHash, @name, @phone, @marketingOptIn, @role, @createdAt, @createdAt)`
  );
  const insertAddress = db.prepare(
    `INSERT INTO addresses (id, customer_id, kind, recipient, line1, line2, city, region, postal_code, country, is_default, created_at)
     VALUES (@id, @customerId, @kind, @recipient, @line1, NULL, @city, @region, @postalCode, 'US', 1, @createdAt)`
  );

  const customers = buildCustomers();
  db.transaction(() => {
    customers.forEach((customer, index) => {
      const createdAt = new Date(CREATED_BASE + index * DAY_MS).toISOString();
      insertCustomer.run({
        id: customer.id,
        email: customer.email,
        passwordHash,
        name: customer.name,
        phone: `+1 555-01${String(index).padStart(2, "0")}`,
        marketingOptIn: customer.marketingOptIn ? 1 : 0,
        role: customer.role,
        createdAt,
      });

      const place = PLACES[index % PLACES.length] as (typeof PLACES)[number];
      const line1 = `${100 + index * 7} ${STREETS[index % STREETS.length] as string}`;
      const address = { customerId: customer.id, recipient: customer.name, line1, createdAt, ...place };
      insertAddress.run({ ...address, id: `addr_${customer.id}_s`, kind: "shipping" });
      // Every third customer also has a distinct billing address on file.
      if (index % 3 === 0) {
        insertAddress.run({ ...address, id: `addr_${customer.id}_b`, kind: "billing" });
      }
    });
  })();

  return customers.length;
}

/**
 * A fixed, documented test account for demos and manual testing. Its password
 * is deliberately trivial (it would fail registration's policy, which only
 * applies to new sign-ups) - it exists only when synthetic seeding is on, and
 * is created if missing even in a database that was seeded earlier.
 */
export const TEST_USER = { email: "testuser@mydomain.com", password: "123456", name: "Test User" };

export function ensureTestUser(db: Database.Database): boolean {
  const exists = db.prepare("SELECT 1 FROM customers WHERE email = ?").get(TEST_USER.email);
  if (exists) return false;

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO customers (id, email, password_hash, name, phone, marketing_opt_in, role, created_at, updated_at)
       VALUES ('cust_testuser', ?, ?, ?, '+1 555-0199', 0, 'customer', ?, ?)`
    ).run(TEST_USER.email, hashPasswordSync(TEST_USER.password), TEST_USER.name, now, now);
    db.prepare(
      `INSERT INTO addresses (id, customer_id, kind, recipient, line1, line2, city, region, postal_code, country, is_default, created_at)
       VALUES ('addr_cust_testuser_s', 'cust_testuser', 'shipping', ?, '742 Evergreen Terrace', NULL, 'Batavia', 'IL', '60510', 'US', 1, ?)`
    ).run(TEST_USER.name, now);
  })();
  return true;
}

export function ensureFinanceUser(db: Database.Database): boolean {
  const exists = db.prepare("SELECT 1 FROM customers WHERE email = ?").get("finance@example.com");
  if (exists) return false;

  const now = new Date().toISOString();
  const passwordHash = hashPasswordSync(SYNTHETIC_PASSWORD);
  db.transaction(() => {
    db.prepare(
      `INSERT INTO customers (id, email, password_hash, name, phone, marketing_opt_in, role, created_at, updated_at)
       VALUES ('cust_finance', 'finance@example.com', ?, 'Finley Finance', '+1 555-0188', 0, 'finance', ?, ?)`
    ).run(passwordHash, now, now);
    db.prepare(
      `INSERT INTO addresses (id, customer_id, kind, recipient, line1, line2, city, region, postal_code, country, is_default, created_at)
       VALUES ('addr_cust_finance_s', 'cust_finance', 'shipping', 'Finley Finance', '100 Financial Way', NULL, 'Chicago', 'IL', '60601', 'US', 1, ?)`
    ).run(now);
  })();
  return true;
}
