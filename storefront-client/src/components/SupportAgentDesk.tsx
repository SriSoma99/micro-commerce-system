import { useState, useEffect, useCallback } from "react";
import { fetchAiDrafts, approveAiDraft, rejectAiDraft, fetchAiPolicies, sendAiChatMessage } from "../api/aiClient";
import type { AiActionDraftUi, PolicyDocumentUi, AiMessageUi } from "../types/ai";

interface SupportAgentDeskProps {
  token: string;
}

export function SupportAgentDesk({ token }: SupportAgentDeskProps) {
  const [drafts, setDrafts] = useState<AiActionDraftUi[]>([]);
  const [policies, setPolicies] = useState<PolicyDocumentUi[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [activeTab, setActiveTab] = useState<"drafts" | "chat" | "policies">("drafts");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Chat testing state
  const [messages, setMessages] = useState<AiMessageUi[]>([
    {
      role: "assistant",
      content: "👋 Customer Support Agent Desk active. I can automatically evaluate damage claims, apply 48h perishable freshness rules, process instant refunds (≤$25), or route supervisor drafts (>$25)."
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const loadDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    const res = await fetchAiDrafts(token);
    setLoadingDrafts(false);
    if (res.ok) setDrafts(res.data.drafts);
  }, [token]);

  const loadPolicies = useCallback(async () => {
    const res = await fetchAiPolicies();
    if (res.ok) setPolicies(res.data.policies);
  }, []);

  useEffect(() => {
    void loadDrafts();
    void loadPolicies();
  }, [loadDrafts, loadPolicies]);

  async function handleApprove(draftId: string) {
    const res = await approveAiDraft(token, draftId);
    if (res.ok) {
      setActionMessage(`✅ Approved Draft #${draftId} - Refund transaction dispatched.`);
      void loadDrafts();
      setTimeout(() => setActionMessage(null), 4000);
    }
  }

  async function handleReject(draftId: string) {
    const res = await rejectAiDraft(token, draftId);
    if (res.ok) {
      setActionMessage(`❌ Rejected Draft #${draftId}.`);
      void loadDrafts();
      setTimeout(() => setActionMessage(null), 4000);
    }
  }

  async function handleSendTestChat(textToSend?: string) {
    const prompt = (textToSend ?? chatInput).trim();
    if (!prompt || chatLoading) return;

    const userMsg: AiMessageUi = { role: "user", content: prompt };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    const result = await sendAiChatMessage(prompt, {
      persona: "support_desk",
      token
    });

    setChatLoading(false);

    if (result.ok) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.data.response,
          toolCalls: result.data.toolCalls,
          draftCreated: result.data.draftCreated
        }
      ]);
      if (result.data.draftCreated) {
        void loadDrafts();
      }
    }
  }

  const pendingDrafts = drafts.filter((d) => d.status === "pending");

  return (
    <div className="page" style={{ maxWidth: "1200px", margin: "0 auto", padding: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, margin: 0 }}>🛡️ AI Customer Support &amp; Action Desk</h1>
          <p style={{ color: "#64748b", margin: "0.25rem 0 0 0" }}>
            Autonomous dispute resolution, perishable damage evaluation, policy RAG, and supervisor approval queue.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className={`btn btn--sm ${activeTab === "drafts" ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setActiveTab("drafts")}
          >
            📋 Approval Queue ({pendingDrafts.length})
          </button>
          <button
            className={`btn btn--sm ${activeTab === "chat" ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setActiveTab("chat")}
          >
            🤖 CS Action Agent Console
          </button>
          <button
            className={`btn btn--sm ${activeTab === "policies" ? "btn--primary" : "btn--secondary"}`}
            onClick={() => setActiveTab("policies")}
          >
            📜 Policy RAG Knowledge
          </button>
        </div>
      </div>

      {actionMessage && (
        <div style={{ background: "#10b981", color: "#ffffff", padding: "0.75rem 1rem", borderRadius: "8px", marginBottom: "1rem", fontWeight: 600 }}>
          {actionMessage}
        </div>
      )}

      {/* Tab 1: Approval Drafts Queue */}
      {activeTab === "drafts" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>Human-in-the-Loop Action Approval Drafts</h2>
            <button className="btn btn--secondary btn--sm" onClick={() => void loadDrafts()} disabled={loadingDrafts}>
              ↻ Refresh Queue
            </button>
          </div>

          {pendingDrafts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#64748b" }}>
              <span style={{ fontSize: "2.5rem" }}>✓</span>
              <p style={{ marginTop: "0.5rem", fontWeight: 600 }}>No pending supervisor action drafts. All claims are resolved or under $25 limit.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {pendingDrafts.map((draft) => {
                let params: { orderId?: string; amountMinor?: number; reason?: string } = {};
                try {
                  params = JSON.parse(draft.parametersJson) as { orderId?: string; amountMinor?: number; reason?: string };
                } catch {
                  // ignore
                }

                return (
                  <div
                    key={draft.id}
                    style={{
                      border: "1px solid #fde047",
                      background: "#fefce8",
                      borderRadius: "10px",
                      padding: "1rem 1.25rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ background: "#ca8a04", color: "#ffffff", fontSize: "0.75rem", fontWeight: 700, padding: "2px 6px", borderRadius: "4px" }}>
                          HIGH VALUE CLAIM
                        </span>
                        <strong style={{ fontSize: "1rem", color: "#854d0e" }}>Draft #{draft.id}</strong>
                        <span style={{ fontSize: "0.8rem", color: "#a16207" }}>· Order #{params.orderId ?? "N/A"}</span>
                      </div>
                      <p style={{ margin: "0.4rem 0", fontSize: "0.9rem", color: "#713f12" }}>
                        <strong>Reason:</strong> {draft.reason}
                      </p>
                      <div style={{ fontSize: "0.85rem", color: "#854d0e" }}>
                        Amount: <strong>${((params.amountMinor ?? 0) / 100).toFixed(2)}</strong> · Risk Score: <strong>{(draft.riskScore * 100).toFixed(0)}%</strong> · Created: {new Date(draft.createdAt).toLocaleTimeString()}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        className="btn btn--primary btn--sm"
                        style={{ background: "#16a34a", borderColor: "#16a34a" }}
                        onClick={() => void handleApprove(draft.id)}
                      >
                        ✓ Approve &amp; Refund
                      </button>
                      <button
                        className="btn btn--secondary btn--sm"
                        style={{ background: "#ef4444", color: "#ffffff", borderColor: "#ef4444" }}
                        onClick={() => void handleReject(draft.id)}
                      >
                        ✕ Reject Claim
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: CS Action Agent Console */}
      {activeTab === "chat" && (
        <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: "500px", padding: 0, overflow: "hidden" }}>
          <div style={{ background: "#1e293b", color: "#ffffff", padding: "1rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700 }}>🤖 Support Action Agent Resolution Simulator</span>
            <span style={{ fontSize: "0.75rem", background: "#0284c7", padding: "2px 8px", borderRadius: "4px" }}>Auto-Limit: $25.00</span>
          </div>

          <div style={{ flex: 1, padding: "1rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem", background: "#f8fafc" }}>
            {messages.map((m, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: m.role === "user" ? "flex-end" : "flex-start"
                }}
              >
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "0.75rem 1rem",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                    lineHeight: 1.45,
                    whiteSpace: "pre-wrap",
                    background: m.role === "user" ? "#0284c7" : "#ffffff",
                    color: m.role === "user" ? "#ffffff" : "#0f172a",
                    border: m.role === "assistant" ? "1px solid #e2e8f0" : "none"
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ color: "#64748b", fontSize: "0.85rem" }}>Agent is inspecting claim &amp; evaluating policy thresholds…</div>
            )}
          </div>

          <div style={{ padding: "0.5rem 1rem", background: "#f1f5f9", display: "flex", gap: "0.4rem", overflowX: "auto" }}>
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => void handleSendTestChat("My organic berries in order ORD-9842 were squished and moldy, can I get a refund of $5.30?")}
              style={{ fontSize: "0.75rem", background: "#ffffff" }}
            >
              Test Auto-Refund ≤$25 (Berries $5.30)
            </button>
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => void handleSendTestChat("My bulk meat order ORD-5541 was spoiled, I need a refund of $48.50")}
              style={{ fontSize: "0.75rem", background: "#ffffff" }}
            >
              Test Supervisor Draft &gt;$25 (Meat $48.50)
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendTestChat();
            }}
            style={{ padding: "0.75rem 1rem", background: "#ffffff", borderTop: "1px solid #e2e8f0", display: "flex", gap: "0.5rem" }}
          >
            <input
              type="text"
              className="input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Simulate customer claim (e.g. 'refund for squished strawberries $4.50'…)"
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn--primary" disabled={!chatInput.trim() || chatLoading}>
              Dispatch
            </button>
          </form>
        </div>
      )}

      {/* Tab 3: Policy RAG Knowledge */}
      {activeTab === "policies" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
          {policies.map((pol) => (
            <div key={pol.id} className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0284c7", background: "#e0f2fe", padding: "2px 6px", borderRadius: "4px" }}>
                  {pol.id} · {pol.topic}
                </span>
                {pol.instantAutoApproveLimitMinor && (
                  <span style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 700 }}>
                    Auto-Limit: ${(pol.instantAutoApproveLimitMinor / 100).toFixed(2)}
                  </span>
                )}
              </div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>{pol.title}</h3>
              <p style={{ fontSize: "0.85rem", color: "#64748b", margin: 0 }}>{pol.summary}</p>
              <ul style={{ paddingLeft: "1.2rem", margin: "0.5rem 0 0 0", fontSize: "0.8rem", color: "#334155", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {pol.rules.map((rule, rIdx) => (
                  <li key={rIdx}>{rule}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
