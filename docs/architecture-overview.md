# Application Architecture

## Container Topology

Three independently deployable services, orchestrated by Docker Compose,
communicating over HTTP with clean separation of concerns:

1. **`storefront-client`** (Port 3000 / dev 5173): React 19 + TypeScript SPA built with Vite and served by Nginx.
2. **`product-catalog-service`** (Port 5001): Core Express API with SQLite database (`better-sqlite3`), Opossum circuit breaker, per-store inventory, and region platform modules.
3. **`payment-simulator`** (Port 5002): Local mock payment gateway offering browser-side tokenization with publishable keys and server-side authorizations, captures, and refunds with secret keys.

```mermaid
flowchart TB
    subgraph Host["Developer / CI Host"]
        Browser["Browser<br/>(runs the React 19 SPA)"]
    end

    subgraph Compose["Docker Compose network: commerce-net"]
        subgraph FE["storefront-client container<br/>Nginx :80 → host :3000"]
            SPA["Static SPA bundle<br/>(React 19 + TS, built by Vite)"]
        end

        subgraph BE["product-catalog-service container<br/>Node 22 :5001 → host :5001"]
            Express["Express App / Routers"]
            Breaker["Opossum Circuit Breakers<br/>(list + detail, isolated)"]
            Platform["Platform Ports & Registry<br/>(Tax, Payment, Receipt, Identity, Email)"]
            SQLite[("SQLite Database<br/>better-sqlite3 + WAL<br/>/app/data/catalog.db")]
            Express --> Breaker --> SQLite
            Express --> Platform
        end

        subgraph SIM["payment-simulator container<br/>Node 22 :5002 → host :5002"]
            Gateway["Mock Gateway API<br/>(Tokens, 3DS, Capture, Refund)"]
        end
    end

    Browser -- "GET / (initial load)" --> SPA
    Browser -- "Tokenize card (publishable key)" --> Gateway
    Browser -- "API requests (/api/*)" --> Express
    Platform -- "Charge / Refund (secret key)" --> Gateway
    SPA -. "fetch() calls from browser" .-> Express
```

**Why the browser tokenizes directly with the payment gateway:** card numbers never touch the shop backend (`product-catalog-service`), fulfilling PCI-DSS compliance standards. The storefront client receives a one-time payment token from `payment-simulator` and submits only the token to `POST /api/checkout`.

## End-to-End Request Flow

```mermaid
sequenceDiagram
    participant U as Browser
    participant C as Controller
    participant S as CatalogService
    participant B as Opossum Breaker
    participant R as ProductRepository (SQLite)

    U->>C: GET /api/products
    C->>S: listProducts(query)
    S->>B: fire(query)
    B->>R: search(query)
    alt SQLite healthy
        R-->>B: PageResult<ProductMaster>
        B-->>S: resolved
        S-->>C: { data, isFallback: false, source: "live-core" }
    else SQLite fails or times out (>2000ms)
        R--xB: rejected / timeout
        B-->>S: rejected (breaker records failure)
        S->>S: catch → build fallback from in-memory snapshot
        S-->>C: { data, isFallback: true, source: "circuit-breaker-fallback" }
    end
    C-->>U: 200 OK + ResilientPayload envelope
```

## Circuit Breaker State Machine

This is the resilience mechanism the whole system is built to demonstrate. Configuration lives in `product-catalog-service/src/services/catalogService.ts`.

```mermaid
stateDiagram-v2
    [*] --> CLOSED

    CLOSED --> OPEN: rolling error rate ≥ 50%<br/>(errorThresholdPercentage)
    OPEN --> HALF_OPEN: after 15000ms<br/>(resetTimeout)
    HALF_OPEN --> CLOSED: probe request succeeds
    HALF_OPEN --> OPEN: probe request fails

    CLOSED: CLOSED\nRequests hit the SQLite database directly.\nEach call has a 2000ms timeout.
    OPEN: OPEN\nRequests short-circuit immediately.\nFallback (stale snapshot) served instead.
    HALF_OPEN: HALF-OPEN\nExactly one trial request allowed through\nto test if the downstream recovered.
```

Every transition is logged with a formatted timestamp via `src/utils/logger.ts` — this is the same signal an operator would watch in production logs or a metrics dashboard, and it's asserted in automated tests (`testcase/tests/circuit-breaker.test.ts`).

