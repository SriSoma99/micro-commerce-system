# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a three-service monorepo with **no root package.json or workspace
tooling** — each service (and the test suite) is built, linted, and run
independently from its own directory.

- `product-catalog-service/` — Express + TypeScript REST API (Node 22)
- `payment-simulator/` — Express + TypeScript local **dummy payment gateway** (Stripe-style sandbox, port 5002; no real money ever moves)
- `storefront-client/` — React 19 + TypeScript SPA (Vite)
- `testcase/` — Jest + Supertest black-box automation suite for the API (see below)
- `docs/` — Mermaid architecture diagrams (application, UI, database) — no code — plus
  `docs/req/requirements.md`, the requirements/status tracker and the **parallel-workstream
  plan** (who can work on what, migration-slot and TC-id claims, conflict hotspots). Check it
  before starting a feature and update your rows when you finish
- `docker-compose.yml` — orchestrates the services as containers (backend on 5001, payment simulator on 5002, frontend on 3000)

## Commands

### product-catalog-service

Run from `product-catalog-service/`:

```bash
npm run dev         # ts-node-dev with hot reload, http://localhost:5001
npm run build        # tsc -p tsconfig.json -> dist/
npm run start        # node dist/server.js (requires build first)
npm run typecheck    # tsc --noEmit
```

There is no test runner configured *inside* this service — it's tested
externally, as a black box, by `testcase/` (see below).

Environment: copy `.env.example` to `.env`. `DB_SIMULATED_FAILURE_RATE`
(0–1, default 0.25) controls how often the mock repository throws, which
is what drives the circuit breaker's state transitions — raise it to force
the breaker open during manual testing.

If `npm run dev` (`ts-node-dev`) crashes immediately with
`TypeError: Cannot read properties of undefined (reading 'fileExists')`,
that's a `ts-node@10.9.2` / TypeScript 7 incompatibility (the package
currently pins `typescript@^5.9.3`, where it doesn't occur), a dependency
problem, not something to work around in source — run
`npm run build && npm run start` (or reinstall a compatible
`ts-node`/`typescript` pair) instead of chasing it in application code.

### payment-simulator

