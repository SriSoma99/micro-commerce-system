import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { EMPTY_FILTERS, toUrlSearch, updateFilters, type CatalogFilters } from "./api/catalogQuery";
import { AccountPage } from "./components/AccountPage";
import { CartButton } from "./components/CartButton";
import { CartDrawer } from "./components/CartDrawer";
import { CheckoutPage } from "./components/CheckoutPage";
import { FinancePortal } from "./components/FinancePortal";
import { Header } from "./components/Header";
import { InvoicesPage } from "./components/InvoicesPage";
import { InvoiceView } from "./components/InvoiceView";
import { LoginPage } from "./components/LoginPage";
import { ManagerPortal } from "./components/ManagerPortal";
import { OrderPage } from "./components/OrderPage";
import { PortalHub } from "./components/PortalHub";
import { ProductDetailModal } from "./components/ProductDetailModal";
import { SearchBox } from "./components/SearchBox";
import { SetupWizard } from "./components/SetupWizard";
import { ShopPage } from "./components/ShopPage";
import { SignUpPage } from "./components/SignUpPage";
import { StorePicker } from "./components/StorePicker";
import { TelemetryDashboard } from "./components/TelemetryDashboard";
import { ChatDrawer } from "./components/ChatDrawer";
import { SupportAgentDesk } from "./components/SupportAgentDesk";
import type { SystemStatus } from "./components/StatusBadge";
import { useAuth } from "./hooks/useAuth";
import { useCart } from "./hooks/useCart";
import { useCatalog, useDepartments, useWeeklyFinds } from "./hooks/useCatalog";
import { useRoute } from "./hooks/useRoute";
import { useStoreConfig } from "./hooks/useStoreConfig";
import type { ProductMaster } from "./types/product";
import { safeNext } from "./utils/route";

const DEMO_ACCOUNTS = [
  { label: "Store Manager", role: "store-manager", email: "manager@example.com", password: "Demo@1234" },
  { label: "Finance Officer", role: "finance", email: "finance@example.com", password: "Demo@1234" },
  { label: "Administrator", role: "admin", email: "admin@example.com", password: "Demo@1234" },
  { label: "Shopper", role: "customer", email: "demo@example.com", password: "Demo@1234" },
];

/** Whichever status carries the more recent `retrievedAt` timestamp wins. */
function mostRecent(...statuses: (SystemStatus | null)[]): SystemStatus | null {
  return statuses.reduce<SystemStatus | null>((latest, candidate) => {
    if (!candidate) return latest;
    if (!latest) return candidate;
    return candidate.retrievedAt >= latest.retrievedAt ? candidate : latest;
  }, null);
}

interface Toast {
  text: string;
  tone: "success" | "error";
}