## Layered Backend Design

```mermaid
flowchart TD
    Routes["routes/<br/>(auth, catalog, cart, checkout, customer, fulfilment, refund, setup, receiving, accounting, observability, savedPayment)"]
    Middleware["middleware/<br/>(requireAuth, requireRole, trace)"]
    Controllers["controllers/<br/>(auth, catalog, cart, checkout, customer, fulfilment, refund, setup, receiving, accounting, observability, savedPayment)"]
    Services["services/<br/>(catalogService, checkoutService, cartService, refundService, pickupSlotService, authService, passwordResetService, receivingService, accountingService)"]
    Observability["observability/<br/>(metricsEngine, telemetryRegistry, structuredLogger)"]
    Breaker["Opossum Circuit Breakers<br/>(list + detail resilience)"]
    Platform["Platform Ports & Registry<br/>(TaxProvider, PaymentProvider, ReceiptTemplate, IdentityProvider, EmailProvider)"]
    Repositories["data/*Repository.ts<br/>(customer, session, address, product, order, invoice, savedPayment, inventory, receiving, accounting)"]
    DB[("SQLite Database<br/>better-sqlite3 + WAL + FTS5")]

    Routes --> Middleware --> Controllers
    Controllers --> Services
    Controllers --> Observability
    Services --> Breaker
    Services --> Platform
    Services --> Observability
    Breaker --> Repositories
    Services --> Repositories
    Repositories --> DB
```

Each layer strictly depends on the layer beneath it:
- **Routes & Middleware**: URL routing, token validation (`requireAuth`), role authorization (`requireRole`), and W3C trace propagation (`traceMiddleware`).
- **Controllers**: HTTP request unwrapping, payload validation, and `ResilientPayload` packaging.
- **Services**: Business rules, tax computation, payment provider orchestration, stock movements, accounting analytics, and circuit breaker fallbacks.
- **Observability**: Metrics collection (`metricsEngine`), real-time telemetry event bus, structured logging, and health readiness probes.
- **Platform**: Pluggable ports for region rules, payment gateways, tax calculation, and identity providers.
- **Repositories**: Direct SQL queries using `better-sqlite3` prepared statements and indexed queries.

## Observability & Telemetry Architecture (MELT)

The system implements enterprise-grade **MELT** capabilities for end-to-end monitoring and resilience inspection:

```mermaid
graph TD
    subgraph Clients ["Clients & Storefront"]
        Browser["React 19 Storefront (traceparent header)"]
    end

    subgraph Service ["product-catalog-service (:5001)"]
        TraceMW["Tracing Middleware (T)"]
        MetricsEngine["Prometheus & In-Memory Metrics (M)"]
        JSONLogger["Structured JSON Logger (L)"]
        EventBus["Domain Event Dispatcher (E)"]
        Breaker["Circuit Breakers (Opossum)"]
    end

    subgraph Downstreams ["External & Data Ports"]
        PaySim["Payment Simulator (:5002)"]
        SQLite[(catalog.db)]
    end

    Browser --> TraceMW
    TraceMW --> MetricsEngine
    TraceMW --> JSONLogger
    TraceMW --> Breaker
    Breaker --> PaySim
    Breaker --> SQLite
    Breaker --> EventBus
```

1. **Metrics (M)**: Real-time Prometheus metrics at `GET /metrics` and `/api/observability/metrics` tracking HTTP request throughput, p50/p95 latency histograms, circuit breaker trip frequency, SQLite query duration, and active checkout conversions.
2. **Events (E)**: Structured domain events (`ORDER_PLACED`, `PAYMENT_CAPTURED`, `INVOICE_ISSUED`, `GRN_RECORDED`, `STOCK_TRANSFERRED`, `REFUND_DISPATCHED`).
3. **Logs (L)**: Structured JSON log envelopes containing timestamp, trace IDs, request IDs, customer IDs, and log level.
4. **Traces (T)**: W3C `traceparent` and `x-request-id` header propagation across frontend and backend services.
5. **Health Probes**: Granular endpoints for orchestrators:
   - `GET /health/live` (Liveness)
   - `GET /health/ready` (Readiness)
   - `GET /health/db` (Database connectivity & WAL integrity)
   - `GET /health/circuit-breaker` (Opossum breaker states)
