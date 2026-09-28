import type { Customer } from "../types/account";

interface PortalHubProps {
  customer: Customer | null;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
}

export function PortalHub({ customer, onNavigate, onSignOut }: PortalHubProps) {
  const role = customer?.role ?? "guest";

  return (
    <div className="page page--wide" style={{ maxWidth: "1100px", margin: "2rem auto", padding: "0 1.5rem" }}>
      <div style={{ textAlign: "center", marginBottom: "3rem" }}>
        <div style={{ display: "inline-block", background: "var(--color-bg-subtle, #f1f5f9)", padding: "0.4rem 1rem", borderRadius: "9999px", fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-muted, #475569)", marginBottom: "1rem" }}>
          🌐 Enterprise Access Gateway
        </div>
        <h1 style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--color-text-strong, #0f172a)", margin: "0 0 0.75rem 0", letterSpacing: "-0.025em" }}>
          Fresh Basket Portals
        </h1>
        <p style={{ fontSize: "1.1rem", color: "var(--color-text-muted, #64748b)", maxWidth: "650px", margin: "0 auto" }}>
          Select your dedicated workspace below. Customer shopping, store inventory operations, and administrative governance have segregated environments.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem", marginBottom: "3rem" }}>
        {/* 1. Customer Storefront */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", border: "2px solid #e2e8f0", borderRadius: "12px", padding: "1.75rem", transition: "transform 0.15s ease, box-shadow 0.15s ease" }}>
          <div>
            <div style={{ width: "52px", height: "52px", borderRadius: "12px", background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", marginBottom: "1rem", border: "1px solid #bbf7d0" }}>
              🛒
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#166534" }}>Customer Storefront</h2>
              <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "9999px", background: "#dcfce7", color: "#15803d" }}>
                Shopper
              </span>
            </div>
            <p style={{ color: "var(--color-text-muted, #64748b)", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1.25rem" }}>
              Browse grocery catalog, manage basket, simulated card/SNAP checkouts, and view tax invoices.
            </p>
            <ul style={{ fontSize: "0.825rem", color: "var(--color-text, #334155)", paddingLeft: "1.1rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
              <li>Department & Weekly Finds catalog</li>
              <li>Live Stock reservation & Cart drawer</li>
              <li>Checkout & Stripe/EBT Simulation</li>
              <li>Personal Invoices & receipts</li>
            </ul>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            style={{ width: "100%", background: "#16a34a", borderColor: "#16a34a" }}
            onClick={() => onNavigate("/")}
          >
            Launch Storefront →
          </button>
        </div>

        {/* 2. Store Manager Console */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", border: "2px solid #38bdf8", borderRadius: "12px", padding: "1.75rem", background: "linear-gradient(180deg, #f0f9ff 0%, #ffffff 100%)", boxShadow: "0 8px 20px -4px rgba(14, 165, 233, 0.15)" }}>
          <div>
            <div style={{ width: "52px", height: "52px", borderRadius: "12px", background: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", marginBottom: "1rem", border: "1px solid #7dd3fc" }}>
              📦
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#0369a1" }}>Store Manager</h2>
              <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "9999px", background: "#0284c7", color: "#ffffff" }}>
                Operations
              </span>
            </div>
            <p style={{ color: "var(--color-text-muted, #64748b)", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1.25rem" }}>
              Back-of-house store operations: Physical goods receipt notes (GRN), CSV bulk shipments, stock transfers & shrinkage.
            </p>
            <ul style={{ fontSize: "0.825rem", color: "var(--color-text, #334155)", paddingLeft: "1.1rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
              <li>Per-store stock & low-stock alerts</li>
              <li>Goods Receipt Notes (GRN) & batches</li>
              <li>Bulk CSV Manifest Ingestion</li>
              <li>Inter-store Stock Transfers</li>
            </ul>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            style={{ width: "100%", background: "#0284c7", borderColor: "#0284c7" }}
            onClick={() => onNavigate("/manager")}
          >
            Launch Manager Console →
          </button>
        </div>

        {/* 3. Finance & Accounting Portal */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", border: "2px solid #34d399", borderRadius: "12px", padding: "1.75rem", background: "linear-gradient(180deg, #ecfdf5 0%, #ffffff 100%)", boxShadow: "0 8px 20px -4px rgba(16, 185, 129, 0.15)" }}>
          <div>
            <div style={{ width: "52px", height: "52px", borderRadius: "12px", background: "#d1fae5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", marginBottom: "1rem", border: "1px solid #6ee7b7" }}>
              📈
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#065f46" }}>Finance &amp; Ledger</h2>
              <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "9999px", background: "#059669", color: "#ffffff" }}>
                Finance Officer
              </span>
            </div>
            <p style={{ color: "var(--color-text-muted, #64748b)", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1.25rem" }}>
              Executive ledger, payment transaction card audits, category gross margins, regional profitability & multi-state sales tax.
            </p>
            <ul style={{ fontSize: "0.825rem", color: "var(--color-text, #334155)", paddingLeft: "1.1rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
              <li>Executive KPIs & 12-Month Trends</li>
              <li>Payment & Card Transactions Audit (ACC-08)</li>
              <li>Category & Store Gross Margins</li>
              <li>Multi-State Sales Tax Liability Ledger</li>
            </ul>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            style={{ width: "100%", background: "#059669", borderColor: "#059669" }}
            onClick={() => onNavigate("/finance")}
          >
            Launch Finance Portal →
          </button>
        </div>

        {/* 4. Telemetry & Observability Center */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", border: "2px solid #818cf8", borderRadius: "12px", padding: "1.75rem", background: "linear-gradient(180deg, #f5f3ff 0%, #ffffff 100%)", boxShadow: "0 8px 20px -4px rgba(99, 102, 241, 0.15)" }}>
          <div>
            <div style={{ width: "52px", height: "52px", borderRadius: "12px", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", marginBottom: "1rem", border: "1px solid #c4b5fd" }}>
              📡
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#4338ca" }}>Observability &amp; MELT</h2>
              <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "9999px", background: "#4f46e5", color: "#ffffff" }}>
                Live MELT
              </span>
            </div>
            <p style={{ color: "var(--color-text-muted, #64748b)", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1.25rem" }}>
              Full-Stack MELT (Metrics, Events SSE stream, structured Logs, W3C Traces) and real-time Fault &amp; Chaos Injection engine.
            </p>
            <ul style={{ fontSize: "0.825rem", color: "var(--color-text, #334155)", paddingLeft: "1.1rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
              <li>OpenTelemetry &amp; Prometheus /metrics exposition</li>
              <li>Real-time SSE Domain Event Bus &amp; Log streaming</li>
              <li>W3C traceparent context propagation &amp; span waterfall</li>
              <li>Chaos engineering fault injection &amp; circuit trip controls</li>
            </ul>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            style={{ width: "100%", background: "#4f46e5", borderColor: "#4f46e5" }}
            onClick={() => onNavigate("/telemetry")}
          >
            Launch Telemetry Dashboard →
          </button>
        </div>

        {/* 5. AI Support Desk & Guardrails */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", border: "2px solid #f59e0b", borderRadius: "12px", padding: "1.75rem", background: "linear-gradient(180deg, #fffbeb 0%, #ffffff 100%)", boxShadow: "0 8px 20px -4px rgba(245, 158, 11, 0.15)" }}>
          <div>
            <div style={{ width: "52px", height: "52px", borderRadius: "12px", background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", marginBottom: "1rem", border: "1px solid #fde68a" }}>
              🛡️
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#b45309" }}>AI Support Desk</h2>
              <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "9999px", background: "#d97706", color: "#ffffff" }}>
                Agentic CS
              </span>
            </div>
            <p style={{ color: "var(--color-text-muted, #64748b)", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1.25rem" }}>
              Autonomous dispute resolution, perishable damage claims, policy RAG, and Human-in-the-Loop supervisor approval queue.
            </p>
            <ul style={{ fontSize: "0.825rem", color: "var(--color-text, #334155)", paddingLeft: "1.1rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
              <li>Autonomous instant refunds (&le;$25)</li>
              <li>Supervisor approval draft queue (&gt;$25)</li>
              <li>Perishable 48h freshness guarantee RAG</li>
              <li>Dispute audit history &amp; credit receipts</li>
            </ul>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            style={{ width: "100%", background: "#d97706", borderColor: "#d97706" }}
            onClick={() => onNavigate("/support")}
          >
            Launch Support Desk →
          </button>
        </div>

        {/* 6. Administrator Console */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", border: "2px solid #e2e8f0", borderRadius: "12px", padding: "1.75rem" }}>
          <div>
            <div style={{ width: "52px", height: "52px", borderRadius: "12px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", marginBottom: "1rem", border: "1px solid #cbd5e1" }}>
              ⚙️
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#334155" }}>Admin System</h2>
              <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "9999px", background: "#e2e8f0", color: "#475569" }}>
                Admin
              </span>
            </div>
            <p style={{ color: "var(--color-text-muted, #64748b)", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1.25rem" }}>
              Multi-store onboarding setup wizard, platform provider registries, and circuit breaker health telemetry.
            </p>
            <ul style={{ fontSize: "0.825rem", color: "var(--color-text, #334155)", paddingLeft: "1.1rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
              <li>Store Setup &amp; Onboarding Wizard</li>
              <li>Multi-store jurisdiction config</li>
              <li>Platform provider inspection (SPI)</li>
              <li>Resilience telemetry &amp; circuit breakers</li>
            </ul>
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            style={{ width: "100%" }}
            onClick={() => onNavigate("/setup")}
          >
            Launch Admin Setup →
          </button>
        </div>
      </div>

      {customer ? (
        <div style={{ textAlign: "center", padding: "1.5rem", background: "var(--color-bg-subtle, #f8fafc)", borderRadius: "8px", border: "1px solid var(--color-border, #e2e8f0)" }}>
          <span>Signed in as <strong>{customer.name}</strong> (<code>{customer.email}</code>) • Role: <span style={{ fontWeight: 600, color: "#0284c7" }}>{role}</span></span>
          <button type="button" className="btn btn--ghost btn--sm" style={{ marginLeft: "1rem" }} onClick={onSignOut}>
            Sign out
          </button>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "1.5rem", background: "var(--color-bg-subtle, #f8fafc)", borderRadius: "8px", border: "1px solid var(--color-border, #e2e8f0)" }}>
          <span>Want to switch accounts? <a href="#/login" style={{ fontWeight: 600, color: "#0284c7" }}>Sign in with a different role</a></span>
        </div>
      )}
    </div>
  );
}
