import { useCallback, useEffect, useState } from "react";
import {
  getDbHealth,
  getRecentEvents,
  getRecentLogs,
  getTelemetryStats,
  subscribeToEventStream,
  updateChaosSettings,
} from "../api/observability";
import type {
  ChaosSettings,
  DomainEvent,
  HealthProbeStatus,
  LogEntry,
  LogLevel,
  TelemetryStatsResponse,
} from "../types/observability";
import { AiMetricsView } from "./AiMetricsView";

type TabKey = "metrics" | "events" | "logs" | "probes" | "chaos" | "ai_rag";

interface TelemetryDashboardProps {
  token?: string | null;
}

export function TelemetryDashboard(props: TelemetryDashboardProps = {}) {
  const token = props.token;
  const [activeTab, setActiveTab] = useState<TabKey>("metrics");
  const [stats, setStats] = useState<TelemetryStatsResponse | null>(null);
  const [dbHealth, setDbHealth] = useState<HealthProbeStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Events Stream state
  const [events, setEvents] = useState<DomainEvent[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState<boolean>(false);

  // Logs state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logLevelFilter, setLogLevelFilter] = useState<string>("");
  const [logSearch, setLogSearch] = useState<string>("");
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  // Chaos state
  const [chaosForm, setChaosForm] = useState<ChaosSettings>({
    simulatedLatencyMs: 0,
    failureRatePercent: 0,
    forceCircuitTrip: false,
  });
  const [savingChaos, setSavingChaos] = useState<boolean>(false);
  const [chaosFeedback, setChaosFeedback] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const [resStats, resDb] = await Promise.all([getTelemetryStats(token), getDbHealth()]);
      if (resStats.ok) {
        setStats(resStats.data);
        setChaosForm(resStats.data.chaos);
      }
      if (resDb.ok) {
        setDbHealth(resDb.data);
      }
    } catch {
      // ignore network errors on polling
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await getRecentLogs(token, 100, (logLevelFilter || undefined) as LogLevel, logSearch || undefined);
      if (res.ok) {
        setLogs(res.data.logs);
      }
    } finally {
      setLoadingLogs(false);
    }
  }, [token, logLevelFilter, logSearch]);

  // Initial load and polling
  useEffect(() => {
    fetchStats();
    getRecentEvents(token, 30).then((res) => {
      if (res.ok) setEvents(res.data.events);
    });
  }, [token, fetchStats]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStats]);

  // SSE Domain Events Connection
  useEffect(() => {
    const cleanup = subscribeToEventStream(
      token,
      (newEvent) => {
        setSseConnected(true);
        setEvents((prev) => {
          if (prev.some((e) => e.id === newEvent.id)) return prev;
          return [newEvent, ...prev.slice(0, 150)];
        });
      },
      () => {
        setSseConnected(false);
      }
    );
    return cleanup;
  }, [token]);

  useEffect(() => {
    if (activeTab === "logs") {
      fetchLogs();
    }
  }, [activeTab, fetchLogs]);

  const handleApplyChaos = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingChaos(true);
    setChaosFeedback(null);
    try {
      const res = await updateChaosSettings(token, chaosForm);
      if (res.ok) {
        setChaosFeedback("✅ Chaos parameters successfully updated and active.");
        void fetchStats();
      } else {
        setChaosFeedback(`❌ Failed to update chaos settings: ${res.message}`);
      }
    } finally {
      setSavingChaos(false);
    }
  };

  const handleResetChaos = async () => {
    setSavingChaos(true);
    try {
      const reset = { simulatedLatencyMs: 0, failureRatePercent: 0, forceCircuitTrip: false };
      setChaosForm(reset);
      const res = await updateChaosSettings(token, reset);
      if (res.ok) {
        setChaosFeedback("✅ Chaos reset. System returned to baseline normal operations.");
      } else {
        setChaosFeedback(`❌ Failed to reset chaos: ${res.message}`);
      }
      void fetchStats();
    } finally {
      setSavingChaos(false);
    }
  };

  const filteredEvents = events.filter((e) => !eventTypeFilter || e.type === eventTypeFilter);

  return (
    <div className="page page--wide" style={{ maxWidth: "1280px", margin: "0 auto", padding: "1.5rem" }}>
      {/* Top Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
          color: "#f8fafc",
          padding: "1.25rem 1.75rem",
          borderRadius: "14px",
          marginBottom: "1.5rem",
          boxShadow: "0 4px 20px -2px rgba(15, 23, 42, 0.4)",
          border: "1px solid #334155",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "rgba(99, 102, 241, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.6rem",
              border: "1px solid rgba(129, 140, 248, 0.3)",
            }}
          >
            📡
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "#ffffff", letterSpacing: "-0.01em" }}>
                Full-Stack Telemetry &amp; MELT Observability
              </h1>
              <span
                style={{
                  fontSize: "0.75rem",
                  background: sseConnected ? "#059669" : "#d97706",
                  color: "#ffffff",
                  fontWeight: 700,
                  padding: "0.15rem 0.6rem",
                  borderRadius: "9999px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span style={{ fontSize: "0.5rem" }}>●</span> {sseConnected ? "Live SSE Stream Active" : "Polling"}
              </span>
            </div>
            <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: "0.85rem" }}>
              Metrics, Events, Structured Logs &amp; Distributed Traces (OBS-01..06 / WS S)
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <a
            href="http://localhost:5001/metrics"
            target="_blank"
            rel="noreferrer"
            className="btn btn--sm"
            style={{
              background: "rgba(255,255,255,0.1)",
              color: "#e2e8f0",
              border: "1px solid rgba(255,255,255,0.2)",
              fontWeight: 600,
              textDecoration: "none",
              padding: "0.45rem 0.85rem",
              borderRadius: "8px",
            }}
          >
            📊 Prometheus /metrics ↗
          </a>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="btn btn--sm"
            style={{
              background: autoRefresh ? "rgba(16, 185, 129, 0.2)" : "rgba(255,255,255,0.1)",
              color: autoRefresh ? "#34d399" : "#94a3b8",
              border: "1px solid rgba(255,255,255,0.2)",
              fontWeight: 600,
              padding: "0.45rem 0.85rem",
              borderRadius: "8px",
            }}
          >
            {autoRefresh ? "🟢 Live Polling (3s)" : "⏸ Paused"}
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      {loading && !stats && (
        <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
          Connecting to OpenTelemetry &amp; MELT engine...
        </div>
      )}
      {stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ background: "#ffffff", padding: "1.25rem", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Throughput (RPS)</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#2563eb", marginTop: "4px" }}>
              {stats.metrics.requestsPerSecond} req/s
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>Total processed: {stats.metrics.totalRequests}</div>
          </div>

          <div style={{ background: "#ffffff", padding: "1.25rem", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>HTTP Latency (p50 / p95)</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
              {stats.metrics.httpLatency.p50Ms} ms <span style={{ fontSize: "0.95rem", color: "#64748b", fontWeight: 500 }}>/ {stats.metrics.httpLatency.p95Ms} ms</span>
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>Worst-case p99: {stats.metrics.httpLatency.p99Ms} ms</div>
          </div>

          <div style={{ background: "#ffffff", padding: "1.25rem", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>System Error Rate</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: stats.metrics.errorRatePercent > 0 ? "#dc2626" : "#16a34a", marginTop: "4px" }}>
              {stats.metrics.errorRatePercent}%
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>Errors: {stats.metrics.totalErrors} requests</div>
          </div>

          <div style={{ background: "#ffffff", padding: "1.25rem", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>SQLite Query Speed</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#059669", marginTop: "4px" }}>
              {stats.metrics.dbLatency.p50Ms} ms
            </div>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>Tables: {dbHealth?.tableCount ?? 12} • WAL Mode</div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "2px solid #e2e8f0",
          gap: "8px",
          marginBottom: "1.5rem",
          overflowX: "auto",
        }}
      >
        {[
          { key: "metrics", label: "📊 M: Prometheus Metrics" },
          { key: "events", label: "📡 E: Domain Events Stream (SSE)" },
          { key: "logs", label: "📜 L: Structured JSON Logs" },
          { key: "probes", label: "⚡ T: Distributed Tracing & Probes" },
          { key: "chaos", label: "🧪 Chaos Engineering & Faults" },
          { key: "ai_rag", label: "🤖 AI & RAG Observability" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as TabKey)}
            style={{
              padding: "10px 18px",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab.key ? "3px solid #6366f1" : "3px solid transparent",
              color: activeTab === tab.key ? "#4f46e5" : "#64748b",
              fontWeight: activeTab === tab.key ? 700 : 500,
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

      {/* TAB 1: METRICS */}
      {activeTab === "metrics" && stats && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ background: "#ffffff", padding: "1.5rem", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
              ⚡ Latency Histograms &amp; Percentiles (OBS-01)
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
              <div style={{ padding: "1rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: 700, color: "#334155", marginBottom: "0.5rem" }}>HTTP Response Latency</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "4px 0", borderBottom: "1px solid #e2e8f0" }}>
                  <span>p50 (Median):</span> <strong>{stats.metrics.httpLatency.p50Ms} ms</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "4px 0", borderBottom: "1px solid #e2e8f0" }}>
                  <span>p95 (95th percentile):</span> <strong>{stats.metrics.httpLatency.p95Ms} ms</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "4px 0" }}>
                  <span>p99 (Tail Latency):</span> <strong>{stats.metrics.httpLatency.p99Ms} ms</strong>
                </div>
              </div>

              <div style={{ padding: "1rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: 700, color: "#334155", marginBottom: "0.5rem" }}>SQLite Query Execution</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "4px 0", borderBottom: "1px solid #e2e8f0" }}>
                  <span>p50 Query Duration:</span> <strong>{stats.metrics.dbLatency.p50Ms} ms</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "4px 0", borderBottom: "1px solid #e2e8f0" }}>
                  <span>p95 Query Duration:</span> <strong>{stats.metrics.dbLatency.p95Ms} ms</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "4px 0" }}>
                  <span>Samples Profiled:</span> <strong>{stats.metrics.dbLatency.sampleCount} queries</strong>
                </div>
              </div>
            </div>
          </div>

          <div style={{ background: "#ffffff", padding: "1.5rem", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
              🛡️ Circuit Breakers Health (Opossum Pattern)
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
              {stats.metrics.circuitBreakers.map((cb) => (
                <div
                  key={cb.name}
                  style={{
                    padding: "1rem",
                    borderRadius: "8px",
                    border: `1px solid ${cb.state === "CLOSED" ? "#bbf7d0" : cb.state === "HALF_OPEN" ? "#fde68a" : "#fecaca"}`,
                    background: cb.state === "CLOSED" ? "#f0fdf4" : cb.state === "HALF_OPEN" ? "#fffbeb" : "#fef2f2",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <span style={{ fontWeight: 700, color: "#0f172a", fontFamily: "monospace" }}>{cb.name}</span>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "9999px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        background: cb.state === "CLOSED" ? "#16a34a" : cb.state === "HALF_OPEN" ? "#d97706" : "#dc2626",
                        color: "#ffffff",
                      }}
                    >
                      {cb.state}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "#475569" }}>
                    Trips / Failures: <strong>{cb.trips}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DOMAIN EVENTS STREAM */}
      {activeTab === "events" && (
        <div style={{ background: "#ffffff", padding: "1.5rem", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
                📡 Live Domain Events Feed (OBS-02)
              </h3>
              <p style={{ margin: "2px 0 0 0", color: "#64748b", fontSize: "0.85rem" }}>
                Real-time Server-Sent Events (SSE) stream for purchase, payment, receiving, and shrinkage lifecycles
              </p>
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <select
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value)}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
              >
                <option value="">All Event Types ({events.length})</option>
                <option value="ORDER_PLACED">ORDER_PLACED</option>
                <option value="PAYMENT_CAPTURED">PAYMENT_CAPTURED</option>
                <option value="GRN_RECORDED">GRN_RECORDED</option>
                <option value="STOCK_TRANSFERRED">STOCK_TRANSFERRED</option>
                <option value="STOCK_ADJUSTED">STOCK_ADJUSTED</option>
                <option value="CHAOS_INJECTED">CHAOS_INJECTED</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {filteredEvents.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
                No events recorded yet. Perform an order checkout or goods receipt to see events stream in real time.
              </div>
            ) : (
              filteredEvents.map((evt) => {
                const isExpanded = expandedEventId === evt.id;
                const isOrder = evt.type === "ORDER_PLACED";
                const isGrn = evt.type === "GRN_RECORDED";
                const isChaos = evt.type === "CHAOS_INJECTED";

                const badgeBg = isOrder ? "#e0e7ff" : isGrn ? "#d1fae5" : isChaos ? "#fee2e2" : "#f1f5f9";
                const badgeColor = isOrder ? "#3730a3" : isGrn ? "#065f46" : isChaos ? "#991b1b" : "#334155";

                return (
                  <div
                    key={evt.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: "12px 16px",
                      background: isExpanded ? "#f8fafc" : "#ffffff",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "0.75rem", padding: "2px 8px", borderRadius: "4px", fontWeight: 700, background: badgeBg, color: badgeColor }}>
                          {evt.type}
                        </span>
                        <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "0.9rem" }}>{evt.summary}</span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          {new Date(evt.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                        <button
                          onClick={() => setExpandedEventId(isExpanded ? null : evt.id)}
                          style={{ background: "none", border: "none", color: "#6366f1", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" }}
                        >
                          {isExpanded ? "Hide Details ▲" : "View Payload ▼"}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ marginTop: "10px", padding: "10px", background: "#0f172a", color: "#38bdf8", borderRadius: "6px", fontFamily: "monospace", fontSize: "0.75rem", overflowX: "auto" }}>
                        <pre style={{ margin: 0 }}>{JSON.stringify(evt, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: STRUCTURED LOGS */}
      {activeTab === "logs" && (
        <div style={{ background: "#ffffff", padding: "1.5rem", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
                📜 Structured JSON Logs &amp; Trace Search (OBS-03)
              </h3>
              <p style={{ margin: "2px 0 0 0", color: "#64748b", fontSize: "0.85rem" }}>
                Live buffer with W3C traceId correlation and scope tagging
              </p>
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                placeholder="Search logs, scope, traceId..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem", width: "240px" }}
              />

              <select
                value={logLevelFilter}
                onChange={(e) => setLogLevelFilter(e.target.value)}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem" }}
              >
                <option value="">All Levels</option>
                <option value="INFO">INFO</option>
                <option value="WARN">WARN</option>
                <option value="ERROR">ERROR</option>
                <option value="CIRCUIT">CIRCUIT</option>
              </select>

              <button
                onClick={fetchLogs}
                style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "6px", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "600px", overflowY: "auto" }}>
            {loadingLogs ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Loading logs...</div>
            ) : logs.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>No log entries match your filter.</div>
            ) : (
              logs.map((log) => {
                const color = log.level === "ERROR" ? "#dc2626" : log.level === "WARN" ? "#d97706" : log.level === "CIRCUIT" ? "#7c3aed" : "#0284c7";
                const bg = log.level === "ERROR" ? "#fef2f2" : log.level === "WARN" ? "#fffbeb" : log.level === "CIRCUIT" ? "#f5f3ff" : "#f8fafc";

                return (
                  <div
                    key={log.id}
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      background: bg,
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "8px",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                      <span style={{ color: "#94a3b8", whiteSpace: "nowrap" }}>
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <span style={{ fontWeight: 700, color, width: "65px" }}>[{log.level}]</span>
                      <span style={{ color: "#475569", fontWeight: 600 }}>({log.scope})</span>
                      <span style={{ color: "#0f172a" }}>{log.message}</span>
                    </div>

                    {log.traceId && (
                      <span style={{ color: "#6366f1", fontSize: "0.75rem", background: "rgba(99, 102, 241, 0.1)", padding: "1px 6px", borderRadius: "4px", whiteSpace: "nowrap" }}>
                        trace:{log.traceId.slice(0, 8)}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 4: DISTRIBUTED TRACING & HEALTH PROBES */}
      {activeTab === "probes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ background: "#ffffff", padding: "1.5rem", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
              🌐 Distributed Tracing &amp; W3C TraceContext (OBS-04)
            </h3>
            <p style={{ color: "#475569", fontSize: "0.9rem", lineHeight: 1.6, margin: "0 0 1rem 0" }}>
              The system propagates standard W3C <code>traceparent</code> headers across the entire request topology:
              <strong> Storefront Client $\rightarrow$ API Gateway Express $\rightarrow$ SQLite Query Spans $\rightarrow$ Payment Simulator</strong>.
            </p>
            <div style={{ padding: "1rem", background: "#0f172a", color: "#38bdf8", borderRadius: "8px", fontFamily: "monospace", fontSize: "0.85rem" }}>
              <div>Header: traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01</div>
              <div style={{ color: "#94a3b8", marginTop: "4px" }}>
                [Version: 00] [Trace ID: 128-bit hex] [Parent Span ID: 64-bit hex] [Sampled: 01]
              </div>
            </div>
          </div>

          <div style={{ background: "#ffffff", padding: "1.5rem", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
              🩺 Orchestrator Health Probes (OBS-05)
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
              <div style={{ padding: "1rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: 700, color: "#16a34a", marginBottom: "4px" }}>GET /health/live</div>
                <div style={{ fontSize: "0.85rem", color: "#475569" }}>Kubernetes Liveness Probe (Process heartbeat)</div>
                <div style={{ marginTop: "8px", fontSize: "0.75rem", color: "#64748b" }}>Status: <strong>200 OK</strong></div>
              </div>

              <div style={{ padding: "1rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: 700, color: "#16a34a", marginBottom: "4px" }}>GET /health/ready</div>
                <div style={{ fontSize: "0.85rem", color: "#475569" }}>Readiness Probe (DB + Platform setup check)</div>
                <div style={{ marginTop: "8px", fontSize: "0.75rem", color: "#64748b" }}>Status: <strong>200 OK</strong></div>
              </div>

              <div style={{ padding: "1rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: 700, color: "#16a34a", marginBottom: "4px" }}>GET /health/db</div>
                <div style={{ fontSize: "0.85rem", color: "#475569" }}>Database Health Probe ({dbHealth?.tableCount ?? 12} tables in SQLite)</div>
                <div style={{ marginTop: "8px", fontSize: "0.75rem", color: "#64748b" }}>Status: <strong>200 OK</strong></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: CHAOS & FAULT INJECTION */}
      {activeTab === "chaos" && (
        <div style={{ background: "#ffffff", padding: "1.5rem", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <div style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
              🧪 Chaos Engineering &amp; Resilience Controller (OBS-06)
            </h3>
            <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "0.85rem" }}>
              Inject artificial latency, simulated random failures, or trip circuit breakers in real time to test self-healing resilience
            </p>
          </div>

          {chaosFeedback && (
            <div style={{ padding: "12px 16px", borderRadius: "8px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", marginBottom: "1.5rem", fontWeight: 600, fontSize: "0.9rem" }}>
              {chaosFeedback}
            </div>
          )}

          <form onSubmit={handleApplyChaos} style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "600px" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <label style={{ fontWeight: 700, fontSize: "0.9rem", color: "#334155" }}>
                  Simulated Latency: <span style={{ color: "#6366f1" }}>{chaosForm.simulatedLatencyMs} ms</span>
                </label>
                <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>(0 to 2000 ms)</span>
              </div>
              <input
                type="range"
                min="0"
                max="2000"
                step="50"
                value={chaosForm.simulatedLatencyMs}
                onChange={(e) => setChaosForm({ ...chaosForm, simulatedLatencyMs: parseInt(e.target.value, 10) })}
                style={{ width: "100%", accentColor: "#6366f1" }}
              />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <label style={{ fontWeight: 700, fontSize: "0.9rem", color: "#334155" }}>
                  Artificial Error Rate: <span style={{ color: "#dc2626" }}>{chaosForm.failureRatePercent}%</span>
                </label>
                <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>(0% to 100%)</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={chaosForm.failureRatePercent}
                onChange={(e) => setChaosForm({ ...chaosForm, failureRatePercent: parseInt(e.target.value, 10) })}
                style={{ width: "100%", accentColor: "#dc2626" }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <input
                type="checkbox"
                id="forceTripCheck"
                checked={chaosForm.forceCircuitTrip}
                onChange={(e) => setChaosForm({ ...chaosForm, forceCircuitTrip: e.target.checked })}
                style={{ width: "18px", height: "18px", accentColor: "#dc2626", cursor: "pointer" }}
              />
              <label htmlFor="forceTripCheck" style={{ fontWeight: 600, fontSize: "0.9rem", color: "#334155", cursor: "pointer" }}>
                Force-Trip Database Circuit Breaker (Switch to OPEN state)
              </label>
            </div>

            <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem" }}>
              <button
                type="submit"
                disabled={savingChaos}
                className="btn btn--primary"
                style={{ background: "#6366f1", borderColor: "#6366f1", padding: "0.6rem 1.5rem" }}
              >
                {savingChaos ? "Applying..." : "Apply Chaos Parameters"}
              </button>
              <button
                type="button"
                onClick={handleResetChaos}
                disabled={savingChaos}
                className="btn btn--secondary"
                style={{ padding: "0.6rem 1.5rem" }}
              >
                Reset to Baseline (0ms / 0% errors)
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 6: AI & RAG OBSERVABILITY */}
      {activeTab === "ai_rag" && (
        <AiMetricsView />
      )}
    </div>
  );
}