Run from `payment-simulator/` (same script names as the catalog service; no
test runner of its own — it's exercised by `testcase/`):

```bash
npm run dev         # ts-node-dev, http://localhost:5002
npm run build        # tsc -> dist/
npm run start        # node dist/server.js
npm run typecheck    # tsc --noEmit
```

Environment: see `payment-simulator/.env.example` (dummy `pk_test_dummy` /
`sk_test_dummy` keys, `PAYMENT_SIMULATION_LATENCY_MS`). For checkout to work
outside Docker, run it alongside the catalog service (which finds it via
`PAYMENT_GATEWAY_URL`, default `http://localhost:5002`).

### storefront-client

Run from `storefront-client/`:

```bash
npm run dev         # Vite dev server, http://localhost:5173
npm run build        # tsc -b && vite build -> dist/
npm run lint         # oxlint
npm test             # vitest run (jsdom + Testing Library)
npx vitest run src/api/client.test.ts   # a single test file
npm run preview      # serve the production build locally
```

Unit/component tests are co-located (`*.test.ts(x)` next to the source).
`src/test/network.ts` `mockNetwork({"METHOD url-fragment": handler})` stubs
`fetch` and records calls; `src/test/fixtures.ts` holds shared fixtures. The
whole frontend talks to the API via `src/api/client.ts` `apiRequest` (returns
a discriminated `ok` / `ApiError` result carrying the `ResilientPayload`
fields) — new fetches should go through it rather than raw `fetch`.

### testcase

Run from `testcase/`:

```bash
npm test            # pretest builds product-catalog-service AND payment-simulator, then runs Jest
npx jest tests/product-list.test.ts    # run a single suite (skips the pretest build if dist/ is already current)
```

Takes ~25-30s — `circuit-breaker.test.ts` genuinely waits out the
production 15s `resetTimeout`, it isn't shortened for the test run. See
`testcase/README.md` for the full test case index (IDs, file, what each
one checks).

Environment: `VITE_API_BASE_URL` (see `.env.example`) points the client at
the catalog API; defaults to `http://localhost:5001/api`.

### CI: build + prove nothing broke

Run from the repo root:

```bash
bash scripts/ci.sh            # backend + frontend
bash scripts/ci.sh backend    # typecheck (catalog + simulator), build, black-box suite (~35s)
bash scripts/ci.sh frontend   # lint + vitest + production build
```

`.github/workflows/ci.yml` calls this same script (jobs: backend, frontend,
then `docker compose build` only after both pass), so local runs and CI
can't drift. Locally it installs deps only if `node_modules` is missing;
with `CI=true` it uses a clean `npm ci`.

### Full stack via Docker

```bash
docker compose up -d --build     # from repo root
docker compose logs -f product-catalog-service   # watch breaker state transitions
docker compose down              # keeps the catalog-data volume (DB + store config)
docker compose down -v           # ...and also wipes it (back to "not installed")
```

- The backend image is **Node 22** (`opossum@10` and `better-sqlite3@13` both
  require it; Node 20 is EOL). Its Dockerfile installs with `--ignore-scripts`
  because `better-sqlite3` ships a prebuilt musl binary and the compile
  fallback needs a Python/g++ toolchain the Alpine image doesn't have.
- `/app/data` (SQLite `app.db` + `store.config.json`) is a named volume owned
  by the non-root `appuser`, so installs and customer data survive container
  recreation. Set `SETUP_TOKEN` in your shell/`.env` to know the install
  token up front; otherwise read it from `docker compose logs`.
  `SEED_SYNTHETIC_DATA` (default `true`) controls the demo customers.
- If host port 5001 is already taken (e.g. a local `npm run start`), the
  container fails to start; stop the local process or override the port.

## Architecture

### Backend layering (strict one-way dependency)

```
routes -> controllers -> services -> repository -> data
```

`src/routes/productRoutes.ts` maps HTTP verbs/paths to
`src/controllers/productController.ts`, which only translates HTTP
concerns (req/res, status codes) and delegates to
`src/services/catalogService.ts` for everything else. Controllers never
import the repository directly, and the repository has no awareness that
a circuit breaker sits in front of it. Swapping the SQLite catalog for a
hosted database or search engine only requires changing
`src/data/productRepository.ts` / `productQuery.ts`.

### Circuit breaker resilience (the core design element of this repo)

`catalogService.ts` wraps the repository's `findProductPage` (search/list)
and `findProductById` in **separate** Opossum `CircuitBreaker` instances
(isolated per capability so a burst of detail-page failures can't trip the
list endpoint's breaker). Options: `timeout: 2000`,
`errorThresholdPercentage: 50`, `resetTimeout: 15000`.

Fallback is implemented as a `try/catch` around `breaker.fire()` at each
call site rather than via Opossum's `.fallback()` registration. This is a
deliberate choice: `.fallback()` resolves `fire()` via a `fallback` event
on the breaker's shared `EventEmitter`, which cannot reliably distinguish
which concurrent caller a given fallback invocation belongs to. Catching
the rejection locally gives each call a deterministic `isFallback` flag.
When extending this service (e.g. adding a new endpoint), follow the same
per-call try/catch pattern rather than reaching for `.fallback()`.

Fallback data is `getStaticSnapshot()`: the whole catalog loaded into
memory at boot (`warmCatalogSnapshot()`, called from `createApp()`), so the
fallback path never touches the database while it is misbehaving. In
degraded mode the list endpoint still applies the same filters/sorts via
`data/snapshotSearch.ts`, but returns `facets: null` (stale data can't give
trustworthy counts) — `catalog-fallback.test.ts` asserts the SQL path and
the in-memory path return the same products so they can't drift. Call
`warmCatalogSnapshot()` again after any write that changes price or stock.
`shutdownCatalogBreakers()` clears the breakers' reset timers; `server.ts`
calls it on SIGTERM/SIGINT and tests call it in `afterAll` (otherwise the
15s timer fires into a torn-down Jest environment).

State transitions (`open` / `halfOpen` / `close`) are logged via
`src/utils/logger.ts`, which is the only place formatted/colored console
output should be produced — don't add ad hoc `console.log` elsewhere in
this service.

### The `ResilientPayload<T>` envelope

Every controller response is `{ data, isFallback, source, retrievedAt }`
(defined in both `product-catalog-service/src/types/product.ts` and
mirrored in `storefront-client/src/types/product.ts`). The frontend reads
`source`/`isFallback` from this envelope — not the HTTP status code — to
decide what the `StatusBadge` shows. Any new endpoint added to the catalog
service should return this same envelope shape for consistency with the
client's fetch/render assumptions.

### Cart & Checkout domain

A second bounded context sits alongside the product catalog, following the
same `routes -> controllers -> services -> repository -> data` layering:
`src/{routes,controllers,services,data}/cart*.ts` and `order*.ts`.

```
GET    /api/cart/:cartId
POST   /api/cart/:cartId/items          { productId, quantity, selectedConfiguration? }
PATCH  /api/cart/:cartId/items/:lineItemId   { quantity }
DELETE /api/cart/:cartId/items/:lineItemId
DELETE /api/cart/:cartId
```

- **Cart identity.** Carts are still anonymous: the client generates a UUID
  once (`storefront-client/src/utils/cartId.ts`, `crypto.randomUUID()`) and
  persists it in `localStorage` as the `:cartId` path param. They become
  *owned* only at checkout, which requires a signed-in customer (see
  "Orders, checkout & invoices"). Cart lines snapshot `priceMinor`,
  `taxCode`, `sizeLabel` and `soldBy` so checkout never re-reads the catalog.
- **Breaker reuse, not a new breaker.** `cartService.addItem` and
  `updateQuantity` validate/price items via the existing, already
  breaker-protected `catalogService.getProductDetail` rather than owning a
  breaker of their own — cart storage itself has no flaky external
  dependency to protect against. If the catalog breaker is open, these
  transparently validate against the stale fallback snapshot's stock
  numbers instead of failing, which is what lets cart mutations keep
  working through a catalog outage; the cart's own `ResilientPayload`
  mirrors the underlying lookup's `isFallback`/`source`.
- **Line item identity.** A line item is keyed by `productId` +
  fully-resolved `selectedConfiguration` (missing options are normalized to
  their `defaultChoice` before hashing), via a derived `lineItemId`
  (`sha1(productId + canonical config).slice(0,16)`, `node:crypto`) — so
  the same product with different configuration choices becomes separate
  line items, while repeated adds of the same product+configuration merge
  quantity into one.
- **No stock decrement on checkout.** Checkout does not mutate
  `products.stock` — that would also make the in-memory fallback snapshot
  stale, and safe concurrent decrement-with-rollback is per-store inventory
  reservation work. `addItem`'s stock check is a point-in-time check, not a
  hold.
- **Bounded in-memory storage.** Carts (unlike orders, which are now in
  SQLite) live in a `src/utils/boundedMap.ts`-backed map (cap-on-write LRU
  eviction, no timers) rather than an unbounded `Map`, so a long-running demo
  process doesn't accumulate memory from anonymous cart ids that are never
  revisited. `cartRepository.getCart` is read-only and never persists a
  synthesized empty cart, so a page load alone doesn't grow the map.

### Orders, checkout & invoices

```
POST /api/checkout/quote                    (Bearer)  { cartId, storeId }  // prices the cart with tax; charges/saves nothing
POST /api/checkout                          (Bearer)  { cartId, storeId, paymentMethod, paymentToken? }
POST /api/orders/:orderId/payment/confirm   (Bearer)  { approved }        // 3-D Secure challenge result
GET  /api/orders            GET /api/orders/:orderId                     (Bearer, owner only)
GET  /api/customers/me/invoices             GET .../invoices/:invoiceId   GET .../invoices/:invoiceId/html
```

The customer journey: sign in -> add items to the (anonymous) cart -> the
**browser sends card details straight to the payment gateway** and receives a
one-time token -> `POST /api/checkout` with only that token -> tax, payment,
order and invoice happen server-side. Card numbers never reach or get stored,
logged or returned by the shop backend (only brand + last4).

`services/checkoutService.ts` orders things deliberately: validate (store,
method, cart) -> **tax** from the *store's* jurisdiction via the installed
`TaxProvider`, per line -> **authorize** via the `PaymentProvider` -> only then
persist. So a decline (402 `PAYMENT_DECLINED` + `declineCode`) or a gateway
outage (503 `PAYMENT_GATEWAY_UNAVAILABLE`, fails **closed**) leaves no order and
keeps the cart. Card/EBT are captured immediately; pay-at-pickup stays
`authorized` (collected at the counter). A 3-D Secure card returns 202 with the
order `payment_pending` and **no invoice**; `payment/confirm` then captures and
issues the invoice (approved) or cancels the order (declined).

- **Order + invoice are one transaction** (`data/orderRepository.saveOrder`),
  so neither exists without the other. Tables: `orders`, `order_lines`,
  `invoices`, `invoice_sequences` (migration v3).
- **Invoice numbers are sequential per store, gap-free** (`IL-01-000001`),
  taken inside the same transaction as the invoice row.
- **The invoice is an immutable snapshot** (`invoices.snapshot_json`, a
  `ReceiptData`): store, customer name/email, lines, per-line tax, totals,
  payment summary. Renaming the customer or changing prices/rates later never
  rewrites an issued invoice. `GET .../html` renders it with the installed
  region's `ReceiptTemplate` (`platform/receipts/usRetailReceipt.ts`: T/F tax
  flags, tax by rate, return policy, and a **"SIMULATED PAYMENT" banner** when
  the payment method is a simulator).
- Orders and invoices are owner-scoped: someone else's id is a 404, same as
  a nonexistent one. Declined-after-3DS (cancelled) orders are hidden from history.
- **Not built yet:** pickup slots / order fulfilment states (packed, ready,
  collected), refunds API + credit receipts, PDF / barcode, saved payment
  methods, guest checkout, per-store stock reservation.

### Platform layer: install-time region config

`src/platform/` holds everything that varies by country, chosen once at
install time (like amazon.com vs amazon.in: one region per install, not
multi-region on one install). Core services depend on the interfaces in
`platform/types.ts` (`TaxProvider`, `PaymentProvider`, `ReceiptTemplate`,
`Money`) and must never branch on a country code — a new region is a new
pack under `platform/regions/<code>/` registered in `regions/index.ts`.

- **Setup flow.** While no config exists the store is "not installed":
  `initPlatform()` (called from `createApp()`) issues a one-time setup
  token (`SETUP_TOKEN` env, or random and printed in the server log).
  `POST /api/setup/install` with `x-setup-token` validates the request
  against the chosen pack, persists it to `STORE_CONFIG_PATH`
  (default `./data/store.config.json`), activates the modules and burns
  the token. `GET /api/setup/status|options` and `GET /api/store-config`
  are public; the latter is a secret-free view. For local demos, start the
  backend with `DEMO_AUTO_INSTALL=true` to skip the wizard: a fresh store
  self-installs the US demo config (3 stores IL/OH/PA, all payment modules),
  bypassing the setup token — never use it on a real deployment. Without an
  install, checkout is unavailable (the storefront shows a banner).
- **Config holds module ids, never credentials.** A real gateway adapter
  reads its own keys from the environment. `currency` and `priceMode` are
  fixed by the region and rejected if the request contradicts them, since
  orders are frozen snapshots in that currency/tax mode.
- **Money is integer minor units** (`platform/money.ts`); tax rates are
  basis points applied with integer math. Existing catalog/cart prices are
  still plain `number` and have **not** been migrated yet.
- **Payments go through a separate dummy gateway service** (`payment-simulator/`,
  port 5002), reached by an HTTP adapter (`platform/httpPaymentProvider.ts`) that
  implements the `PaymentProvider` port: `authorize -> (requires_action ->
  confirmAction) -> capture -> refund`. It works like Stripe's sandbox, with two
  dummy keys: the **publishable key** (`pk_test_dummy`, browser-safe) can only
  `POST /v1/tokens` (the only place a card number is ever accepted); the **secret
  key** (`sk_test_dummy`, server-side) charges, captures and refunds. Outcomes are
  driven by documented test cards (`GET /v1/test-cards`): `4242 4242 4242 4242`
  approves, `4000 0000 0000 0002` declines, `...9995` insufficient funds, `...0069`
  expired, `...0127` bad CVC, `...0119` processing error, `...3220` 3-D Secure;
  EBT uses `6000 0000 0000 0001` (ok) / `...0002` (no funds). Tokens are
  single-use. A decline is a normal *result* (`declined` + `declineCode`); lifecycle
  misuse throws `PaymentStateError`; an unreachable gateway throws
  `PaymentGatewayUnavailableError` (checkout fails closed). `pay-at-pickup` is a
  small local provider (no gateway). Methods carry `simulated: true`, surfaced as
  `paymentSimulation` in `GET /api/store-config` and as a boot WARN.
  `GET /api/payments/methods` returns each method's browser-side `clientConfig`
  (tokenization URL, publishable key, test-cards URL); authorize/capture/refund
  are **not** public endpoints. Env: `PAYMENT_GATEWAY_URL` (server-to-server),
  `PAYMENT_GATEWAY_PUBLIC_URL` (what the browser calls), the two keys,
  `PAYMENT_SIMULATION_LATENCY_MS` (on the simulator). A real gateway (Stripe) is
  one more adapter replacing `createGatewayPaymentProvider` in the region pack.
- **Test account:** `testuser@mydomain.com` / `123456` is seeded (and created if
  missing, even in an existing database) whenever synthetic seeding is on. Its
  password would fail registration's policy, which is why it is seeded, not registered.
- **US demo tax table is illustrative** (`regions/us/demoTaxTable.ts`,
  IL/OH/PA only) — a production install swaps in an external tax service
  behind the same `TaxProvider` interface. Payment modules in the US pack
  are mocks until a real adapter is registered.
- Catalog/cart routes are **not** gated on install state (the black-box
  suite runs them with no config present).

### Customer & identity domain

A third bounded context, same `routes -> controllers -> services ->
repository -> data` layering: `src/{routes,controllers,services,data}/
{auth,customer,session,address}*.ts`. Unlike carts/orders it is backed by a
real **SQLite** database (`better-sqlite3`), opened by `src/db/database.ts`
(`DATABASE_PATH`, default `./data/app.db`, `:memory:` for tests) with
versioned migrations in that file. **Only `src/data/*Repository.ts` may touch
the database** — swapping it for a hosted DB means changing those files.

```
POST   /api/auth/register           { email, password, name }   -> 201 + session
POST   /api/auth/login              { email, password }         -> 200 + session
POST   /api/auth/logout             (Bearer)                    -> 204
GET    /api/customers/me            (Bearer)
PATCH  /api/customers/me            { name?, phone?, preferredStoreId?, marketingOptIn? }
DELETE /api/customers/me            { password }  -> anonymizes the account
GET|POST         /api/customers/me/addresses
PATCH|DELETE     /api/customers/me/addresses/:addressId
```

- **Login validates against the database** (Amazon-style): email is
  case-insensitive; passwords are scrypt-hashed (`utils/passwordHasher.ts`,
  `node:crypto`, params stored in the hash string). Unknown email, deleted
  account and wrong password all return the *same* 401
  `INVALID_CREDENTIALS`, and an unknown email still burns a dummy scrypt
  verify so timing doesn't reveal which. 5 consecutive failures lock the
  account for 15 minutes (429 `ACCOUNT_LOCKED`).
- **Sessions are opaque bearer tokens** (32 random bytes, 12h TTL). Only the
  SHA-256 of a token is stored, so a leaked DB can't be replayed. Expired
  rows are purged on login — no timers (same rationale as `boundedMap`).
  `middleware/requireAuth.ts` guards routes; every `/customers/me/*` route is
  scoped to the signed-in customer, and address lookups are owner-scoped so
  another customer's id is indistinguishable from a nonexistent one (404).
  A session token is read from the `Authorization: Bearer` header only; the
  `?token=` query parameter is honoured **only on the SSE `/stream` routes**
  (`EventSource` can't send headers) and is matched on `req.path`, never
  `originalUrl` (which includes the query string). New REST routes must not
  accept it (tested by TC-856).
- **Roles** (`customer` / `store-manager` / `admin` / `finance`) exist in the schema and
  are enforced across endpoints via `middleware/requireRole.ts`.
- **Account deletion is anonymization**, not row deletion: personal fields
  are scrubbed and the hash set to an unverifiable value, but the row stays
  so orders/tax records remain intact. Requires re-entering the password.
- **Addresses** use region-neutral field names (`region`/`postalCode`);
  format validation comes from the region pack's `address` rules, not from
  customer code. One default per kind (shipping/billing); `kind` is
  immutable; max 20 per customer.
- **Synthetic demo data.** `db/seedCustomers.ts` seeds 27 deterministic
  customers into an *empty* table on boot (`SEED_SYNTHETIC_DATA=false`
  disables). **All share the password `Demo@1234`.** Named accounts:
  `demo@example.com` (customer), `manager@example.com` (store-manager),
  `admin@example.com` (admin); the rest are `first.lastN@example.com`.
  Never enable seeding on a real deployment.
- **Full commerce features built & verified:** saved payment methods, guest-cart
  merge on sign-in/registration, password reset, data export, refunds & credit receipts
  (`CR-XXXX`), 1-hour store pickup slots with capacity tracking, per-store stock inventory
  with atomic checkout decrement and automatic rollback/refund compensations (CO-09).

### Catalog domain (grocery discounter)

The catalog is a mini-discounter assortment (~1,400 SKUs, ceiling 5,000,
~60% private label) stored in SQLite (`products`, `product_tags`, FTS5
`products_fts`; migration v2 in `db/database.ts`). It is **generated,
deterministically, at boot into an empty table** from hand-authored base items
(`db/catalog/catalogData.ts` -> `generateCatalog.ts` -> `seedCatalog.ts`), all
with fictional brands. Ratings/stock/price jitter derive from each product's
own identity, so adding base items doesn't reshuffle existing ones — but
product ids are sequential in generation order, so **don't hardcode ids in
tests** (use `testcase/support/catalog.ts` `findDetail`). An existing
`app.db` keeps its old catalog; delete it (or the Docker volume) to reseed.
`SEED_SYNTHETIC_DATA=false` skips both catalog and customer seeding.

- **Money is integer cents** (`priceMinor`, cart `subtotalMinor`); `unitPrice`
  is a display-only per-unit value that can be fractional cents. Loose
  produce is `soldBy: "weight"`: priced per lb, `quantity` = pounds.
- **`GET /api/products` is server-side search**: `q` (FTS5, porter-stemmed,
  prefix, AND of words; only `[a-z0-9]` survives, so it is injection-safe),
  `category`, `subcategory`, `brand` (repeatable, OR), `dietary`
  (repeatable, AND), `minPrice`/`maxPrice` (cents, inclusive), `minRating`,
  `snap`, `weeklyFinds`, `inStock`, `sort`
  (relevance|popular|price-asc|price-desc|rating|name|unit-price-asc), `page`,
  `pageSize` (max 100). `data` is `{ items, total, page, pageSize, facets }`.
  Params are hand-validated in `productController.ts`.
- **Facets are disjunctive**: each is counted with every filter except its own,
  so picking a brand doesn't collapse the brand list (`data/productQuery.ts`).
  Each facet count equals the total you'd get by applying it (tested).
- `GET /api/catalog/departments` (tree + counts + emoji, no breaker),
  `GET /api/products/:id/image.svg` (generated tile; real photos later just
  change `thumbnail`).
- `DB_SIMULATED_LATENCY_MAX_MS` (default 1900; the test launcher sets 0) and
  `DB_SIMULATED_FAILURE_RATE` are the two chaos knobs; for a customer-facing
  demo set latency low, and the failure rate to 0 unless showing resilience.
- Age-restricted/alcohol, per-store stock and stock reservation are **not
  built yet** (`stock` is one network-level number for now).

### Master/Detail type split

`ProductMaster` (list-safe fields only) and `ProductDetail` (extends
Master, adds the heavy fields) are modeled as distinct interfaces, not one
type with optional fields. `GET /api/products` must never leak
`ProductDetail`-only fields (`toMaster` in `catalogService.ts` is an
explicit projection, and TC-011 asserts the exact key set), and
`ProductGrid.tsx` is typed to only accept `ProductMaster[]` — the compiler
enforces this boundary. Keep this split when adding fields: a field belongs
on `ProductMaster` only if the grid view or a sidebar filter needs it
(hence `rating`, `brand`, dietary tags live on Master).

### Frontend data flow

`App.tsx` is the only stateful hub: it calls `useAuth`, `useRoute`,
`useStoreConfig`, `useCart`, `useCatalog`/`useDepartments`/`useWeeklyFinds`
once each and passes results down as props — no React Context, no router
library. Routing is **hash-based** (`hooks/useRoute.ts` + `utils/route.ts`
`parseRoute`; routes: shop, login, checkout, order, invoices, invoice,
notFound). Account-only routes redirect anonymous users to
`/login?next=...` (validated by `safeNext`).

- **The URL is the source of truth for catalog filters.**
  `api/catalogQuery.ts` converts `CatalogFilters` <-> URL search <-> API
  query; `useCatalog` derives filters from the hash, keeps the previous page
  on screen while the next loads, and aborts superseded requests. Filter
  changes are `navigate()` calls, not local state.
- **Auth token** lives in `localStorage` (`useAuth`), passed as a `token`
  prop to account pages. Cart id is separate and anonymous
  (`utils/cartId.ts`). Card details go from `CheckoutPage` straight to the
  payment gateway via `api/payment.ts` (tokenization), never through the
  shop API; `ThreeDSecureDialog` handles the 202 `payment_pending` challenge.
- **StatusBadge** shows whichever of catalog-list / detail-modal / cart
  status has the most recent `retrievedAt` (`mostRecent()` in `App.tsx`),
  computed during render rather than synced via `useEffect`.
  `ProductDetailModal` fetches its own detail and reports status up via
  `onStatusChange`.
- `ProductGrid`-style list components accept only `ProductMaster` (see the
  Master/Detail split above).

### Type mirroring across services

The client does not import backend types directly (no shared package
exists). The files in `storefront-client/src/types/` (`product`, `cart`,
`order`, `account`, `store`) are hand-maintained mirrors of their
`product-catalog-service/src/types/` counterparts. When changing the domain
model on the backend, update both sides.

### How `testcase/` controls the circuit breaker deterministically

`testcase/support/testApp.ts` `require()`s the *compiled*
`product-catalog-service/dist/app.js` in-process (not a spawned child
process, not Docker) and calls `.listen(0)` for an OS-assigned port.
`launchTestApp()` first starts `payment-simulator/dist/app.js` the same way
and points `PAYMENT_GATEWAY_URL` at it, defaults `DATABASE_PATH` to
`:memory:` and `DB_SIMULATED_LATENCY_MAX_MS` to 0 (so tests never write
`data/app.db` and stay fast); `launchPaymentSimulator()` starts the gateway
alone. Both services must be **built** (`dist/`) before Jest — stale `dist/`
means tests run old code. This
is deliberate: because it shares `process.env` with the running app, and
`productRepository.ts` reads `DB_SIMULATED_FAILURE_RATE` fresh on every
call rather than caching it at startup, a test can flip the failure rate
mid-run and watch the *same* breaker instance react — including waiting
out the real 15s `resetTimeout` to observe an actual `HALF-OPEN` →
`CLOSED` recovery. Jest gives each test file its own module registry, so
this doesn't leak breaker state between files even though several call
`require()` on the same path. If you add a test file that also needs
breaker isolation, follow this same `require()`-per-file pattern rather
than sharing an app instance across files.
