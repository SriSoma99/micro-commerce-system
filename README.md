# Aperture Commerce — Resilient Micro-Commerce & Telemetry System

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19.x-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%205.x-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-410%20Passing-brightgreen.svg)](./testcase/README.md)

A production-shaped micro-commerce system built to demonstrate **clean microservice boundaries, strict TypeScript contracts end-to-end, Opossum circuit-breaker resilience, full-stack MELT observability, and grounded agentic AI copilots**.

---

## 🏛️ System Architecture & Services

The monorepo is composed of three independently deployable services communicating over HTTP:

| Service | Port | Responsibility | Tech Stack |
|---|---|---|---|
| **`product-catalog-service`** | `5001` | Core commerce API, SQLite FTS5 catalog, order lifecycle, RBAC, WAC inventory, AI Copilot engine & MELT telemetry | Express, Node.js 22, TypeScript, Better-SQLite3, Opossum |
| **`payment-simulator`** | `5002` | Local sandbox payment gateway (Stripe-style tokenization, 3-D Secure challenges, webhook simulations) | Express, Node.js 22, TypeScript |
| **`storefront-client`** | `5173` | Modern multi-role workspace SPA (Shopper, Manager, Finance, Support Desk, Telemetry) with real-time resilience status | React 19, TypeScript, Vite |

---

## 🧩 Key Capabilities & Highlights

### 1. 🛡️ Circuit Breaker Resilience & Degradation (Opossum Pattern)
- **Automatic Tripping & Probing:** Wrapped calls to downstream data sources automatically trip to `OPEN` when error thresholds are crossed, fast-failing and protecting the event loop.
- **Resilient Payload Envelope:** All API responses wrap data in a `ResilientPayload<T>` carrying `isFallback` and `source` (`live-core` vs `circuit-breaker-fallback`).
- **Live UI Reflection:** The storefront header displays a live `StatusBadge` transitioning between **Live Core Microservice** (green) and **Circuit Breaker Fallback Node** (amber pulsing) without requiring page reloads.

### 2. 🏪 Full Multi-Store Grocery Commerce Loop
- **1,398 Seeded Grocery SKUs:** FTS5 full-text search, facet counts, dietary tags (gluten-free, organic, vegan), unit pricing (per oz/lb), and SNAP/EBT eligibility tags.
- **Per-Store Inventory & 1-Hour Pickup Slots:** Tracks stock, reservations, and available units across 5 physical store locations in 3 states (IL, OH, PA).
- **PCI-Compliant Sandbox Payments:** Publishable key tokenization in the browser, secret key charge/refund execution on the backend, 3DS challenge dialogs, and immutable US retail receipts.

### 3. 🌐 Multi-Role Workspaces & Operational Portals (`#/portal`)
- 🛍️ **Shopper Storefront (`#/shop`):** Category browsing, weekly finds, dietary filtering, cart drawer, and curbside pickup checkout.
- 🏢 **Store Manager Portal (`#/manager`):** Goods Receipt Notes (`GRN-STORE-XXXX`), CSV intake, batch/expiry tracking, inter-store stock transfers (`TRF-XXXX`), and WAC (Weighted Average Cost) inventory valuation.
- 📊 **Finance & Accounting Hub (`#/finance`):** Daily sales ledger, 12-month MoM revenue comparative trends, product velocity classifications (fast/slow/dead stock), gross margins, and regional state tax liability.
- 🎧 **Customer Support Desk (`#/support`):** AI Policy RAG knowledge retrieval and an interactive human-in-the-loop supervisor approval queue for claims $> \$25$.
- 📡 **MELT Telemetry & Chaos Console (`#/telemetry`):** Real-time metrics dashboard, live logs, event streams, and chaos fault-injection controls.

### 4. 🤖 Grounded Conversational AI & Agentic Copilots
- **Aperture Shopper Assistant:** Conversational natural language product discovery, recipe recommendations, and 1-click cart addition.
- **Store Keeper & Finance Copilot:** Answers exact-date historical sales queries (e.g. *10-Sep-2026 sales & AOV*) and flags expiring inventory batches.
- **Agentic CS Action Agent:** Grounded RAG with automated $\le \$25$ instant refund execution and $> \$25$ supervisor review drafts (RAGAS faithfulness $\ge 98\%$).

