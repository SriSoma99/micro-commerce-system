import { useState } from "react";
import type { Customer } from "../types/account";
import type { StoreLocation } from "../types/store";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

interface FinancePortalProps {
  token: string;
  customer: Customer;
  stores?: StoreLocation[];
}

export function FinancePortal({ token, customer, stores }: FinancePortalProps) {
  const isAuthorized = customer.role === "finance" || customer.role === "admin";
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  if (!isAuthorized) {
    return (
      <div className="page page--narrow" style={{ marginTop: "3rem" }}>
        <div className="card" style={{ textAlign: "center", padding: "3rem 2rem", border: "1px solid #fecaca", background: "#fff5f5" }}>
          <span style={{ fontSize: "3rem" }}>🔒</span>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#991b1b", margin: "1rem 0 0.5rem" }}>
            Finance &amp; Accounting Portal Restricted
          </h1>
          <p style={{ color: "#7f1d1d", fontSize: "0.95rem", maxWidth: "480px", margin: "0 auto 1.5rem" }}>
            Access to financial analytics, margins, tax ledgers, and transaction card audits requires a <strong>Finance Officer</strong> or <strong>Administrator</strong> account.
          </p>
          <div style={{ display: "inline-block", background: "#ffffff", padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid #fca5a5", fontSize: "0.85rem", color: "#991b1b", marginBottom: "1.5rem" }}>
            Current Account: <strong>{customer.name}</strong> (<code>{customer.email}</code>) • Role: <code>{customer.role}</code>
          </div>
          <div>
            <a href="#/portal" className="btn btn--secondary" style={{ marginRight: "0.75rem" }}>
              Switch Workspace Portal
            </a>
            <a href="#/login" className="btn btn--primary" style={{ background: "#dc2626", borderColor: "#dc2626" }}>
              Sign In as Finance Officer
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--wide" style={{ maxWidth: "1280px", margin: "0 auto", padding: "1.5rem" }}>
      {/* Top Banner & Context Controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          background: "linear-gradient(135deg, #064e3b 0%, #065f46 100%)",
          color: "#ffffff",
          padding: "1.25rem 1.75rem",
          borderRadius: "14px",
          marginBottom: "1.5rem",
          boxShadow: "0 4px 15px -3px rgba(6, 78, 59, 0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "rgba(255, 255, 255, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem" }}>
            📈
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "#ffffff", letterSpacing: "-0.01em" }}>
                Finance &amp; Accounting Portal
              </h1>
              <span style={{ fontSize: "0.75rem", background: "#10b981", color: "#064e3b", fontWeight: 800, padding: "0.15rem 0.6rem", borderRadius: "9999px", textTransform: "uppercase" }}>
                Enterprise Ledger
              </span>
            </div>
            <p style={{ margin: "4px 0 0", color: "#a7f3d0", fontSize: "0.85rem" }}>
              Signed in as <strong>{customer.name}</strong> (<code>{customer.email}</code>) • Authorized Role: <code style={{ color: "#ffffff", background: "rgba(0,0,0,0.2)", padding: "1px 6px", borderRadius: "4px" }}>{customer.role}</code>
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label htmlFor="finance-store-select" style={{ fontSize: "0.85rem", fontWeight: 600, color: "#d1fae5" }}>
              Store Scope:
            </label>
            <select
              id="finance-store-select"
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              style={{
                background: "rgba(255, 255, 255, 0.95)",
                color: "#0f172a",
                border: "none",
                borderRadius: "8px",
                padding: "0.5rem 0.85rem",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              <option value="">🌐 All Regional Stores (Consolidated)</option>
              {stores?.map((s) => (
                <option key={s.id} value={s.id}>
                  🏬 {s.name} ({s.id} - {s.taxJurisdiction})
                </option>
              ))}
            </select>
          </div>

          <a
            href="#/portal"
            className="btn btn--sm"
            style={{
              background: "rgba(255,255,255,0.15)",
              color: "#ffffff",
              border: "1px solid rgba(255,255,255,0.25)",
              fontWeight: 600,
              textDecoration: "none",
              padding: "0.45rem 0.85rem",
              borderRadius: "8px",
            }}
          >
            🌐 Switch Portal
          </a>
        </div>
      </div>

      {/* Main Analytics & Ledger Dashboard Component */}
      <AnalyticsDashboard token={token} storeId={selectedStoreId || undefined} />
    </div>
  );
}
