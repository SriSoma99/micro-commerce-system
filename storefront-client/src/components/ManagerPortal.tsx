import { useCallback, useEffect, useState, useId } from "react";
import {
  adjustStock,
  createGoodsReceipt,
  getStoreInventory,
  listGoodsReceipts,
  listStockAdjustments,
  listStockTransfers,
  transferStock,
  uploadGrnCsv,
} from "../api/receiving";
import type { Customer } from "../types/account";
import type {
  AdjustmentReason,
  GoodsReceipt,
  StockAdjustment,
  StockTransfer,
  StoreInventoryRecord,
} from "../types/receiving";
import type { StoreLocation } from "../types/store";

import { CopilotTab } from "./CopilotTab";

interface ManagerPortalProps {
  token: string;
  customer: Customer;
  stores?: StoreLocation[];
  initialTab?: TabKey;
}

type TabKey = "inventory" | "grn" | "csv" | "transfers" | "adjustments" | "history" | "copilot";

interface GrnRowState {
  productId: string;
  quantity: number;
  unitCostMinor: number;
  batchNumber: string;
  expiryDate: string;
}

export function ManagerPortal({ token, customer, stores, initialTab = "inventory" }: ManagerPortalProps) {
  const isAuthorized = customer.role === "store-manager" || customer.role === "admin";
  const defaultStoreId = customer.preferredStoreId || stores?.[0]?.id || "IL-01";
  const [selectedStoreId, setSelectedStoreId] = useState<string>(defaultStoreId);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // Inventory state
  const [inventory, setInventory] = useState<StoreInventoryRecord[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Manual GRN Form State
  const [supplier, setSupplier] = useState("");
  const [poReference, setPoReference] = useState(`PO-${Date.now().toString().slice(-6)}`);
  const [grnNotes, setGrnNotes] = useState("");
  const [grnItems, setGrnItems] = useState<GrnRowState[]>([
    {
      productId: "",
      quantity: 10,
      unitCostMinor: 250,
      batchNumber: `BAT-${Date.now().toString().slice(-4)}`,
      expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
    },
  ]);
  const [submittingGrn, setSubmittingGrn] = useState(false);

  // CSV Bulk Upload State
  const [csvText, setCsvText] = useState("");
  const [csvUploading, setCsvUploading] = useState(false);

  // Transfer State
  const [transferDestStore, setTransferDestStore] = useState("");
  const [transferProductId, setTransferProductId] = useState("");
  const [transferQty, setTransferQty] = useState(1);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);

  // Adjustment State
  const [adjustProductId, setAdjustProductId] = useState("");
  const [adjustDelta, setAdjustDelta] = useState(-1);
  const [adjustReason, setAdjustReason] = useState<AdjustmentReason>("damage");
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  // History State
  const [historyReceipts, setHistoryReceipts] = useState<GoodsReceipt[]>([]);
  const [historyTransfers, setHistoryTransfers] = useState<StockTransfer[]>([]);
  const [historyAdjustments, setHistoryAdjustments] = useState<StockAdjustment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Feedback Messages
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  // Unique IDs for form controls
  const storeSelectId = useId();
  const searchInventoryId = useId();
  const supplierInputId = useId();
  const poRefInputId = useId();
  const notesInputId = useId();
  const csvAreaId = useId();
  const destStoreSelectId = useId();
  const transferProductSelectId = useId();
  const transferQtyInputId = useId();
  const adjustProductSelectId = useId();
  const adjustDeltaInputId = useId();
  const adjustReasonSelectId = useId();

  // Load Inventory
  const fetchInventory = useCallback(async () => {
    if (!token || !selectedStoreId) return;
    setLoadingInventory(true);
    const res = await getStoreInventory(selectedStoreId, token);
    setLoadingInventory(false);
    if (res.ok) {
      setInventory(res.data.inventory);
    } else {
      setFeedback({ tone: "error", message: res.message });
    }
  }, [token, selectedStoreId]);

  // Load History
  const fetchHistory = useCallback(async () => {
    if (!token || !selectedStoreId) return;
    setLoadingHistory(true);
    const [rcptRes, trfRes, adjRes] = await Promise.all([
      listGoodsReceipts(selectedStoreId, token),
      listStockTransfers(selectedStoreId, token),
      listStockAdjustments(selectedStoreId, token),
    ]);
    setLoadingHistory(false);
    if (rcptRes.ok) setHistoryReceipts(rcptRes.data.receipts);
    if (trfRes.ok) setHistoryTransfers(trfRes.data.transfers);
    if (adjRes.ok) setHistoryAdjustments(adjRes.data.adjustments);
  }, [token, selectedStoreId]);

  useEffect(() => {
    if (isAuthorized) {
      void fetchInventory();
    }
  }, [fetchInventory, isAuthorized]);

  useEffect(() => {
    if (activeTab === "history" && isAuthorized) {
      void fetchHistory();
    }
  }, [activeTab, fetchHistory, isAuthorized]);

  if (!isAuthorized) {
    return (
      <div className="page page--narrow">
        <div className="banner banner--warning" style={{ marginTop: "2rem" }}>
          <h2>Access Restricted</h2>
          <p>This store management portal is reserved for Store Managers and Administrators.</p>
          <a href="#/" className="btn btn--primary" style={{ marginTop: "1rem" }}>
            Return to Storefront
          </a>
        </div>
      </div>
    );
  }

  // Handle GRN Item changes
  const updateGrnItem = (index: number, patch: Partial<GrnRowState>) => {
    setGrnItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const addGrnItem = () => {
    setGrnItems((prev) => [
      ...prev,
      {
        productId: inventory[0]?.productId || "",
        quantity: 10,
        unitCostMinor: 250,
        batchNumber: `BAT-${Date.now().toString().slice(-4)}`,
        expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
      },
    ]);
  };

  const removeGrnItem = (index: number) => {
    if (grnItems.length <= 1) return;
    setGrnItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit Manual GRN
  const handleCreateGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!supplier.trim()) {
      setFeedback({ tone: "error", message: "Supplier name is required" });
      return;
    }
    if (grnItems.some((it) => !it.productId || it.quantity <= 0)) {
      setFeedback({ tone: "error", message: "All receipt lines must have a selected product and positive quantity" });
      return;
    }

    setSubmittingGrn(true);
    const res = await createGoodsReceipt(
      {
        storeId: selectedStoreId,
        supplier: supplier.trim(),
        poReference: poReference.trim(),
        notes: grnNotes.trim() || undefined,
        items: grnItems.map((it) => ({
          productId: it.productId,
          quantity: Number(it.quantity),
          unitCostMinor: Number(it.unitCostMinor),
          batchNumber: it.batchNumber.trim(),
          expiryDate: it.expiryDate.trim(),
        })),
      },
      token
    );
    setSubmittingGrn(false);

    if (res.ok) {
      setFeedback({
        tone: "success",
        message: `Successfully generated Goods Receipt Note #${res.data.grn.grnNumber}! Stock updated.`,
      });
      setSupplier("");
      setPoReference(`PO-${Date.now().toString().slice(-6)}`);
      setGrnNotes("");
      void fetchInventory();
    } else {
      setFeedback({ tone: "error", message: res.message });
    }
  };

  // Submit CSV Bulk Ingestion
  const handleCsvUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!csvText.trim()) {
      setFeedback({ tone: "error", message: "Please enter or paste CSV shipment content" });
      return;
    }

    setCsvUploading(true);
    const res = await uploadGrnCsv(selectedStoreId, csvText, token);
    setCsvUploading(false);

    if (res.ok) {
      setFeedback({
        tone: "success",
        message: `Successfully processed ${res.data.processedRows} items into GRN #${res.data.grn.grnNumber}!`,
      });
      setCsvText("");
      void fetchInventory();
    } else {
      const detailsMsg = res.details?.length ? ` (${res.details.join("; ")})` : "";
      setFeedback({ tone: "error", message: `${res.message}${detailsMsg}` });
    }
  };

  // Submit Stock Transfer
  const handleStockTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!transferDestStore) {
      setFeedback({ tone: "error", message: "Please select a destination store" });
      return;
    }
    if (transferDestStore === selectedStoreId) {
      setFeedback({ tone: "error", message: "Destination store must be different from source store" });
      return;
    }
    if (!transferProductId) {
      setFeedback({ tone: "error", message: "Please select a product to transfer" });
      return;
    }

    setSubmittingTransfer(true);
    const res = await transferStock(selectedStoreId, transferDestStore, transferProductId, Number(transferQty), token);
    setSubmittingTransfer(false);

    if (res.ok) {
      setFeedback({
        tone: "success",
        message: `Transferred ${transferQty} unit(s) successfully! Transfer ref: ${res.data.transfer.transferNumber}`,
      });
      setTransferQty(1);
      void fetchInventory();
    } else {
      setFeedback({ tone: "error", message: res.message });
    }
  };

  // Submit Stock Adjustment
  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!adjustProductId) {
      setFeedback({ tone: "error", message: "Please select a product for adjustment" });
      return;
    }
    if (adjustDelta === 0) {
      setFeedback({ tone: "error", message: "Adjustment quantity cannot be 0" });
      return;
    }

    setSubmittingAdjust(true);
    const res = await adjustStock(selectedStoreId, adjustProductId, Number(adjustDelta), adjustReason, token);
    setSubmittingAdjust(false);

    if (res.ok) {
      setFeedback({
        tone: "success",
        message: `Inventory adjusted by ${adjustDelta} units (${adjustReason}).`,
      });
      setAdjustDelta(-1);
      void fetchInventory();
    } else {
      setFeedback({ tone: "error", message: res.message });
    }
  };

  const filteredInventory = inventory.filter((item) => {
    const matchesSearch =
      inventorySearch === "" ||
      item.productName.toLowerCase().includes(inventorySearch.toLowerCase()) ||
      item.productId.toLowerCase().includes(inventorySearch.toLowerCase()) ||
      item.brand.toLowerCase().includes(inventorySearch.toLowerCase());
    const matchesLowStock = !onlyLowStock || item.isLowStock;
    return matchesSearch && matchesLowStock;
  });

  const sampleCsvExample = `sku,supplier,po_reference,quantity,unit_cost,batch,expiry\n${inventory[0]?.productId || "p-00001"},Fresh Farms LLC,PO-2026-8801,50,2.15,BATCH-991,2026-12-31\n${inventory[1]?.productId || "p-00002"},Valley Distributors,PO-2026-8801,30,1.80,BATCH-992,2026-11-30`;

  return (
    <div className="page">
      {/* Header & Store Selector */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <h1 className="page__title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>🏢</span> Store Manager & Goods Receiving
          </h1>
          <p className="page__subtitle" style={{ margin: 0 }}>
            Manage warehouse intake (GRN), CSV bulk shipments, per-store stock, inter-store transfers, and shrinkage.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "var(--color-surface)", padding: "0.5rem 1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
          <label htmlFor={storeSelectId} style={{ fontWeight: 600, fontSize: "0.9rem" }}>Active Store:</label>
          <select
            id={storeSelectId}
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            style={{ padding: "0.4rem 0.8rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "inherit", fontWeight: 600 }}
          >
            {stores && stores.length > 0 ? (
              stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))
            ) : (
              <>
                <option value="IL-01">Lincoln Park Superstore (IL-01)</option>
                <option value="OH-01">Short North Express (OH-01)</option>
                <option value="PA-01">Center City Market (PA-01)</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div className={`banner banner--${feedback.tone}`} role="status" style={{ marginBottom: "1.5rem" }}>
          {feedback.message}
        </div>
      )}

      {/* Tabs Navigation */}
      <nav aria-label="Store Manager Sections" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", borderBottom: "2px solid var(--color-border)", paddingBottom: "0.5rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button
            type="button"
            className={`btn ${activeTab === "inventory" ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setActiveTab("inventory")}
          >
            📊 Store Inventory ({inventory.length})
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "grn" ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setActiveTab("grn")}
          >
            📦 Goods Receipt (GRN)
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "csv" ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setActiveTab("csv")}
          >
            📄 Bulk CSV Shipment
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "transfers" ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setActiveTab("transfers")}
          >
            🔄 Stock Transfer
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "adjustments" ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setActiveTab("adjustments")}
          >
            📉 Wastage & Shrinkage
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "history" ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setActiveTab("history")}
          >
            📜 Receiving Audit History
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "copilot" ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setActiveTab("copilot")}
            style={{ fontWeight: 700, background: activeTab === "copilot" ? "#0284c7" : undefined, borderColor: "#0284c7" }}
          >
            🤖 AI Copilot
          </button>
        </div>

        <a
          href="#/finance"
          className="btn btn--ghost btn--sm"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "#065f46", background: "#d1fae5", fontWeight: 700, borderRadius: "6px", textDecoration: "none" }}
        >
          <span>📈</span> Go to Finance Portal →
        </a>
      </nav>

      {/* TAB 1: STORE INVENTORY */}
      {activeTab === "inventory" && (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem", flex: "1 1 320px", alignItems: "center" }}>
              <input
                id={searchInventoryId}
                type="text"
                className="input"
                placeholder="Search SKU, Product Name, Brand..."
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                style={{ flex: 1, minWidth: "220px" }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={onlyLowStock}
                  onChange={(e) => setOnlyLowStock(e.target.checked)}
                />
                <span style={{ fontWeight: 600, color: "var(--color-danger, #d9534f)" }}>⚠️ Low Stock Only</span>
              </label>
            </div>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => void fetchInventory()} disabled={loadingInventory}>
              {loadingInventory ? "Refreshing..." : "🔄 Refresh"}
            </button>
          </div>

          <div style={{ overflowX: "auto", background: "var(--color-surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.95rem" }}>
              <thead>
                <tr style={{ background: "var(--color-surface-2)", borderBottom: "2px solid var(--color-border)" }}>
                  <th style={{ padding: "0.75rem 1rem" }}>SKU</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Product</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Department</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>On Hand</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Reserved</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Available</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>WAC Unit Cost</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "var(--color-muted)" }}>
                      {loadingInventory ? "Loading inventory records..." : "No matching inventory records found."}
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map((item) => (
                    <tr key={item.productId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace", fontWeight: 600 }}>{item.productId}</td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div style={{ fontWeight: 600 }}>{item.productName}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>{item.brand}</div>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textTransform: "capitalize" }}>{item.department}</td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontWeight: 600 }}>{item.stock}</td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right", color: "var(--color-muted)" }}>{item.reserved}</td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right", fontWeight: 700, color: item.isLowStock ? "var(--color-danger, #d9534f)" : "inherit" }}>
                        {item.available}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                        ${(item.unitCostMinor / 100).toFixed(2)}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                        {item.isLowStock ? (
                          <span style={{ background: "rgba(220, 53, 69, 0.15)", color: "#dc3545", padding: "0.2rem 0.6rem", borderRadius: "12px", fontSize: "0.8rem", fontWeight: 700 }}>
                            ⚠️ Low Stock (&le;{item.lowStockThreshold})
                          </span>
                        ) : (
                          <span style={{ background: "rgba(40, 167, 69, 0.15)", color: "#28a745", padding: "0.2rem 0.6rem", borderRadius: "12px", fontSize: "0.8rem", fontWeight: 600 }}>
                            ✅ In Stock
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: MANUAL GRN ENTRY */}
      {activeTab === "grn" && (
        <form onSubmit={handleCreateGrn} style={{ background: "var(--color-surface)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: "1rem" }}>📦 Create Manual Goods Receipt Note (GRN)</h2>
          <p style={{ color: "var(--color-muted)", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
            Receive physical vendor deliveries. Entering receipt lines increments live on-hand stock and automatically recalibrates the Weighted Average Cost (WAC).
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            <div className="field">
              <label htmlFor={supplierInputId} className="field__label">Vendor / Supplier Name *</label>
              <input
                id={supplierInputId}
                type="text"
                className="input"
                placeholder="e.g. Fresh Farm Organics"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor={poRefInputId} className="field__label">Purchase Order (PO) Reference *</label>
              <input
                id={poRefInputId}
                type="text"
                className="input"
                value={poReference}
                onChange={(e) => setPoReference(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor={notesInputId} className="field__label">Delivery Notes / Seal #</label>
              <input
                id={notesInputId}
                type="text"
                className="input"
                placeholder="e.g. Truck #402, Temperature OK"
                value={grnNotes}
                onChange={(e) => setGrnNotes(e.target.value)}
              />
            </div>
          </div>

          <h3 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Shipment Line Items</h3>
          <div style={{ overflowX: "auto", marginBottom: "1rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "700px" }}>
              <thead>
                <tr style={{ background: "var(--color-surface-2)", textAlign: "left", fontSize: "0.85rem" }}>
                  <th style={{ padding: "0.5rem" }}>Product SKU *</th>
                  <th style={{ padding: "0.5rem", width: "110px" }}>Quantity *</th>
                  <th style={{ padding: "0.5rem", width: "130px" }}>Unit Cost ($) *</th>
                  <th style={{ padding: "0.5rem", width: "140px" }}>Batch # *</th>
                  <th style={{ padding: "0.5rem", width: "140px" }}>Expiry Date *</th>
                  <th style={{ padding: "0.5rem", width: "50px" }}></th>
                </tr>
              </thead>
              <tbody>
                {grnItems.map((item, index) => (
                  <tr key={index} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.5rem" }}>
                      <select
                        aria-label={`Product SKU for item ${index + 1}`}
                        value={item.productId}
                        onChange={(e) => updateGrnItem(index, { productId: e.target.value })}
                        style={{ width: "100%", padding: "0.4rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "inherit" }}
                        required
                      >
                        <option value="">-- Select Product --</option>
                        {inventory.map((p) => (
                          <option key={p.productId} value={p.productId}>
                            {p.productId} - {p.productName} ({p.brand})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <input
                        aria-label={`Quantity for item ${index + 1}`}
                        type="number"
                        min="1"
                        step="1"
                        className="input"
                        value={item.quantity}
                        onChange={(e) => updateGrnItem(index, { quantity: parseInt(e.target.value, 10) || 0 })}
                        required
                      />
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <input
                        aria-label={`Unit cost for item ${index + 1}`}
                        type="number"
                        min="0.01"
                        step="0.01"
                        className="input"
                        value={(item.unitCostMinor / 100).toFixed(2)}
                        onChange={(e) =>
                          updateGrnItem(index, { unitCostMinor: Math.round(parseFloat(e.target.value || "0") * 100) })
                        }
                        required
                      />
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <input
                        aria-label={`Batch number for item ${index + 1}`}
                        type="text"
                        className="input"
                        value={item.batchNumber}
                        onChange={(e) => updateGrnItem(index, { batchNumber: e.target.value })}
                        required
                      />
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <input
                        aria-label={`Expiry date for item ${index + 1}`}
                        type="date"
                        className="input"
                        value={item.expiryDate}
                        onChange={(e) => updateGrnItem(index, { expiryDate: e.target.value })}
                        required
                      />
                    </td>
                    <td style={{ padding: "0.5rem", textAlign: "center" }}>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ color: "var(--color-danger, #d9534f)", padding: "0.3rem" }}
                        onClick={() => removeGrnItem(index)}
                        disabled={grnItems.length <= 1}
                        title="Remove Line"
                      >
                        ✖
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
            <button type="button" className="btn btn--secondary" onClick={addGrnItem}>
              ➕ Add Receipt Line
            </button>
            <button type="submit" className="btn btn--primary btn--lg" disabled={submittingGrn}>
              {submittingGrn ? "Generating GRN..." : "💾 Receive Goods & Update Inventory"}
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: CSV BULK SHIPMENT UPLOAD */}
      {activeTab === "csv" && (
        <form onSubmit={handleCsvUpload} style={{ background: "var(--color-surface)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: "0.5rem" }}>📄 Bulk CSV Goods Receipt Ingestion</h2>
          <p style={{ color: "var(--color-muted)", marginBottom: "1rem", fontSize: "0.95rem" }}>
            Paste or upload vendor dispatch manifests. Expected columns: <code>sku,supplier,po_reference,quantity,unit_cost,batch,expiry</code>.
          </p>

          <div style={{ marginBottom: "1rem" }}>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setCsvText(sampleCsvExample)}
              style={{ marginBottom: "0.5rem" }}
            >
              📋 Load Sample Manifest CSV
            </button>
            <textarea
              id={csvAreaId}
              aria-label="CSV Manifest Content"
              className="input"
              rows={8}
              placeholder={`sku,supplier,po_reference,quantity,unit_cost,batch,expiry\np-00001,Organic Valley,PO-991,50,2.50,B-01,2026-12-31`}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              style={{ width: "100%", fontFamily: "monospace", fontSize: "0.9rem" }}
              required
            />
          </div>

          <button type="submit" className="btn btn--primary btn--lg" disabled={csvUploading}>
            {csvUploading ? "Ingesting CSV..." : "🚀 Ingest CSV & Issue Sequential GRN"}
          </button>
        </form>
      )}

      {/* TAB 4: INTER-STORE TRANSFERS */}
      {activeTab === "transfers" && (
        <form onSubmit={handleStockTransfer} style={{ background: "var(--color-surface)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", maxWidth: "600px" }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: "0.5rem" }}>🔄 Inter-Store Stock Transfer</h2>
          <p style={{ color: "var(--color-muted)", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
            Transfer inventory safely between retail locations. Automatically validates available on-hand balance at the source store.
          </p>

          <div className="form">
            <div className="field">
              <label htmlFor={destStoreSelectId} className="field__label">Destination Store *</label>
              <select
                id={destStoreSelectId}
                value={transferDestStore}
                onChange={(e) => setTransferDestStore(e.target.value)}
                style={{ padding: "0.6rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "inherit" }}
                required
              >
                <option value="">-- Select Destination Store --</option>
                {stores
                  ?.filter((s) => s.id !== selectedStoreId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id})
                    </option>
                  )) ?? (
                  <>
                    {selectedStoreId !== "IL-01" && <option value="IL-01">Lincoln Park Superstore (IL-01)</option>}
                    {selectedStoreId !== "OH-01" && <option value="OH-01">Short North Express (OH-01)</option>}
                    {selectedStoreId !== "PA-01" && <option value="PA-01">Center City Market (PA-01)</option>}
                  </>
                )}
              </select>
            </div>

            <div className="field">
              <label htmlFor={transferProductSelectId} className="field__label">Product / SKU to Transfer *</label>
              <select
                id={transferProductSelectId}
                value={transferProductId}
                onChange={(e) => setTransferProductId(e.target.value)}
                style={{ padding: "0.6rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "inherit" }}
                required
              >
                <option value="">-- Select Product --</option>
                {inventory.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.productId} - {p.productName} (Avail: {p.available})
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor={transferQtyInputId} className="field__label">Quantity to Transfer *</label>
              <input
                id={transferQtyInputId}
                type="number"
                min="1"
                step="1"
                className="input"
                value={transferQty}
                onChange={(e) => setTransferQty(parseInt(e.target.value, 10) || 1)}
                required
              />
            </div>

            <button type="submit" className="btn btn--primary btn--lg" disabled={submittingTransfer} style={{ marginTop: "0.5rem" }}>
              {submittingTransfer ? "Processing Transfer..." : "✈️ Execute Stock Transfer"}
            </button>
          </div>
        </form>
      )}

      {/* TAB 5: WASTAGE & SHRINKAGE ADJUSTMENTS */}
      {activeTab === "adjustments" && (
        <form onSubmit={handleStockAdjustment} style={{ background: "var(--color-surface)", padding: "1.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", maxWidth: "600px" }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: "0.5rem" }}>📉 Stock Adjustments & Shrinkage</h2>
          <p style={{ color: "var(--color-muted)", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
            Log damaged, expired, or shrink items with legal audit logging.
          </p>

          <div className="form">
            <div className="field">
              <label htmlFor={adjustProductSelectId} className="field__label">Product / SKU *</label>
              <select
                id={adjustProductSelectId}
                value={adjustProductId}
                onChange={(e) => setAdjustProductId(e.target.value)}
                style={{ padding: "0.6rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "inherit" }}
                required
              >
                <option value="">-- Select Product --</option>
                {inventory.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.productId} - {p.productName} (Stock: {p.stock})
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor={adjustDeltaInputId} className="field__label">Quantity Delta (Negative for Deductions) *</label>
              <input
                id={adjustDeltaInputId}
                type="number"
                step="1"
                className="input"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(parseInt(e.target.value, 10) || 0)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor={adjustReasonSelectId} className="field__label">Adjustment Reason *</label>
              <select
                id={adjustReasonSelectId}
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value as AdjustmentReason)}
                style={{ padding: "0.6rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "inherit" }}
                required
              >
                <option value="damage">Damage (Damaged in Transit / Shelf)</option>
                <option value="shrinkage">Shrinkage (Theft / Missing)</option>
                <option value="expired">Expired (Past Sell-By Date)</option>
                <option value="audit">Audit (Physical Stocktake Discrepancy)</option>
              </select>
            </div>

            <button type="submit" className="btn btn--primary btn--lg" disabled={submittingAdjust} style={{ marginTop: "0.5rem" }}>
              {submittingAdjust ? "Applying Adjustment..." : "📝 Post Adjustment"}
            </button>
          </div>
        </form>
      )}

      {/* TAB 6: AUDIT HISTORY */}
      {activeTab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          <div>
            <h3 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>📦 Recent Goods Receipts (GRN)</h3>
            <div style={{ overflowX: "auto", background: "var(--color-surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ padding: "0.6rem 1rem" }}>GRN #</th>
                    <th style={{ padding: "0.6rem 1rem" }}>Supplier</th>
                    <th style={{ padding: "0.6rem 1rem" }}>PO Ref</th>
                    <th style={{ padding: "0.6rem 1rem", textAlign: "right" }}>Total Cost</th>
                    <th style={{ padding: "0.6rem 1rem" }}>Received By</th>
                    <th style={{ padding: "0.6rem 1rem" }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {historyReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-muted)" }}>
                        {loadingHistory ? "Loading receipts..." : "No goods receipts found for this store."}
                      </td>
                    </tr>
                  ) : (
                    historyReceipts.map((r) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "0.6rem 1rem", fontFamily: "monospace", fontWeight: 700 }}>{r.grnNumber}</td>
                        <td style={{ padding: "0.6rem 1rem" }}>{r.supplier}</td>
                        <td style={{ padding: "0.6rem 1rem" }}>{r.poReference}</td>
                        <td style={{ padding: "0.6rem 1rem", textAlign: "right", fontWeight: 600 }}>
                          ${(r.totalCostMinor / 100).toFixed(2)}
                        </td>
                        <td style={{ padding: "0.6rem 1rem" }}>{r.receivedBy}</td>
                        <td style={{ padding: "0.6rem 1rem" }}>{new Date(r.receivedAt).toLocaleDateString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>🔄 Recent Transfers</h3>
            <div style={{ overflowX: "auto", background: "var(--color-surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ padding: "0.6rem 1rem" }}>Transfer #</th>
                    <th style={{ padding: "0.6rem 1rem" }}>From</th>
                    <th style={{ padding: "0.6rem 1rem" }}>To</th>
                    <th style={{ padding: "0.6rem 1rem" }}>Product</th>
                    <th style={{ padding: "0.6rem 1rem", textAlign: "right" }}>Qty</th>
                    <th style={{ padding: "0.6rem 1rem" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {historyTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-muted)" }}>
                        {loadingHistory ? "Loading transfers..." : "No transfers found for this store."}
                      </td>
                    </tr>
                  ) : (
                    historyTransfers.map((t) => (
                      <tr key={t.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "0.6rem 1rem", fontFamily: "monospace" }}>{t.transferNumber}</td>
                        <td style={{ padding: "0.6rem 1rem" }}>{t.fromStoreId}</td>
                        <td style={{ padding: "0.6rem 1rem" }}>{t.toStoreId}</td>
                        <td style={{ padding: "0.6rem 1rem" }}>{t.productName || t.productId}</td>
                        <td style={{ padding: "0.6rem 1rem", textAlign: "right", fontWeight: 600 }}>{t.quantity}</td>
                        <td style={{ padding: "0.6rem 1rem" }}>
                          <span style={{ color: "#28a745", fontWeight: 600 }}>{t.status}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>📉 Recent Adjustments</h3>
            <div style={{ overflowX: "auto", background: "var(--color-surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ padding: "0.6rem 1rem" }}>Product</th>
                    <th style={{ padding: "0.6rem 1rem", textAlign: "right" }}>Delta</th>
                    <th style={{ padding: "0.6rem 1rem" }}>Reason</th>
                    <th style={{ padding: "0.6rem 1rem" }}>Adjusted By</th>
                    <th style={{ padding: "0.6rem 1rem" }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {historyAdjustments.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-muted)" }}>
                        {loadingHistory ? "Loading adjustments..." : "No stock adjustments recorded for this store."}
                      </td>
                    </tr>
                  ) : (
                    historyAdjustments.map((a) => (
                      <tr key={a.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "0.6rem 1rem" }}>{a.productName || a.productId}</td>
                        <td style={{ padding: "0.6rem 1rem", textAlign: "right", fontWeight: 700, color: a.quantityDelta < 0 ? "var(--color-danger, #d9534f)" : "#28a745" }}>
                          {a.quantityDelta > 0 ? `+${a.quantityDelta}` : a.quantityDelta}
                        </td>
                        <td style={{ padding: "0.6rem 1rem", textTransform: "capitalize" }}>{a.reason}</td>
                        <td style={{ padding: "0.6rem 1rem" }}>{a.adjustedBy}</td>
                        <td style={{ padding: "0.6rem 1rem" }}>{new Date(a.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {activeTab === "copilot" && (
        <CopilotTab token={token} storeId={selectedStoreId} userRole={customer.role} />
      )}
    </div>
  );
}
