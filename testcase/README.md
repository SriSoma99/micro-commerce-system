# Automation Test Suite — `product-catalog-service`

Black-box API tests written with **Jest + Supertest**. The suite requires
the compiled backend rather than the TypeScript source (`npm run build`
inside `product-catalog-service`, done automatically by `pretest` below),
so this project stays fully decoupled from the service's internal build
config while still running everything in-process (no Docker, no ports to
configure manually).

## Running

```bash
npm install
npm test
```

By default the suite switches off the datastore's injected latency
(`DB_SIMULATED_LATENCY_MAX_MS=0`, set in `support/testApp.ts`) so the many
catalog calls stay fast; `circuit-breaker.test.ts` opts back in to the real
100–1900ms. Files that trip a breaker call `shutdownBreakers()` in `afterAll`.

`launchTestApp()` also starts the dummy payment gateway (`payment-simulator`) in-process on its own
ephemeral port and points the shop backend at it (`app.gatewayUrl`), so the checkout tests exercise the
real HTTP adapter, not a mock. `launchPaymentSimulator()` starts the gateway alone.

`circuit-breaker.test.ts` genuinely waits out the production
`resetTimeout` (15s) to verify real recovery behavior, so a full run takes
~20–25 seconds — that's expected, not a hang.

## How failure injection is controlled

`product-catalog-service`'s repository reads `DB_SIMULATED_FAILURE_RATE`
from `process.env` on every call rather than once at startup. Because
this suite requires the compiled app in-process (see
`support/testApp.ts`) rather than spawning it as a separate OS process, it
shares that `process.env` — so tests can flip the failure rate mid-run and
watch the *same* live circuit breaker instance react, including its full
open → half-open → closed recovery path.

## Test Case Index

