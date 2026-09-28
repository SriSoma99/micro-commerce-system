import { useCallback, useEffect, useState } from "react";
import { getAccountingOverview, getTransactionLogs } from "../api/accounting";
import type {
  AccountingLedgerOverview,
  ProductVelocityItem,
  TransactionAuditItem,
} from "../types/accounting";

interface AnalyticsDashboardProps {
  token: string;
  storeId?: string;
}

type SubSection = "overview" | "transactions" | "monthly" | "margins" | "velocity" | "regional" | "tax";

export function AnalyticsDashboard({ token, storeId }: AnalyticsDashboardProps) {
  const [subSection, setSubSection] = useState<SubSection>("overview");
  const [overview, setOverview] = useState<AccountingLedgerOverview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [velocityFilter, setVelocityFilter] = useState<"all" | "fast" | "slow" | "dead" | "expiry">("all");

  // Transaction audit state
  const [transactions, setTransactions] = useState<TransactionAuditItem[]>([]);
  const [txLoading, setTxLoading] = useState<boolean>(false);
  const [txTotal, setTxTotal] = useState<number>(0);
  const [txSearch, setTxSearch] = useState<string>("");
  const [txPaymentMethod, setTxPaymentMethod] = useState<string>("");
  const [txStatus, setTxStatus] = useState<string>("");
  const [txPage, setTxPage] = useState<number>(0);
  const TX_LIMIT = 25;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAccountingOverview(token, storeId);
      if (res.ok) {
        setOverview(res.data);
      } else {
        setError(res.message || "Failed to load financial ledger data");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error connecting to accounting service");
    } finally {
      setLoading(false);
    }
  }, [token, storeId]);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const res = await getTransactionLogs(token, {
        storeId,
        limit: TX_LIMIT,
        offset: txPage * TX_LIMIT,
        search: txSearch || undefined,
        paymentMethod: txPaymentMethod || undefined,
        status: txStatus || undefined,
      });
      if (res.ok) {
        setTransactions(res.data.transactions);
        setTxTotal(res.data.totalCount);
      }
    } catch {
      // ignore
    } finally {
      setTxLoading(false);
    }
  }, [token, storeId, txPage, txSearch, txPaymentMethod, txStatus]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (subSection === "transactions") {
      loadTransactions();
    }
  }, [subSection, loadTransactions]);

  const formatUsd = (minor: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(minor / 100);
  };

  if (loading && !overview) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
        <div style={{ fontSize: "2rem", marginBottom: "12px" }}>📊</div>
        <p style={{ fontWeight: 600 }}>Loading Accounting Ledger & Financial Analytics...</p>
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div style={{ padding: "24px", background: "#fef2f2", border: "1px solid #f87171", borderRadius: "12px", color: "#991b1b" }}>
        <h3 style={{ margin: "0 0 8px 0" }}>Financial Report Unavailable</h3>
        <p style={{ margin: "0 0 16px 0" }}>{error}</p>
        <button
          onClick={loadData}
          style={{
            background: "#dc2626",
            color: "#fff",
            border: "none",
            padding: "8px 16px",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!overview) return null;

  const { margins, monthlyTrends, pipeline, velocity, regional, taxLedger, dailySales } = overview;

  return (
    <div className="analytics-dashboard" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          padding: "20px 24px",
          background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
          borderRadius: "16px",
          color: "#f8fafc",
          boxShadow: "0 4px 20px -2px rgba(0,0,0,0.15)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "1.8rem" }}>📊</span>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>Financial Analytics & Accounting Ledger</h2>
              <p style={{ margin: "4px 0 0 0", color: "#94a3b8", fontSize: "0.85rem" }}>
                Multi-Store P&amp;L, 12-Month Sales History, COGS Margins &amp; State Tax Liability (ACC-01..07)
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
            Updated: {new Date(overview.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            onClick={loadData}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#f8fafc",
              padding: "6px 14px",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 4px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            12-Mo Gross Revenue
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", marginTop: "8px" }}>
            {formatUsd(margins.grossRevenueMinor)}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#16a34a", marginTop: "4px", fontWeight: 600 }}>
            Avg {formatUsd(monthlyTrends.averageMonthlyRevenueMinor)} / mo
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 4px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Cost of Goods (COGS)
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#475569", marginTop: "8px" }}>
            {formatUsd(margins.cogsMinor)}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>
            WAC inventory cost basis
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 4px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Gross Profit &amp; Margin
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#16a34a", marginTop: "8px" }}>
            {formatUsd(margins.grossProfitMinor)}
          </div>
          <div style={{ display: "inline-block", padding: "2px 8px", background: "#dcfce7", color: "#15803d", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 700, marginTop: "4px" }}>
            {margins.grossMarginPercent.toFixed(1)}% Gross Margin
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 4px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Tax Liability Collected
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0284c7", marginTop: "8px" }}>
            {formatUsd(taxLedger.totalTaxCollectedMinor)}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>
            Across {taxLedger.jurisdictions.length} States (IL, OH, PA)
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 2px 4px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Active Orders Pipeline
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f59e0b", marginTop: "8px" }}>
            {pipeline.activeOrderCount} Orders
          </div>
          <div style={{ fontSize: "0.8rem", color: "#d97706", marginTop: "4px", fontWeight: 600 }}>
            {formatUsd(pipeline.activeOrderValueMinor)} in fulfilment
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "2px solid #e2e8f0",
          gap: "8px",
          overflowX: "auto",
        }}
      >
        {[
          { key: "overview", label: "📈 Executive Overview" },
          { key: "transactions", label: "💳 Transactions & Card Audit" },
          { key: "monthly", label: "📅 12-Month Trends" },
          { key: "margins", label: "💰 Category & Store Margins" },
          { key: "velocity", label: "⚡ Product Velocity & Aging" },
          { key: "regional", label: "🏬 Regional Breakdown" },
          { key: "tax", label: "🏛️ Sales Tax Ledger" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubSection(tab.key as SubSection)}
            style={{
              padding: "10px 18px",
              background: "none",
              border: "none",
              borderBottom: subSection === tab.key ? "3px solid #2563eb" : "3px solid transparent",
              color: subSection === tab.key ? "#2563eb" : "#64748b",
              fontWeight: subSection === tab.key ? 700 : 500,
              cursor: "pointer",
              fontSize: "0.9rem",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT: Executive Overview */}
      {subSection === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Fulfilment Pipeline Funnel */}
          <div
            style={{
              background: "#ffffff",
              padding: "24px",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
              ⚡ Fulfilment Pipeline Volume &amp; Status (ACC-02)
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "12px",
              }}
            >
              {[
                { label: "Placed", metric: pipeline.stages.placed, color: "#3b82f6", bg: "#eff6ff" },
                { label: "Packed", metric: pipeline.stages.packed, color: "#8b5cf6", bg: "#f5f3ff" },
                { label: "Ready for Pickup", metric: pipeline.stages.ready, color: "#f59e0b", bg: "#fffbeb" },
                { label: "Collected / Delivered", metric: pipeline.stages.collected, color: "#10b981", bg: "#ecfdf5" },
                { label: "Refunded", metric: pipeline.stages.refunded, color: "#64748b", bg: "#f1f5f9" },
                { label: "Cancelled", metric: pipeline.stages.cancelled, color: "#ef4444", bg: "#fef2f2" },
              ].map((stage) => (
                <div
                  key={stage.label}
                  style={{
                    background: stage.bg,
                    border: `1px solid ${stage.color}40`,
                    borderRadius: "10px",
                    padding: "14px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: stage.color, textTransform: "uppercase" }}>
                    {stage.label}
                  </div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a", margin: "6px 0" }}>
                    {stage.metric?.count || 0}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                    {formatUsd(stage.metric?.totalMinor || 0)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 30-Day Daily Sales Sample */}
          <div
            style={{
              background: "#ffffff",
              padding: "24px",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
                📅 Recent Daily Sales Ledger (ACC-01)
              </h3>
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>Last 30 Days</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                    <th style={{ padding: "10px 14px" }}>Date</th>
                    <th style={{ padding: "10px 14px" }}>Orders</th>
                    <th style={{ padding: "10px 14px" }}>Gross Sales</th>
                    <th style={{ padding: "10px 14px" }}>Tax Collected</th>
                    <th style={{ padding: "10px 14px" }}>Net Sales</th>
                    <th style={{ padding: "10px 14px" }}>AOV</th>
                    <th style={{ padding: "10px 14px" }}>Payment Mix</th>
                  </tr>
                </thead>
                <tbody>
                  {dailySales.slice(0, 10).map((d) => (
                    <tr key={d.date} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{d.date}</td>
                      <td style={{ padding: "10px 14px" }}>{d.orderCount}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{formatUsd(d.grossSalesMinor)}</td>
                      <td style={{ padding: "10px 14px", color: "#0284c7" }}>{formatUsd(d.taxMinor)}</td>
                      <td style={{ padding: "10px 14px", color: "#16a34a", fontWeight: 600 }}>{formatUsd(d.netSalesMinor)}</td>
                      <td style={{ padding: "10px 14px" }}>{formatUsd(d.averageOrderValueMinor)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                          {Object.entries(d.paymentBreakdown).map(([method, data]) => (
                            <span
                              key={method}
                              style={{
                                padding: "2px 6px",
                                background: "#f1f5f9",
                                borderRadius: "4px",
                                fontSize: "0.75rem",
                                color: "#475569",
                              }}
                            >
                              {method}: {data.count}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Transactions & Credit Card Audit */}
      {subSection === "transactions" && (
        <div
          style={{
            background: "#ffffff",
            padding: "24px",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
                💳 Payment Transactions &amp; Credit Card Audit Log (ACC-08)
              </h3>
              <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.85rem" }}>
                Finance officer audit trail: Customer order payments, masked card details, authorization tokens, and settlement statuses
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600 }}>
                Total Records: <strong style={{ color: "#0f172a" }}>{txTotal}</strong>
              </span>
              <button
                onClick={loadTransactions}
                style={{
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                🔄 Refresh Logs
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
              padding: "16px",
              background: "#f8fafc",
              borderRadius: "10px",
              border: "1px solid #e2e8f0",
            }}
          >
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginBottom: "4px", textTransform: "uppercase" }}>
                Search Order / Card / Customer
              </label>
              <input
                type="text"
                value={txSearch}
                onChange={(e) => {
                  setTxSearch(e.target.value);
                  setTxPage(0);
                }}
                placeholder="e.g. 4242, Alex, ord_..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginBottom: "4px", textTransform: "uppercase" }}>
                Payment Method
              </label>
              <select
                value={txPaymentMethod}
                onChange={(e) => {
                  setTxPaymentMethod(e.target.value);
                  setTxPage(0);
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  background: "#fff",
                }}
              >
                <option value="">All Payment Types</option>
                <option value="credit_card">Credit Card (Visa / MC / Amex)</option>
                <option value="debit_card">Debit Card</option>
                <option value="ebt_snap">SNAP / EBT Benefits</option>
                <option value="apple_pay">Apple Pay / Digital Wallet</option>
                <option value="cash">Cash on Collection</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginBottom: "4px", textTransform: "uppercase" }}>
                Order Status
              </label>
              <select
                value={txStatus}
                onChange={(e) => {
                  setTxStatus(e.target.value);
                  setTxPage(0);
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  background: "#fff",
                }}
              >
                <option value="">All Statuses</option>
                <option value="collected">Collected / Settled</option>
                <option value="ready">Ready for Pickup</option>
                <option value="packed">Packed</option>
                <option value="placed">Placed (Pending)</option>
                <option value="refunded">Refunded</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Transactions Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                  <th style={{ padding: "10px 14px" }}>Date &amp; Time</th>
                  <th style={{ padding: "10px 14px" }}>Order ID</th>
                  <th style={{ padding: "10px 14px" }}>Customer / Account</th>
                  <th style={{ padding: "10px 14px" }}>Store</th>
                  <th style={{ padding: "10px 14px" }}>Payment &amp; Card Audit</th>
                  <th style={{ padding: "10px 14px" }}>Auth Reference</th>
                  <th style={{ padding: "10px 14px" }}>Subtotal</th>
                  <th style={{ padding: "10px 14px" }}>Tax</th>
                  <th style={{ padding: "10px 14px" }}>Total</th>
                  <th style={{ padding: "10px 14px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {txLoading ? (
                  <tr>
                    <td colSpan={10} style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>
                      Loading payment transactions audit log...
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>
                      No transaction records match the specified filters.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const brand = tx.cardBrand || (tx.paymentMethod === "ebt_snap" ? "SNAP" : tx.paymentMethod === "apple_pay" ? "ApplePay" : "Card");
                    const isCreditOrDebit = tx.paymentMethod === "credit_card" || tx.paymentMethod === "debit_card";
                    const isEbt = tx.paymentMethod === "ebt_snap";
                    const isApplePay = tx.paymentMethod === "apple_pay";

                    return (
                      <tr key={tx.orderId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "#334155" }}>
                          <div>{new Date(tx.placedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</div>
                          <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{new Date(tx.placedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                        </td>
                        <td style={{ padding: "10px 14px", fontWeight: 700, color: "#2563eb", fontFamily: "monospace" }}>
                          {tx.orderId}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ fontWeight: 600, color: "#0f172a" }}>{tx.customerName}</div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{tx.customerEmail}</div>
                        </td>
                        <td style={{ padding: "10px 14px", color: "#475569" }}>
                          <span style={{ fontWeight: 600 }}>{tx.storeName}</span>
                          <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>({tx.storeId})</div>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                background: isCreditOrDebit ? "#e0e7ff" : isEbt ? "#fef3c7" : isApplePay ? "#f3e8ff" : "#f1f5f9",
                                color: isCreditOrDebit ? "#3730a3" : isEbt ? "#92400e" : isApplePay ? "#6b21a8" : "#475569",
                              }}
                            >
                              {isCreditOrDebit ? `💳 ${brand}` : isEbt ? "🌾 SNAP / EBT" : isApplePay ? "📱 Apple Pay" : "💵 Cash"}
                            </span>
                            {tx.cardLast4 && (
                              <span style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "#334155", fontWeight: 600 }}>
                                •••• {tx.cardLast4}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>
                            Pay Status: <strong style={{ color: tx.paymentStatus === "completed" ? "#16a34a" : "#ca8a04" }}>{tx.paymentStatus}</strong>
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: "0.75rem", color: "#64748b" }}>
                          {tx.paymentReference ? (
                            <span style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", border: "1px solid #e2e8f0" }}>
                              {tx.paymentReference}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td style={{ padding: "10px 14px" }}>{formatUsd(tx.subtotalMinor)}</td>
                        <td style={{ padding: "10px 14px", color: "#0284c7" }}>{formatUsd(tx.taxMinor)}</td>
                        <td style={{ padding: "10px 14px", fontWeight: 700, color: "#0f172a" }}>
                          {formatUsd(tx.totalMinor)}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 8px",
                              borderRadius: "12px",
                              fontWeight: 700,
                              fontSize: "0.75rem",
                              background:
                                tx.status === "collected"
                                  ? "#dcfce7"
                                  : tx.status === "ready" || tx.status === "packed"
                                  ? "#e0f2fe"
                                  : tx.status === "placed"
                                  ? "#fef3c7"
                                  : "#fee2e2",
                              color:
                                tx.status === "collected"
                                  ? "#15803d"
                                  : tx.status === "ready" || tx.status === "packed"
                                  ? "#0369a1"
                                  : tx.status === "placed"
                                  ? "#b45309"
                                  : "#b91c1c",
                            }}
                          >
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
              Showing {transactions.length > 0 ? txPage * TX_LIMIT + 1 : 0} to {Math.min((txPage + 1) * TX_LIMIT, txTotal)} of {txTotal} transactions
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                disabled={txPage === 0 || txLoading}
                onClick={() => setTxPage((p) => Math.max(0, p - 1))}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: txPage === 0 ? "#f1f5f9" : "#ffffff",
                  color: txPage === 0 ? "#94a3b8" : "#0f172a",
                  cursor: txPage === 0 ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                }}
              >
                ← Previous
              </button>
              <button
                disabled={(txPage + 1) * TX_LIMIT >= txTotal || txLoading}
                onClick={() => setTxPage((p) => p + 1)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: (txPage + 1) * TX_LIMIT >= txTotal ? "#f1f5f9" : "#ffffff",
                  color: (txPage + 1) * TX_LIMIT >= txTotal ? "#94a3b8" : "#0f172a",
                  cursor: (txPage + 1) * TX_LIMIT >= txTotal ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                }}
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 12-Month Trends */}
      {subSection === "monthly" && (
        <div
          style={{
            background: "#ffffff",
            padding: "24px",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
                📅 12-Month Revenue &amp; Growth Analysis (ACC-03, DATA-03)
              </h3>
              <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.85rem" }}>
                Month-over-month trajectory with seasonal and historical patterns
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Total 12-Mo Net Revenue</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#16a34a" }}>
                {formatUsd(monthlyTrends.total12MonthRevenueMinor)}
              </div>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                  <th style={{ padding: "10px 14px" }}>Month</th>
                  <th style={{ padding: "10px 14px" }}>Order Volume</th>
                  <th style={{ padding: "10px 14px" }}>Gross Revenue</th>
                  <th style={{ padding: "10px 14px" }}>Sales Tax</th>
                  <th style={{ padding: "10px 14px" }}>Net Revenue</th>
                  <th style={{ padding: "10px 14px" }}>AOV</th>
                  <th style={{ padding: "10px 14px" }}>MoM Growth</th>
                  <th style={{ padding: "10px 14px" }}>Trajectory</th>
                </tr>
              </thead>
              <tbody>
                {monthlyTrends.months.map((m) => {
                  const maxRev = Math.max(...monthlyTrends.months.map((x) => x.netRevenueMinor), 1);
                  const barWidth = Math.round((m.netRevenueMinor / maxRev) * 100);
                  const isPositive = (m.revenueGrowthPercent ?? 0) >= 0;

                  return (
                    <tr key={m.yearMonth} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#0f172a" }}>{m.monthName}</td>
                      <td style={{ padding: "10px 14px" }}>{m.orderCount}</td>
                      <td style={{ padding: "10px 14px" }}>{formatUsd(m.grossRevenueMinor)}</td>
                      <td style={{ padding: "10px 14px", color: "#0284c7" }}>{formatUsd(m.taxMinor)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#16a34a" }}>{formatUsd(m.netRevenueMinor)}</td>
                      <td style={{ padding: "10px 14px" }}>{formatUsd(m.averageOrderValueMinor)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        {m.revenueGrowthPercent !== null ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "12px",
                              fontWeight: 700,
                              fontSize: "0.75rem",
                              background: isPositive ? "#dcfce7" : "#fee2e2",
                              color: isPositive ? "#15803d" : "#b91c1c",
                            }}
                          >
                            {isPositive ? "↑" : "↓"} {Math.abs(m.revenueGrowthPercent).toFixed(1)}%
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", minWidth: "120px" }}>
                        <div style={{ background: "#f1f5f9", borderRadius: "4px", height: "12px", width: "100%", overflow: "hidden" }}>
                          <div
                            style={{
                              background: "linear-gradient(90deg, #3b82f6, #10b981)",
                              height: "100%",
                              width: `${barWidth}%`,
                              borderRadius: "4px",
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Margins & COGS */}
      {subSection === "margins" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Category Margins */}
          <div
            style={{
              background: "#ffffff",
              padding: "24px",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
              💰 Category Profitability &amp; COGS Margins (ACC-05)
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                    <th style={{ padding: "10px 14px" }}>Category</th>
                    <th style={{ padding: "10px 14px" }}>Gross Revenue</th>
                    <th style={{ padding: "10px 14px" }}>COGS (Cost of Goods)</th>
                    <th style={{ padding: "10px 14px" }}>Gross Profit</th>
                    <th style={{ padding: "10px 14px" }}>Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {margins.categories.map((c) => (
                    <tr key={c.category} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 700, textTransform: "capitalize" }}>{c.category}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{formatUsd(c.revenueMinor)}</td>
                      <td style={{ padding: "10px 14px", color: "#64748b" }}>{formatUsd(c.cogsMinor)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#16a34a" }}>{formatUsd(c.grossProfitMinor)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontWeight: 700,
                            fontSize: "0.75rem",
                            background: c.marginPercent >= 30 ? "#dcfce7" : "#fef3c7",
                            color: c.marginPercent >= 30 ? "#15803d" : "#b45309",
                          }}
                        >
                          {c.marginPercent.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Store Margins */}
          <div
            style={{
              background: "#ffffff",
              padding: "24px",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
              🏬 Retail Store Profit Margins
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                    <th style={{ padding: "10px 14px" }}>Store Name</th>
                    <th style={{ padding: "10px 14px" }}>State</th>
                    <th style={{ padding: "10px 14px" }}>Revenue</th>
                    <th style={{ padding: "10px 14px" }}>COGS</th>
                    <th style={{ padding: "10px 14px" }}>Gross Profit</th>
                    <th style={{ padding: "10px 14px" }}>Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {margins.stores.map((s) => (
                    <tr key={s.storeId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 700 }}>
                        {s.storeName} ({s.storeId})
                      </td>
                      <td style={{ padding: "10px 14px" }}>{s.state}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{formatUsd(s.revenueMinor)}</td>
                      <td style={{ padding: "10px 14px", color: "#64748b" }}>{formatUsd(s.cogsMinor)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#16a34a" }}>{formatUsd(s.grossProfitMinor)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontWeight: 700,
                            fontSize: "0.75rem",
                            background: "#dcfce7",
                            color: "#15803d",
                          }}
                        >
                          {s.marginPercent.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Product Velocity & Expiry Aging */}
      {subSection === "velocity" && (
        <div
          style={{
            background: "#ffffff",
            padding: "24px",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
                ⚡ Product Velocity &amp; Expiry Risk (ACC-04)
              </h3>
              <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.85rem" }}>
                Classification based on 30-day movement: Fast (&gt;15 units), Slow (1-15 units), Dead (0 units), and Near Expiry (&lt;30 days)
              </p>
            </div>

            {/* Filter pills */}
            <div style={{ display: "flex", gap: "6px" }}>
              {[
                { key: "all", label: `All (${velocity.totalSkusTracked})` },
                { key: "fast", label: `⚡ Fast Moving (${velocity.fastMoving.length})` },
                { key: "slow", label: `⏳ Slow Moving (${velocity.slowMoving.length})` },
                { key: "dead", label: `🛑 Dead Stock (${velocity.deadStock.length})` },
                { key: "expiry", label: `⚠️ Near Expiry (${velocity.nearExpiryItems.length})` },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setVelocityFilter(f.key as any)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "20px",
                    border: "1px solid #cbd5e1",
                    background: velocityFilter === f.key ? "#1e293b" : "#f8fafc",
                    color: velocityFilter === f.key ? "#ffffff" : "#475569",
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Velocity items table */}
          {(() => {
            let items: ProductVelocityItem[] = [];
            if (velocityFilter === "all") {
              items = [...velocity.fastMoving, ...velocity.slowMoving, ...velocity.deadStock];
            } else if (velocityFilter === "fast") {
              items = velocity.fastMoving;
            } else if (velocityFilter === "slow") {
              items = velocity.slowMoving;
            } else if (velocityFilter === "dead") {
              items = velocity.deadStock;
            } else if (velocityFilter === "expiry") {
              items = velocity.nearExpiryItems;
            }

            return (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                      <th style={{ padding: "10px 14px" }}>Product</th>
                      <th style={{ padding: "10px 14px" }}>Category / Sub</th>
                      <th style={{ padding: "10px 14px" }}>Velocity</th>
                      <th style={{ padding: "10px 14px" }}>Units Sold (30d)</th>
                      <th style={{ padding: "10px 14px" }}>Revenue (30d)</th>
                      <th style={{ padding: "10px 14px" }}>Current Stock</th>
                      <th style={{ padding: "10px 14px" }}>WAC Cost</th>
                      <th style={{ padding: "10px 14px" }}>Expiry Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.slice(0, 30).map((p) => {
                      let badgeBg = "#f1f5f9";
                      let badgeColor = "#475569";
                      if (p.velocity === "fast") {
                        badgeBg = "#dcfce7";
                        badgeColor = "#15803d";
                      } else if (p.velocity === "slow") {
                        badgeBg = "#fef3c7";
                        badgeColor = "#b45309";
                      } else if (p.velocity === "dead") {
                        badgeBg = "#fee2e2";
                        badgeColor = "#b91c1c";
                      }

                      return (
                        <tr key={p.productId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "10px 14px", fontWeight: 700, color: "#0f172a" }}>
                            {p.name}
                            <span style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8", fontWeight: 400 }}>
                              SKU: {p.productId}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px", color: "#475569" }}>
                            {p.category} &rsaquo; {p.department}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 8px",
                                borderRadius: "12px",
                                fontWeight: 700,
                                fontSize: "0.75rem",
                                background: badgeBg,
                                color: badgeColor,
                                textTransform: "capitalize",
                              }}
                            >
                              {p.velocity}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px", fontWeight: 600 }}>{p.unitsSold30d}</td>
                          <td style={{ padding: "10px 14px", color: "#16a34a", fontWeight: 600 }}>
                            {formatUsd(p.revenue30dMinor)}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ fontWeight: p.currentStock < 10 ? 700 : 400, color: p.currentStock < 10 ? "#dc2626" : "#0f172a" }}>
                              {p.currentStock} units
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px", color: "#64748b" }}>{formatUsd(p.wacCostMinor)}</td>
                          <td style={{ padding: "10px 14px" }}>
                            {p.isNearExpiry ? (
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 8px",
                                  borderRadius: "12px",
                                  fontWeight: 700,
                                  fontSize: "0.75rem",
                                  background: "#fee2e2",
                                  color: "#b91c1c",
                                }}
                              >
                                ⚠️ Expires {p.earliestExpiryDate?.slice(0, 10)}
                              </span>
                            ) : (
                              <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>OK</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB CONTENT: Regional Breakdown */}
      {subSection === "regional" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Store Breakdown */}
          <div
            style={{
              background: "#ffffff",
              padding: "24px",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
              🏬 Retail Store Revenue Breakdown (ACC-06)
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                    <th style={{ padding: "10px 14px" }}>Store</th>
                    <th style={{ padding: "10px 14px" }}>State</th>
                    <th style={{ padding: "10px 14px" }}>Orders</th>
                    <th style={{ padding: "10px 14px" }}>Revenue</th>
                    <th style={{ padding: "10px 14px" }}>Tax Collected</th>
                    <th style={{ padding: "10px 14px" }}>Market Share %</th>
                  </tr>
                </thead>
                <tbody>
                  {regional.stores.map((s) => (
                    <tr key={s.storeId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 700 }}>
                        {s.storeName} ({s.storeId})
                      </td>
                      <td style={{ padding: "10px 14px" }}>{s.state}</td>
                      <td style={{ padding: "10px 14px" }}>{s.orderCount}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#16a34a" }}>{formatUsd(s.revenueMinor)}</td>
                      <td style={{ padding: "10px 14px", color: "#0284c7" }}>{formatUsd(s.taxMinor)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ background: "#f1f5f9", borderRadius: "4px", height: "8px", width: "80px", overflow: "hidden" }}>
                            <div style={{ background: "#3b82f6", height: "100%", width: `${s.shareOfTotalPercent}%` }} />
                          </div>
                          <span style={{ fontWeight: 700 }}>{s.shareOfTotalPercent.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* State Aggregation */}
          <div
            style={{
              background: "#ffffff",
              padding: "24px",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
              🗺️ State &amp; Tax Jurisdiction Aggregation
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                    <th style={{ padding: "10px 14px" }}>Jurisdiction</th>
                    <th style={{ padding: "10px 14px" }}>Orders</th>
                    <th style={{ padding: "10px 14px" }}>Revenue</th>
                    <th style={{ padding: "10px 14px" }}>Tax Collected</th>
                    <th style={{ padding: "10px 14px" }}>State Share %</th>
                  </tr>
                </thead>
                <tbody>
                  {regional.states.map((st) => (
                    <tr key={st.state} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 700 }}>{st.state}</td>
                      <td style={{ padding: "10px 14px" }}>{st.orderCount}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#16a34a" }}>{formatUsd(st.revenueMinor)}</td>
                      <td style={{ padding: "10px 14px", color: "#0284c7" }}>{formatUsd(st.taxMinor)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700 }}>{st.shareOfTotalPercent.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Sales Tax Ledger */}
      {subSection === "tax" && (
        <div
          style={{
            background: "#ffffff",
            padding: "24px",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
                🏛️ Multi-State Sales Tax Liability Ledger (ACC-07)
              </h3>
              <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.85rem" }}>
                Accrued sales tax payable per state statutory tax code and jurisdiction
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Total Tax Remittance Due</div>
              <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0284c7" }}>
                {formatUsd(taxLedger.totalTaxCollectedMinor)}
              </div>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#475569" }}>
                  <th style={{ padding: "10px 14px" }}>State Jurisdiction</th>
                  <th style={{ padding: "10px 14px" }}>Orders Handled</th>
                  <th style={{ padding: "10px 14px" }}>Taxable Sales Base</th>
                  <th style={{ padding: "10px 14px" }}>Tax Collected</th>
                  <th style={{ padding: "10px 14px" }}>Effective Rate</th>
                </tr>
              </thead>
              <tbody>
                {taxLedger.jurisdictions.map((j) => (
                  <tr key={j.jurisdiction} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: "#0f172a" }}>
                      {j.jurisdiction === "IL" ? "Illinois (IL)" : j.jurisdiction === "OH" ? "Ohio (OH)" : "Pennsylvania (PA)"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>{j.orderCount}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 600 }}>{formatUsd(j.taxableSalesMinor)}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: "#0284c7" }}>
                      {formatUsd(j.taxCollectedMinor)}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          fontWeight: 700,
                          fontSize: "0.75rem",
                          background: "#e0f2fe",
                          color: "#0369a1",
                        }}
                      >
                        {(j.effectiveTaxRateBps / 100).toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
