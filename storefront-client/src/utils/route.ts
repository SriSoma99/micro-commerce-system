/** A tiny hash router: no dependency, works behind any static host, and gives every screen a real URL. */
export type Route =
  | { name: "shop"; search: string }
  | { name: "login"; next: string | null }
  | { name: "signup"; next: string | null }
  | { name: "account" }
  | { name: "setup" }
  | { name: "admin" }
  | { name: "portal" }
  | { name: "checkout" }
  | { name: "order"; id: string }
  | { name: "invoices" }
  | { name: "invoice"; id: string }
  | { name: "manager" }
  | { name: "finance" }
  | { name: "accounting" }
  | { name: "financials" }
  | { name: "telemetry" }
  | { name: "support" }
  | { name: "notFound" };

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/";
  const [pathPart = "/", ...rest] = raw.split("?");
  const search = rest.join("?");
  const path = pathPart.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);

  if (parts.length === 0) return { name: "shop", search };
  const [first, second] = parts;
  if (first === "login" && parts.length === 1) return { name: "login", next: new URLSearchParams(search).get("next") };
  if (first === "signup" && parts.length === 1) return { name: "signup", next: new URLSearchParams(search).get("next") };
  if (first === "account" && parts.length === 1) return { name: "account" };
  if (first === "setup" && parts.length === 1) return { name: "setup" };
  if (first === "admin" && parts.length === 1) return { name: "admin" };
  if (first === "portal" && parts.length === 1) return { name: "portal" };
  if (first === "checkout" && parts.length === 1) return { name: "checkout" };
  if (first === "orders" && second && parts.length === 2) return { name: "order", id: decodeURIComponent(second) };
  if (first === "invoices" && parts.length === 1) return { name: "invoices" };
  if (first === "invoices" && second && parts.length === 2) return { name: "invoice", id: decodeURIComponent(second) };
  if ((first === "manager" || first === "store-manager") && parts.length === 1) return { name: "manager" };
  if ((first === "finance" || first === "finance-portal") && parts.length === 1) return { name: "finance" };
  if ((first === "accounting" || first === "ledger") && parts.length === 1) return { name: "finance" };
  if (first === "financials" && parts.length === 1) return { name: "finance" };
  if ((first === "telemetry" || first === "observability" || first === "melt" || first === "metrics") && parts.length === 1) return { name: "telemetry" };
  if ((first === "support" || first === "cs-desk" || first === "agent-desk") && parts.length === 1) return { name: "support" };
  return { name: "notFound" };
}

/** Only in-app hash paths are honoured as a post-login destination (no open redirects). */
export function safeNext(next: string | null): string {
  return next && /^\/[A-Za-z0-9/_\-?=&%.]*$/.test(next) && !next.startsWith("//") ? next : "/";
}