| ID     | File                        | Case                                                                 |
| ------ | ---------------------------- | ----------------------------------------------------------------------- |
| TC-001 | `health.test.ts`             | `GET /health` returns 200 with the liveness payload                     |
| TC-002 | `health.test.ts`             | `GET /health` responds with JSON content type                          |
| TC-003 | `health.test.ts`             | Unknown route returns a structured 404                                  |
| TC-010 | `product-list.test.ts`       | `GET /api/products` returns a `ResilientPayload` wrapping a page (`items`, `total`, `page`, `pageSize`) |
| TC-011 | `product-list.test.ts`       | Every list item has exactly the `ProductMaster` fields — no Detail leakage |
| TC-012 | `product-list.test.ts`       | Prices are positive integer cents; unit prices positive; currency is a 3-letter code |
| TC-013 | `product-list.test.ts`       | Only the 13 known grocery departments appear                            |
| TC-020 | `product-detail.test.ts`     | `GET /api/products/:id` returns the full `ProductDetail` shape          |
| TC-021 | `product-detail.test.ts`     | Unknown id returns 404 with a structured error envelope                 |
| TC-022 | `product-detail.test.ts`     | Every configuration option's `defaultChoice` is one of its own `choices` |
| TC-023 | `product-detail.test.ts`     | `rating.average` is within the valid 0–5 range                          |
| TC-024 | `product-detail.test.ts`     | Master fields from the list endpoint match Detail's fields for the same id |
| TC-025 | `product-detail.test.ts`     | Detail carries the tax code, size and age-restriction flag checkout needs |
| TC-030 | `circuit-breaker.test.ts`    | Sustained downstream failure yields `isFallback: true`, `source: "circuit-breaker-fallback"`, a page of items and `facets: null` |
| TC-031 | `circuit-breaker.test.ts`    | Breaker trips to `OPEN`; the transition is logged                       |
| TC-032 | `circuit-breaker.test.ts`    | OPEN-state requests short-circuit near-instantly (no repository latency) |
| TC-033 | `circuit-breaker.test.ts`    | After `resetTimeout` and downstream recovery, breaker reaches `CLOSED` and serves live data again |
| TC-040 | `cart.test.ts`               | `GET` on a never-touched `cartId` returns 200 with an empty cart, not 404                |
| TC-041 | `cart.test.ts`               | Adds an item to an empty cart                                                            |
| TC-042 | `cart.test.ts`               | A second add of the same product + configuration merges into one line item              |
| TC-043 | `cart.test.ts`               | The same product with a different configuration becomes a separate line item            |
| TC-044 | `cart.test.ts`               | Adding a nonexistent product returns 404 `PRODUCT_NOT_FOUND`                             |
| TC-045 | `cart.test.ts`               | Requesting more than available stock returns 409 `INSUFFICIENT_STOCK`                   |
| TC-046 | `cart.test.ts`               | An unknown configuration option/value returns 400 `INVALID_CONFIGURATION`               |
| TC-047 | `cart.test.ts`               | Updates a line item's quantity                                                           |
| TC-048 | `cart.test.ts`               | Updating a line item's quantity to 0 removes it                                          |
| TC-049 | `cart.test.ts`               | An unknown `lineItemId` on update returns 404 `LINE_ITEM_NOT_FOUND`                      |
| TC-050 | `cart.test.ts`               | Removes a line item                                                                      |
| TC-054 | `cart.test.ts`               | Two distinct `cartId`s never see each other's items                                     |
| TC-055 | `cart.test.ts`               | Adding to cart still succeeds, using fallback stock data, when the downstream fails      |
| TC-056 | `cart.test.ts`               | Integer-cent pricing: line items snapshot price, size and tax code; subtotal is exact   |
| TC-060 | `setup.test.ts`              | Before setup: status reports not installed and `GET /api/store-config` returns 404 `NOT_INSTALLED` |
| TC-061 | `setup.test.ts`              | `GET /api/setup/options` lists the US pack's defaults, payment modules and jurisdictions |
| TC-062 | `setup.test.ts`              | Install without / with a wrong `x-setup-token` returns 401                               |
| TC-063 | `setup.test.ts`              | Invalid install (wrong currency, unknown payment module, duplicate store, bad jurisdiction) returns 400 with field-level details |
| TC-064 | `setup.test.ts`              | An unknown region is rejected                                                            |
| TC-065 | `setup.test.ts`              | A valid install returns 201; the public config exposes payment methods but no `payments`/`tax` internals |
| TC-066 | `setup.test.ts`              | A second install returns 409 `ALREADY_INSTALLED`                                         |
| TC-067 | `setup.test.ts`              | The config is persisted: a re-launched app boots already installed                       |
| TC-069 | `setup.test.ts`              | An empty `SETUP_TOKEN` env (as docker-compose passes it) never becomes the token          |
| TC-070 | `tax-engine.test.ts`         | `money()` rejects non-integer minor units                                                |
| TC-071 | `tax-engine.test.ts`         | Basis-point rates use integer math and round half up                                     |
| TC-072 | `tax-engine.test.ts`         | Adding different currencies throws                                                       |
| TC-073 | `tax-engine.test.ts`         | `formatMoney` renders USD for `en-US`                                                    |
| TC-074 | `tax-engine.test.ts`         | Groceries and candy are taxed differently within a jurisdiction (IL vs OH)               |
| TC-075 | `tax-engine.test.ts`         | Total tax equals the sum of per-line taxes                                               |
| TC-076 | `tax-engine.test.ts`         | Unknown jurisdiction or tax code is rejected                                             |
| TC-080 | `auth.test.ts`               | A seeded synthetic customer signs in; token + public profile returned                    |
| TC-081 | `auth.test.ts`               | No password hash or lockout field ever appears in an auth response                       |
| TC-082 | `auth.test.ts`               | Email matching is case-insensitive and whitespace-trimmed                                |
| TC-083 | `auth.test.ts`               | Wrong password and unknown email return an identical 401 (no user enumeration)           |
| TC-084 | `auth.test.ts`               | Login requires both email and password                                                   |
| TC-085 | `auth.test.ts`               | 5 failed attempts lock the account (429), even for the correct password                  |
| TC-086 | `auth.test.ts`               | A successful login resets the failure counter                                            |
| TC-087 | `auth.test.ts`               | Seeded admin and store-manager roles are present                                         |
| TC-088 | `auth.test.ts`               | Registration signs the customer in; they can log in again                                |
| TC-089 | `auth.test.ts`               | Duplicate email (any case) returns 409 `EMAIL_TAKEN`                                     |
| TC-090 | `auth.test.ts`               | Invalid email / weak password / blank name return field-level 400 details                |
| TC-091 | `auth.test.ts`               | Registration can never create an elevated role                                           |
| TC-092 | `auth.test.ts`               | Missing, malformed and bogus tokens are all 401 on protected routes                      |
| TC-093 | `auth.test.ts`               | Logout invalidates the token                                                             |
| TC-094 | `auth.test.ts`               | Two sign-ins are independent sessions                                                    |
| TC-100 | `customer.test.ts`           | `GET /customers/me` returns the signed-in customer's profile                             |
| TC-101 | `customer.test.ts`           | `PATCH` updates only the supplied fields and persists                                    |
| TC-102 | `customer.test.ts`           | `PATCH` rejects invalid values and empty bodies                                          |
| TC-103 | `customer.test.ts`           | `PATCH` cannot change email, role or status                                              |
| TC-104 | `customer.test.ts`           | `DELETE` needs the password, anonymizes, ends sessions, blocks re-login, frees the email |
| TC-110 | `customer.test.ts`           | Seeded customer's addresses: one default per kind                                        |
| TC-111 | `customer.test.ts`           | Create address: first of a kind is default; region upper-cased                           |
| TC-112 | `customer.test.ts`           | State / ZIP format validated from the region pack                                        |
| TC-113 | `customer.test.ts`           | New default demotes only the previous default of the same kind                           |
| TC-114 | `customer.test.ts`           | `PATCH` address: `kind` immutable; default can't be un-defaulted                         |
| TC-115 | `customer.test.ts`           | Deleting a default promotes another of the same kind                                     |
| TC-116 | `customer.test.ts`           | Unknown address id returns 404 `ADDRESS_NOT_FOUND`                                       |
| TC-117 | `customer.test.ts`           | One customer cannot read, edit or delete another's address                               |
| TC-118 | `customer.test.ts`           | Address book capped at 20 (409 `ADDRESS_LIMIT`)                                          |
| TC-120 | `payment-simulator.test.ts`  | Gateway tokenizes a card (brand + last4 only) and approves the success cards; no full card number in any response |
| TC-121 | `payment-simulator.test.ts`  | Each decline test card returns its documented `declineCode`                              |
| TC-122 | `payment-simulator.test.ts`  | 3-D Secure card → `requires_action` → confirm → authorized → capturable                  |
| TC-123 | `payment-simulator.test.ts`  | A failed 3-D Secure challenge ends in a decline                                          |
| TC-124 | `payment-simulator.test.ts`  | Luhn-invalid numbers are rejected; other valid numbers approve                           |
| TC-125 | `payment-simulator.test.ts`  | Expired card and malformed CVC are declined; the current month is still valid            |
| TC-126 | `payment-simulator.test.ts`  | Bad card shape / amounts are rejected; the publishable and secret API keys are not interchangeable |
| TC-127 | `payment-simulator.test.ts`  | Every documented test card behaves exactly as its description says (docs can't drift)    |
| TC-128 | `payment-simulator.test.ts`  | Capture is idempotent; partial refunds accumulate; over-refund is rejected               |
| TC-129 | `payment-simulator.test.ts`  | Lifecycle misuse returns 409, unknown ids 404                                            |
| TC-130 | `payment-simulator.test.ts`  | A non-positive refund amount is rejected                                                  |
| TC-131 | `payment-simulator.test.ts`  | `PAYMENT_SIMULATION_LATENCY_MS` adds delay and is read fresh per call                    |
| TC-132 | `payment-simulator.test.ts`  | EBT accepts only 6000-prefixed cards; `...0002` is insufficient funds                    |
| TC-133 | `payment-simulator.test.ts`  | Pay-at-pickup provider (local, no gateway): authorizes with no source, refuses a token, captures at the counter |
| TC-134 | `payment-simulator.test.ts`  | Payment tokens are single-use; unknown tokens are rejected                               |
| TC-135 | `payment-simulator.test.ts`  | `/health` answers and CORS is enabled for browser tokenization                           |
| TC-150 | `catalog-search.test.ts`     | Mini-discounter-sized catalog (1,000–5,000); default page has a facet block that adds up |
| TC-151 | `catalog-search.test.ts`     | Pagination: no overlap, partial last page, past-the-end is empty                         |
| TC-152 | `catalog-search.test.ts`     | Keyword search returns only matching products                                            |
| TC-153 | `catalog-search.test.ts`     | Plurals (stemming), partial words (prefix) and case are matched                          |
| TC-154 | `catalog-search.test.ts`     | Multi-word queries require every word                                                    |
| TC-155 | `catalog-search.test.ts`     | Brand names are searchable                                                               |
| TC-156 | `catalog-search.test.ts`     | Hostile search text is treated as plain text: 200, catalog intact                        |
| TC-157 | `catalog-search.test.ts`     | A punctuation-only query behaves like no query                                           |
| TC-158 | `catalog-search.test.ts`     | Category and subcategory filters                                                         |
| TC-159 | `catalog-search.test.ts`     | Multiple brands are OR-ed                                                                |
| TC-160 | `catalog-search.test.ts`     | Multiple dietary tags are AND-ed                                                         |
| TC-161 | `catalog-search.test.ts`     | Price range is inclusive of both bounds                                                  |
| TC-162 | `catalog-search.test.ts`     | Minimum rating, SNAP-eligible and weekly-finds filters                                   |
| TC-163 | `catalog-search.test.ts`     | `inStock` removes out-of-stock products (count matches the facet)                        |
| TC-164 | `catalog-search.test.ts`     | Filters of different kinds combine (AND)                                                 |
| TC-165 | `catalog-search.test.ts`     | Price sort ascending / descending                                                        |
| TC-166 | `catalog-search.test.ts`     | Rating, unit-price and name sorts                                                        |
| TC-167 | `catalog-search.test.ts`     | Default sort is popularity; relevance when searching                                     |
| TC-168 | `catalog-search.test.ts`     | Facets are disjunctive: choosing a brand/category doesn't collapse its own facet         |
| TC-169 | `catalog-search.test.ts`     | Other facets react to the current selection                                              |
| TC-170 | `catalog-search.test.ts`     | Every facet count equals the total you get by applying that facet                        |
| TC-171 | `catalog-search.test.ts`     | Facet counts reflect a keyword search                                                    |
| TC-172 | `catalog-search.test.ts`     | Bad parameters return 400 with a message per problem                                     |
| TC-173 | `catalog-search.test.ts`     | Inverted price range and non-numeric numbers are rejected                                |
| TC-174 | `catalog-search.test.ts`     | Mostly private label, retail price points, ≥20 weekly finds, household is not SNAP       |
| TC-175 | `catalog-search.test.ts`     | Loose produce is sold by weight, priced per lb                                           |
| TC-176 | `catalog-search.test.ts`     | Generated SVG tile per product (cacheable); 404 for unknown ids                          |
| TC-177 | `catalog-search.test.ts`     | Thumbnails point at the image endpoint                                                   |
| TC-178 | `catalog-search.test.ts`     | Department tree has 13 departments and counts that add up                                |
| TC-180 | `catalog-fallback.test.ts`   | Live and degraded (breaker fallback) modes return the same products for 6 filter combinations |
| TC-181 | `catalog-fallback.test.ts`   | Degraded pages carry `facets: null` and no Detail-only fields                            |
| TC-182 | `catalog-fallback.test.ts`   | Queries are still validated in degraded mode (400, not a fallback page)                  |
| TC-183 | `catalog-fallback.test.ts`   | The snapshot serves any product's detail during an outage                                |
| TC-190 | `checkout.test.ts`           | The documented test account `testuser@mydomain.com` / `123456` signs in                   |
| TC-191 | `checkout.test.ts`           | Checkout, orders and invoices all require a signed-in customer (401)                      |
| TC-192 | `checkout.test.ts`           | **Main journey:** add 2 items, pay by card via the gateway, get a placed + captured order with exact-cent totals; cart emptied |
| TC-193 | `checkout.test.ts`           | An invoice is stored under the login: listed, retrievable as JSON, and as a printable receipt (store, customer, T flags, `····4242`, SIMULATED banner) |
| TC-194 | `checkout.test.ts`           | Sales tax follows the STORE's state: same basket taxed differently in IL vs OH; exempt lines flagged F |
| TC-195 | `checkout.test.ts`           | Invoice numbers are sequential per store, independent across stores                        |
| TC-196 | `checkout.test.ts`           | No card number or token appears in any order / invoice / cart response                     |
| TC-197 | `checkout.test.ts`           | The amount sent to the gateway equals the order total (checked at the gateway itself)       |
| TC-198 | `checkout.test.ts`           | Declined / insufficient-funds / expired cards: 402 with `declineCode`, no order, no invoice, cart kept |
| TC-199 | `checkout.test.ts`           | A payment token works once; reuse is declined (`invalid_token`)                             |
| TC-200 | `checkout.test.ts`           | 3-D Secure: 202 pending (no invoice); approval places the order and issues the invoice     |
| TC-201 | `checkout.test.ts`           | A failed 3-D Secure challenge cancels the order: 402, no invoice, hidden from history       |
| TC-202 | `checkout.test.ts`           | Confirming is guarded: valid body, order pending, owner only                               |
| TC-203 | `checkout.test.ts`           | Pay at pickup: no card, order placed with payment still to collect; invoice says PAY AT PICKUP |
| TC-204 | `checkout.test.ts`           | SNAP/EBT card pays; an EBT card without funds is declined                                   |
| TC-205 | `checkout.test.ts`           | Checkout request validation (fields, unknown store, unknown method, missing token, empty cart) |
| TC-206 | `checkout.test.ts`           | Another customer can never read this customer's orders or invoices                          |
| TC-207 | `checkout.test.ts`           | Gateway down: 503, fails closed, nothing charged, no order, cart intact                     |
| TC-208 | `checkout.test.ts`           | An issued invoice is an immutable snapshot (renaming the customer doesn't rewrite it)       |
| TC-209 | `checkout.test.ts`           | Invoices list newest first, each linked to its order                                       |
| TC-210 | `checkout.test.ts`           | `DEMO_AUTO_INSTALL=true` installs the US demo configuration on a fresh store (5 stores, all payment methods) |
| TC-211 | `checkout.test.ts`           | Quote prices a cart at a store without charging or saving anything |
| TC-212 | `checkout.test.ts`           | The quoted total is exactly what checkout then charges |
| TC-213 | `checkout.test.ts`           | Quote is guarded: needs sign-in, valid input, a real store and a non-empty cart |
| TC-214 | `checkout.test.ts`           | Client `Idempotency-Key` deduplicates concurrent/duplicate checkouts; successive checkouts with new keys each succeed |
| TC-215 | `checkout.test.ts`           | Checkout is rejected with 409 `OUT_OF_STOCK` when the quantity exceeds the chosen store's availability |
| TC-216 | `checkout.test.ts`           | Stock is restored when a 3-D Secure challenge is declined |
| TC-217 | `checkout.test.ts`           | Stock is restored when a store manager cancels an order |
| TC-140 | `payment-methods.test.ts`    | `GET /api/payments/methods` returns 404 `NOT_INSTALLED` before setup                     |
| TC-141 | `payment-methods.test.ts`    | After install: only enabled methods, all `simulated`, with browser tokenization config (`clientConfig`) |
| TC-142 | `payment-methods.test.ts`    | Public store config flags `paymentSimulation` for the UI notice                          |
| TC-143 | `payment-methods.test.ts`    | authorize / capture / refund are not public HTTP; the secret key never appears in any response |
| TC-700 | `role-auth.test.ts`          | Seeded customer, store-manager, and admin accounts load their respective roles |
| TC-701 | `role-auth.test.ts`          | Self-service registration is strictly customer role (no elevation) |
| TC-702 | `role-auth.test.ts`          | Customer data export returns profile, addresses, and orders snapshot |
| TC-703 | `role-auth.test.ts`          | Unauthenticated requests to customer export return 401 UNAUTHENTICATED |
| TC-300 | `fulfilment.test.ts`         | `GET /api/stores/:storeId/pickup-slots` generates 1-hour windows with capacity & availability |
| TC-301 | `fulfilment.test.ts`         | Pickup slots request for an unknown store returns 404 `STORE_NOT_FOUND` |
| TC-302 | `fulfilment.test.ts`         | Store manager can transition order lifecycle: `placed` → `packed` → `ready` → `collected` |
| TC-303 | `fulfilment.test.ts`         | Regular customer is forbidden from changing order status (403 `FORBIDDEN`) |
| TC-304 | `fulfilment.test.ts`         | `PATCH /api/orders/:orderId/status` rejects invalid status values (400 `INVALID_STATUS`) |
| TC-305 | `fulfilment.test.ts`         | Unauthenticated requests to order status endpoint return 401 |
| TC-400 | `refunds.test.ts`            | Store manager / admin can issue a full order refund with credit note receipt `CR-XXXX` |
| TC-401 | `refunds.test.ts`            | Store manager can issue partial refunds with refund reasons |
| TC-402 | `refunds.test.ts`            | Regular customer is forbidden from issuing refunds (403 `FORBIDDEN`) |
| TC-403 | `refunds.test.ts`            | Refund request for non-existent order returns 404 `ORDER_NOT_FOUND` |
| TC-404 | `refunds.test.ts`            | Rejects invalid refund amounts <= 0 or > totalMinor (400 `INVALID_REFUND_AMOUNT`) |
| TC-405 | `refunds.test.ts`            | Unauthenticated request to refund returns 401 |
| TC-900 | `guest-checkout.test.ts`     | Anonymous cart items merge automatically into customer cart upon registration |
| TC-901 | `guest-checkout.test.ts`     | Anonymous cart items merge automatically into customer cart upon login |
| TC-902 | `guest-checkout.test.ts`     | Saved payment methods CRUD (list, save, delete) with PCI tokenization |
| TC-903 | `guest-checkout.test.ts`     | Setting default saved payment method updates default across customer cards |
| TC-904 | `guest-checkout.test.ts`     | `POST /api/auth/forgot-password` dispatches password reset token via EmailProvider |
| TC-905 | `guest-checkout.test.ts`     | `POST /api/auth/reset-password` updates scrypt password hash and burns single-use token |
| TC-600 | `store-manager.test.ts`      | Store manager creates manual Goods Receipt Note (GRN); stock increments & WAC recalculates |
| TC-601 | `store-manager.test.ts`      | Bulk shipment intake via CSV upload with batch numbers & expiry dates |
| TC-602 | `store-manager.test.ts`      | Rejects invalid CSV rows (missing SKU, negative quantity/cost) with structured errors |
| TC-603 | `store-manager.test.ts`      | Inter-store stock transfer decrements source store and increments destination store |
| TC-604 | `store-manager.test.ts`      | Shrinkage and wastage adjustment reduces on-hand stock with reason log |
| TC-605 | `store-manager.test.ts`      | Regular customer without elevated role is rejected with 403 FORBIDDEN |
| TC-850 | `observability.test.ts`      | `GET /metrics` serves Prometheus text with latency histograms, breaker state and checkout counters publicly |
| TC-851 | `observability.test.ts`      | Domain event bus records lifecycle events; events endpoints are admin-only |
| TC-852 | `observability.test.ts`      | Structured JSON log envelope, readable (admin-only) at `/api/observability/logs` |
| TC-853 | `observability.test.ts`      | W3C `traceparent` / `x-request-id` propagation |
| TC-854 | `observability.test.ts`      | Orchestrator probes `/health/live`, `/ready`, `/db`, `/circuit-breaker` |
| TC-855 | `observability.test.ts`      | Chaos controller: admin-only, opt-in via `ENABLE_CHAOS=true`; latency, failure rate and forced breaker trip |
| TC-856 | `observability.test.ts`      | `?token=` is honoured only on the SSE `/stream` routes (admin: 200; none: 401; customer: 403); rejected on every REST route, including with `/stream` smuggled into the query string; the Bearer header still works |

## Design Notes

- **In-process, not a spawned server or Docker container.** Simpler
  lifecycle management, no port collisions across parallel test files
  (each gets an OS-assigned ephemeral port), and — critically — it's what
  makes TC-033's live recovery test possible without a test-only backdoor
  endpoint on the production service.
- **Per-file breaker isolation.** Jest gives each test file its own
  module registry, so `require()`-ing the compiled app fresh per file
  means `circuit-breaker.test.ts` tripping its breaker open has zero
  effect on `product-list.test.ts` or `product-detail.test.ts`, even when
  Jest runs files in parallel.
- **Real timing, not shortened for the test run.** `resetTimeout` isn't
  mocked or reduced — TC-033 waits the actual 15 seconds a production
  deployment would. This is slower but tests the configuration that's
  actually shipped, not a faster stand-in for it.
- **Cart tests indirectly exercise the catalog breaker too.** `cart.test.ts`
  doesn't stand up a breaker of its own — `POST /api/cart/:cartId/items`
  validates and prices items via `catalogService.getProductDetail`, so
  TC-055 (forcing `DB_SIMULATED_FAILURE_RATE=1` and confirming the add
  still succeeds with `isFallback: true`) is really a test of the cart
  service correctly inheriting the *existing* product-detail breaker's
  fallback path, not a second, parallel resilience mechanism.