function App() {
  const auth = useAuth();
  const { route, navigate } = useRoute();
  const storeConfig = useStoreConfig();
  const cart = useCart(storeConfig.store?.id);

  const isShop = route.name === "shop";
  const catalog = useCatalog(route.name === "shop" ? route.search : "", isShop, storeConfig.store?.id);
  const departments = useDepartments();
  const weeklyFinds = useWeeklyFinds();

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [detailStatus, setDetailStatus] = useState<SystemStatus | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);

  // Pages that need an account send the shopper to sign in, then back where they were going.
  const needsAccount =
    route.name === "checkout" ||
    route.name === "invoices" ||
    route.name === "invoice" ||
    route.name === "order" ||
    route.name === "account";

  useEffect(() => {
    if (needsAccount && auth.status === "anonymous") {
      navigate(`/login?next=${encodeURIComponent(window.location.hash.replace(/^#/, ""))}`, { replace: true });
    }
  }, [needsAccount, auth.status, navigate]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const changeFilters = useCallback(
    (patch: Partial<CatalogFilters>) => {
      const next = updateFilters(catalog.filters, patch);
      const search = toUrlSearch(next);
      navigate(search ? `/?${search}` : "/");
    },
    [catalog.filters, navigate]
  );

  const addProduct = useCallback(
    async (product: ProductMaster) => {
      const message = await cart.addItem(product.id, 1);
      setToast(message ? { text: message, tone: "error" } : { text: `Added “${product.name}” to your cart`, tone: "success" });
    },
    [cart]
  );

  const handleDetailStatus = useCallback((status: SystemStatus) => setDetailStatus(status), []);
  const systemStatus = mostRecent(catalog.status, detailStatus, cart.status);

  const isManagerRoute = route.name === "manager" || route.name === "finance" || route.name === "accounting" || route.name === "financials";

  return (
    <div className="app-shell">
      <Header
        customer={auth.customer}
        status={systemStatus}
        isManagerRoute={isManagerRoute}
        onOpenAiChat={() => setAiChatOpen(true)}
        onSignOut={() => void auth.logout().then(() => navigate("/"))}
      >
        {!isManagerRoute && (
          <>
            <SearchBox value={catalog.filters.q} onSearch={(q) => changeFilters({ q })} />
            {storeConfig.config && <StorePicker stores={storeConfig.config.stores} value={storeConfig.store?.id ?? null} onChange={storeConfig.selectStore} />}
            <CartButton itemCount={cart.cart?.itemCount ?? 0} onClick={() => setCartOpen(true)} />
          </>
        )}
      </Header>

      {auth.customer?.role === "store-manager" && !isManagerRoute && (
        <div style={{ background: "linear-gradient(90deg, #0369a1 0%, #0284c7 100%)", color: "#ffffff", padding: "0.6rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #0284c7" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.95rem" }}>
            <span style={{ fontSize: "1.2rem" }}>👔</span>
            <span>Store Manager Console Active (<strong>{auth.customer.name}</strong>) — You are currently previewing the public customer storefront.</span>
          </div>
          <a href="#/manager" className="btn btn--secondary btn--sm" style={{ background: "#ffffff", color: "#0369a1", fontWeight: 700, border: "none" }}>
            Open Store Manager Console →
          </a>
        </div>
      )}

      {auth.customer?.role === "finance" && !isManagerRoute && (
        <div style={{ background: "linear-gradient(90deg, #065f46 0%, #059669 100%)", color: "#ffffff", padding: "0.6rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #059669" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.95rem" }}>
            <span style={{ fontSize: "1.2rem" }}>📈</span>
            <span>Finance Officer Active (<strong>{auth.customer.name}</strong>) — You are currently previewing the public customer storefront.</span>
          </div>
          <a href="#/finance" className="btn btn--secondary btn--sm" style={{ background: "#ffffff", color: "#065f46", fontWeight: 700, border: "none" }}>
            Open Finance &amp; Accounting Portal →
          </a>
        </div>
      )}

      {storeConfig.status === "notInstalled" && (
        <div className="banner banner--warning" role="status">
          This store hasn&apos;t been set up yet, so checkout is unavailable. <a href="#/setup" style={{ textDecoration: "underline", fontWeight: "bold" }}>Run the setup wizard</a>, or start the backend with <code>DEMO_AUTO_INSTALL=true</code> for a demo store.
        </div>
      )}
      {storeConfig.config?.paymentSimulation && (
        <div className="banner banner--info" role="status">
          Demo mode: payments are simulated. No real money is charged.
        </div>
      )}

      <main>
        {route.name === "portal" && (
          <PortalHub
            customer={auth.customer}
            onNavigate={navigate}
            onSignOut={() => void auth.logout().then(() => navigate("/"))}
          />
        )}
        {route.name === "login" && (
          <LoginPage
            onLogin={auth.login}
            onSuccess={(_signedEmail) => {
              const role = auth.customer?.role;
              if (role === "finance") {
                navigate("/finance");
              } else if (role === "store-manager") {
                navigate("/manager");
              } else if (role === "admin") {
                navigate("/portal");
              } else if (route.next && route.next !== "/") {
                navigate(safeNext(route.next));
              } else {
                navigate("/");
              }
            }}
            demoAccounts={DEMO_ACCOUNTS}
            demoAccount={DEMO_ACCOUNTS[0]}
          />
        )}
        {route.name === "signup" && <SignUpPage onRegister={auth.register} onSuccess={() => navigate(safeNext(route.next))} />}
        {(route.name === "setup" || route.name === "admin") && (
          <SetupWizard
            onInstalled={() => {
              void storeConfig.reload();
              navigate("/");
            }}
          />
        )}
        {route.name === "account" && auth.token && auth.customer && (
          <AccountPage
            token={auth.token}
            customer={auth.customer}
            stores={storeConfig.config?.stores}
            onProfileUpdated={() => void auth.refreshProfile()}
            onSignOut={() => void auth.logout().then(() => navigate("/"))}
          />
        )}

        {route.name === "shop" && (
          <ShopPage
            catalog={catalog}
            departments={departments}
            weeklyFinds={weeklyFinds}
            onFiltersChange={changeFilters}
            onClear={() => changeFilters({ ...EMPTY_FILTERS })}
            onOpenProduct={setSelectedProductId}
            onAddProduct={(product) => void addProduct(product)}
          />
        )}

        {route.name === "checkout" && auth.token && storeConfig.config && (
          <CheckoutPage
            token={auth.token}
            cart={cart.cart}
            config={storeConfig.config}
            storeId={storeConfig.store?.id ?? null}
            onSelectStore={storeConfig.selectStore}
            onPlaced={(order) => {
              void cart.reload();
              navigate(`/orders/${order.orderId}`);
            }}
          />
        )}

        {route.name === "checkout" && auth.token && storeConfig.status === "notInstalled" && (
          <div className="page-state">
            <h1>Checkout isn&apos;t available yet</h1>
            <p>This store hasn&apos;t been set up. <a href="#/setup">Run the setup wizard</a>.</p>
          </div>
        )}

        {route.name === "order" && auth.token && <OrderPage orderId={route.id} token={auth.token} />}
        {route.name === "invoices" && auth.token && <InvoicesPage token={auth.token} />}
        {route.name === "invoice" && auth.token && <InvoiceView invoiceId={route.id} token={auth.token} />}
        {/* Store Manager Workspace */}
        {route.name === "manager" && auth.status === "loading" && (
          <div className="page-state">
            <h1>Loading Store Manager Console…</h1>
          </div>
        )}
        {route.name === "manager" && auth.token && auth.customer && (
          <ManagerPortal
            token={auth.token}
            customer={auth.customer}
            stores={storeConfig.config?.stores}
          />
        )}
        {route.name === "manager" && auth.status === "anonymous" && (
          <div className="page page--narrow">
            <div className="card">
              <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                <span style={{ fontSize: "2.5rem" }}>📦</span>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0.5rem 0" }}>Store Manager Console</h1>
                <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Please sign in with your Store Manager account to manage inventory, goods receipts (GRN), and store transfers.</p>
              </div>
              <LoginPage
                onLogin={auth.login}
                onSuccess={() => navigate("/manager")}
                demoAccounts={DEMO_ACCOUNTS}
                demoAccount={DEMO_ACCOUNTS[0]}
              />
            </div>
          </div>
        )}

        {/* Finance & Accounting Workspace */}
        {(route.name === "finance" || route.name === "accounting" || route.name === "financials") && auth.status === "loading" && (
          <div className="page-state">
            <h1>Loading Finance &amp; Accounting Portal…</h1>
          </div>
        )}
        {(route.name === "finance" || route.name === "accounting" || route.name === "financials") && auth.token && auth.customer && (
          <FinancePortal
            token={auth.token}
            customer={auth.customer}
            stores={storeConfig.config?.stores}
          />
        )}
        {(route.name === "finance" || route.name === "accounting" || route.name === "financials") && auth.status === "anonymous" && (
          <div className="page page--narrow">
            <div className="card">
              <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                <span style={{ fontSize: "2.5rem" }}>📈</span>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0.5rem 0" }}>Finance &amp; Accounting Portal</h1>
                <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Please sign in with your Finance Officer or Administrator account to inspect ledger analytics, margins, and payment transaction audits.</p>
              </div>
              <LoginPage
                onLogin={auth.login}
                onSuccess={() => navigate("/finance")}
                demoAccounts={DEMO_ACCOUNTS}
                demoAccount={DEMO_ACCOUNTS[1]}
              />
            </div>
          </div>
        )}

        {/* Telemetry & Observability Center (Admin Only) */}
        {route.name === "telemetry" && auth.status === "loading" && (
          <div className="page-state">
            <h1>Loading Telemetry Center…</h1>
          </div>
        )}
        {route.name === "telemetry" && auth.token && auth.customer?.role === "admin" && (
          <TelemetryDashboard token={auth.token} />
        )}
        {route.name === "telemetry" && auth.token && auth.customer && auth.customer.role !== "admin" && (
          <div className="page page--narrow">
            <div className="card">
              <div style={{ textAlign: "center", padding: "2rem" }}>
                <span style={{ fontSize: "2.5rem" }}>🔒</span>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0.5rem 0" }}>Administrator Access Required</h1>
                <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Telemetry &amp; Chaos Engineering controls are restricted to administrators.</p>
                <a href="#/portal" className="btn btn--primary" style={{ marginTop: "1rem" }}>Go to Workspace Hub</a>
              </div>
            </div>
          </div>
        )}
        {route.name === "telemetry" && auth.status === "anonymous" && (
          <div className="page page--narrow">
            <div className="card">
              <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                <span style={{ fontSize: "2.5rem" }}>⚡</span>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0.5rem 0" }}>Telemetry &amp; Observability Center</h1>
                <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Please sign in with your Administrator account to inspect telemetry, metrics, and circuit breaker health.</p>
              </div>
              <LoginPage
                onLogin={auth.login}
                onSuccess={() => navigate("/telemetry")}
                demoAccounts={DEMO_ACCOUNTS}
                demoAccount={DEMO_ACCOUNTS[2] || DEMO_ACCOUNTS[0]}
              />
            </div>
          </div>
        )}

        {route.name === "support" && (
          <SupportAgentDesk token={auth.token ?? ""} />
        )}

        {route.name === "notFound" && (
          <div className="page-state">
            <h1>Page not found</h1>
            <a className="btn btn--primary" href="#/">
              Back to the shop
            </a>
          </div>
        )}
      </main>

      {selectedProductId && (
        <ProductDetailModal
          productId={selectedProductId}
          storeId={storeConfig.store?.id}
          onClose={() => setSelectedProductId(null)}
          onStatusChange={handleDetailStatus}
          onAdd={cart.addItem}
          onAdded={(name) => setToast({ text: `Added “${name}” to your cart`, tone: "success" })}
        />
      )}

      <CartDrawer
        isOpen={cartOpen}
        cart={cart.cart}
        error={cart.error}
        onClose={() => setCartOpen(false)}
        onUpdateQuantity={cart.updateQuantity}
        onRemoveItem={cart.removeItem}
        onCheckout={() => {
          setCartOpen(false);
          navigate("/checkout");
        }}
      />

      <ChatDrawer
        isOpen={aiChatOpen}
        onClose={() => setAiChatOpen(false)}
        storeId={storeConfig.store?.id}
        token={auth.token}
        onAddToCart={(id, q) => cart.addItem(id, q, undefined, storeConfig.store?.id)}
      />

      {toast && (
        <div className={`toast toast--${toast.tone}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}

export default App;
