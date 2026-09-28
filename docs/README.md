# Documentation Index

Architecture diagrams for the Aperture Commerce system, split by concern.
All diagrams are [Mermaid](https://mermaid.js.org/), rendered natively by
GitHub/GitLab — no external tooling required to view them.

| Document | Covers |
| --- | --- |
| [`architecture-overview.md`](./architecture-overview.md) | 3-service container topology (`storefront-client`, `product-catalog-service`, `payment-simulator`), network boundaries, end-to-end request flow, circuit breaker state machine, layered backend design, and MELT observability architecture. |
| [`ui-architecture.md`](./ui-architecture.md) | React 19 SPA component tree, hash routing, multi-role workspaces (`#shop`, `#checkout`, `#account`, `#manager`, `#finance`, `#telemetry`, `#portal`), state ownership, and resilience-status data flow. |
| [`database-schema.md`](./database-schema.md) | Relational SQLite database schema (`better-sqlite3` + WAL), linear migrations (`v1..v6`), ERD, and FTS5 catalog indexing. |
| [`req/requirements.md`](./req/requirements.md) | Product requirements (storefront, checkout/receipts, store manager, accounting, observability, region platform) with verified status and test results. |

See the root [`README.md`](../README.md) for setup/run instructions and
[`CLAUDE.md`](../CLAUDE.md) for codebase conventions.