### 5. 🔭 Full-Stack Observability (MELT)
- **Metrics (M):** Prometheus `/metrics` and latency histograms (p50/p95/p99).
- **Events (E):** Structured SSE domain event stream (`ORDER_PLACED`, `PAYMENT_CAPTURED`, `GRN_RECORDED`, `CIRCUIT_TRIPPED`).
- **Logs (L):** Structured JSON logs with correlation IDs (`traceId`, `requestId`).
- **Traces (T):** Distributed W3C `traceparent` propagation across browser $\rightarrow$ catalog backend $\rightarrow$ payment simulator.

---

## 🧪 Comprehensive Automated Test Suite (410 Tests)

The repository enforces strict test-driven verification across both backend and frontend:

| Test Suite | Framework | Files | Test Count | Scope |
|---|---|:---:|:---:|---|
| **Backend Black-Box Suite** (`testcase/`) | Jest + Supertest | 22 | **235 Passing** | Complete API lifecycle (`TC-001`..`TC-958`), stock race conditions, 3DS payment flows, idempotency, GRN intake, accounting analytics, AI agents, and circuit-breaker cooldown recovery |
| **Frontend Suite** (`storefront-client/`) | Vitest + Testing Library | 28 | **175 Passing** | Component interactions, mock network stubs, hooks, state synchronization, portals, and AI drawers |
| **Total Test Coverage** | | **50 files** | **410 Passing** | Clean-install verified |

To run the tests:
```bash
# Run backend black-box suite
cd testcase && npm test

# Run frontend tests
cd storefront-client && npm test
```

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js 22.x or Docker
- npm 10+

### Option A: Running with Docker Compose (One-Click)
```bash
# Clone the repository
git clone <repository-url>
cd micro-commerce-system

# Build and start all 3 services in the background
docker compose up -d --build

# Open the applications:
# Storefront Client: http://localhost:3000
# Core Catalog API:   http://localhost:5001/api/products
# Payment Gateway:    http://localhost:5002
```

### Option B: Running Locally (Node 22)
```bash
# Terminal 1 — Payment Simulator Gateway (:5002)
cd payment-simulator
npm install
npm run build && npm run start

# Terminal 2 — Product Catalog & AI Service (:5001)
cd product-catalog-service
npm install
npm run build && npm run start

# Terminal 3 — React 19 Storefront Client (:5173)
cd storefront-client
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 👤 Author

### Srinivasulu (Srini) Soma
**Hands-on Cloud & AI Architect · Fractional Technical Consultant**

I build production-grade agentic AI, cloud-native microservices, and IoT data platforms, backed by 30+ years of end-to-end software engineering experience — from embedded firmware to cloud infrastructure. Much of that work was developed in safety-critical domains: medical devices (Class II/III), automotive, and avionics.

#### What I Build
- **Agentic AI & RAG:** LangGraph multi-agent systems, Vertex AI, RAGAS/DeepEval evaluation gates, human-in-the-loop controls, audit trails.
- **Resilient Microservices:** Node.js/TypeScript, Python (FastAPI), .NET; Kafka and Pub/Sub event-driven design; Opossum circuit breakers, retries, and distributed resilience.
- **IoT & Telemetry Platforms:** MQTT5, edge inference (Jetson), Dataflow → BigQuery, full-stack observability across metrics, events, logs, and traces (MELT).
- **Cloud Engineering:** GCP (Professional Cloud Architect), AWS, Azure AI (AI-102), Terraform, Kubernetes (GKE).

#### Featured Work
- [**FactoryPulseAI**](https://github.com/srisoma99/FactoryPulseAI): Multi-agent root-cause analysis for industrial telemetry on GCP (LangGraph, Gemini, LlamaIndex/FAISS, DeepEval HITL gates, Terraform).
- [**Aperture Commerce**](https://github.com/srisoma99/micro-commerce-system): Resilient multi-service commerce platform with provable Opossum circuit-breaker degradation, MELT telemetry, React 19 workspaces, and agentic AI shopping copilots.

#### Contact
- 📧 **Email:** [srisoma99@gmail.com](mailto:srisoma99@gmail.com)
- 💼 **LinkedIn:** [linkedin.com/in/somasrini](https://www.linkedin.com/in/somasrini)

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.


