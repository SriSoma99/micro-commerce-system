import type { ReactNode } from "react";
import { STORE_BRAND } from "../config";
import type { Customer } from "../types/account";
import { StatusBadge, type SystemStatus } from "./StatusBadge";

interface HeaderProps {
  customer: Customer | null;
  status: SystemStatus | null;
  onSignOut: () => void;
  isManagerRoute?: boolean;
  onOpenAiChat?: () => void;
  /** Search box, store picker, cart button... slotted between the brand and the account links. */
  children?: ReactNode;
}

export function Header({ customer, status, onSignOut, isManagerRoute, onOpenAiChat, children }: HeaderProps) {
  const isManager = customer?.role === "store-manager";
  const isFinance = customer?.role === "finance";
  const isAdmin = customer?.role === "admin";

  const roleColor =
    customer?.role === "store-manager"
      ? "#0284c7"
      : customer?.role === "finance"
      ? "#059669"
      : customer?.role === "admin"
      ? "#d97706"
      : "#e2e8f0";

  const roleLabel =
    customer?.role === "store-manager"
      ? "Store Manager"
      : customer?.role === "finance"
      ? "Finance Officer"
      : customer?.role === "admin"
      ? "Admin"
      : "Customer";

  return (
    <header className="header" style={isManagerRoute ? { background: "#0f172a", borderBottomColor: "#334155" } : undefined}>
      <div className="header__inner">
        <a className="brand" href={isManagerRoute ? "#/manager" : "#/"} aria-label={`${STORE_BRAND} home`}>
          <span className="brand__mark" aria-hidden="true">{isManagerRoute ? "🏢" : "🧺"}</span>
          <span>{STORE_BRAND}</span>
          {isManagerRoute && (
            <span style={{ fontSize: "0.75rem", background: "#0284c7", color: "#ffffff", padding: "0.15rem 0.5rem", borderRadius: "4px", marginLeft: "0.5rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Enterprise Console
            </span>
          )}
        </a>

        {children}
        <span className="header__spacer" />

        <StatusBadge status={status} />

        <nav className="header__nav" aria-label="Account">
          {onOpenAiChat && !isManagerRoute && (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={onOpenAiChat}
              style={{ fontSize: "0.85rem", background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)", color: "#ffffff", border: "none", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
            >
              <span>🤖</span> Ask Rufus
            </button>
          )}
          <a className="btn btn--ghost" href="#/portal" style={{ fontSize: "0.85rem" }}>
            🌐 Portals
          </a>
          <a className="btn btn--ghost" href="#/telemetry" style={{ fontSize: "0.85rem", color: "#818cf8" }}>
            📡 MELT Telemetry
          </a>

          {customer ? (
            <>
              <span className="header__user" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontWeight: 600 }}>
                <span aria-hidden="true">👤</span>
                <span>{customer.name}</span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "4px",
                    fontWeight: 700,
                    background: roleColor,
                    color: customer.role === "customer" ? "#334155" : "#ffffff",
                    letterSpacing: "0.02em",
                  }}
                >
                  {roleLabel}
                </span>
              </span>

              {isManager && !isManagerRoute && (
                <a
                  className="btn btn--primary btn--sm"
                  href="#/manager"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "#0284c7", borderColor: "#0284c7", fontWeight: 700, color: "#ffffff", padding: "0.35rem 0.75rem" }}
                >
                  <span>📦</span> Manager Console
                </a>
              )}

              {isFinance && !isManagerRoute && (
                <a
                  className="btn btn--primary btn--sm"
                  href="#/finance"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "#059669", borderColor: "#059669", fontWeight: 700, color: "#ffffff", padding: "0.35rem 0.75rem" }}
                >
                  <span>📈</span> Finance Portal
                </a>
              )}

              {isAdmin && !isManagerRoute && (
                <a
                  className="btn btn--primary btn--sm"
                  href="#/manager"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "#d97706", borderColor: "#d97706", fontWeight: 700, color: "#ffffff", padding: "0.35rem 0.75rem" }}
                >
                  <span>⚙️</span> Admin Portal
                </a>
              )}

              {isManagerRoute && (
                <a className="btn btn--ghost btn--sm" href="#/" style={{ color: "#94a3b8" }}>
                  🛒 Customer Storefront
                </a>
              )}

              {!isManagerRoute && (
                <>
                  <a className="btn btn--ghost" href="#/account">
                    My Account
                  </a>
                  <a className="btn btn--ghost" href="#/invoices">
                    Invoices
                  </a>
                </>
              )}

              <button type="button" className="btn btn--ghost" onClick={onSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <a className="btn btn--ghost" href="#/login">
                Sign in
              </a>
              <a className="btn btn--secondary btn--sm" href="#/signup">
                Sign up
              </a>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
