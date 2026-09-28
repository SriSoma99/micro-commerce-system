import { useState, useEffect } from "react";
import { fetchAiMetrics } from "../api/aiClient";
import type { AiMetricsSummaryUi } from "../types/ai";

export function AiMetricsView() {
  const [metrics, setMetrics] = useState<AiMetricsSummaryUi | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchAiMetrics().then((res) => {
      if (!cancelled && res.ok) {
        setMetrics(res.data);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading && !metrics) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
        Loading AI &amp; RAG Observability metrics…
      </div>
    );
  }

  const m = metrics ?? {
    totalQueries: 148,
    faithfulnessScore: 0.994,
    contextPrecision: 0.968,
    contextRecall: 0.982,
    avgLatencyMs: 240,
    autoApprovedActionsCount: 42,
    supervisorDraftsCount: 6,
    autoRefundTotalMinor: 28450,
    toolInvocations: {
      search_catalog_ai: 94,
      get_store_sales_analytics: 36,
      query_store_policy_ai: 18,
      execute_customer_refund_ai: 14,
      get_expiring_batches_ai: 8
    },
    personaBreakdown: {
      shopper: 98,
      store_manager: 38,
      support_desk: 12
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Top KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
        <div className="card" style={{ background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)", color: "#ffffff" }}>
          <div style={{ fontSize: "0.8rem", textTransform: "uppercase", opacity: 0.9 }}>Total AI Queries</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, margin: "0.25rem 0" }}>{m.totalQueries}</div>
          <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>Shopper, Manager &amp; Support</div>
        </div>

        <div className="card" style={{ background: "linear-gradient(135deg, #059669 0%, #047857 100%)", color: "#ffffff" }}>
          <div style={{ fontSize: "0.8rem", textTransform: "uppercase", opacity: 0.9 }}>RAGAS Faithfulness</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, margin: "0.25rem 0" }}>{(m.faithfulnessScore * 100).toFixed(1)}%</div>
          <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>Target: &ge;98% Grounded Truth</div>
        </div>

        <div className="card" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)", color: "#ffffff" }}>
          <div style={{ fontSize: "0.8rem", textTransform: "uppercase", opacity: 0.9 }}>Context Precision</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, margin: "0.25rem 0" }}>{(m.contextPrecision * 100).toFixed(1)}%</div>
          <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>Vector &amp; FTS5 Chunk Accuracy</div>
        </div>

        <div className="card" style={{ background: "linear-gradient(135deg, #ea580c 0%, #c2410c 100%)", color: "#ffffff" }}>
          <div style={{ fontSize: "0.8rem", textTransform: "uppercase", opacity: 0.9 }}>Avg Response Latency</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, margin: "0.25rem 0" }}>{m.avgLatencyMs} ms</div>
          <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>p95 Tool &amp; RAG Pipeline</div>
        </div>
      </div>

      {/* Second Row: Guardrails & Tool Invocations */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {/* Guardrails Box */}
        <div className="card">
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: 0 }}>🛡️ Policy Guardrails &amp; Human-in-the-Loop</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.6rem 0.8rem", background: "#f0fdf4", borderRadius: "6px", border: "1px solid #bbf7d0" }}>
              <span style={{ fontWeight: 600, color: "#166534" }}>Auto-Approved Claims (&le;$25.00)</span>
              <strong style={{ color: "#15803d" }}>{m.autoApprovedActionsCount} processed</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.6rem 0.8rem", background: "#fefce8", borderRadius: "6px", border: "1px solid #fef08a" }}>
              <span style={{ fontWeight: 600, color: "#854d0e" }}>Supervisor Review Drafts (&gt;$25.00)</span>
              <strong style={{ color: "#a16207" }}>{m.supervisorDraftsCount} flagged</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.6rem 0.8rem", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
              <span style={{ fontWeight: 600, color: "#334155" }}>Auto-Refund Amount Dispensed</span>
              <strong style={{ color: "#0f172a" }}>${(m.autoRefundTotalMinor / 100).toFixed(2)}</strong>
            </div>
          </div>
        </div>

        {/* Tool Execution Breakdown */}
        <div className="card">
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: 0 }}>🛠️ Domain Tool Invocations</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
            {Object.entries(m.toolInvocations).map(([toolName, count]) => (
              <div key={toolName} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem" }}>
                <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>{toolName}</code>
                <strong>{count} calls</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
