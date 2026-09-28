import { useState } from "react";
import { sendAiChatMessage } from "../api/aiClient";
import type { AiMessageUi } from "../types/ai";

interface CopilotTabProps {
  token: string;
  storeId?: string | null;
  userRole?: string;
}

const MANAGER_QUICK_PROMPTS = [
  "What is the average sale on 10-Sep-2026?",
  "Show expiring batches in the next 30 days",
  "Which items are currently low in stock?",
  "What were total network sales on 10-Sep-2026?"
];

export function CopilotTab({ token, storeId, userRole }: CopilotTabProps) {
  const [messages, setMessages] = useState<AiMessageUi[]>([
    {
      role: "assistant",
      content: "👋 Welcome to the **Manager & Finance AI Copilot**. You can query grounded sales totals, Average Order Value (AOV) for specific dates, batch expiry logs, WAC gross margins, and store transfer suggestions."
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);

  async function handleSend(textToSend?: string) {
    const prompt = (textToSend ?? input).trim();
    if (!prompt || loading) return;

    const userMsg: AiMessageUi = { role: "user", content: prompt };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const result = await sendAiChatMessage(prompt, {
      conversationId,
      persona: "store_manager",
      storeId: storeId ?? undefined,
      token
    });

    setLoading(false);

    if (result.ok) {
      setConversationId(result.data.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.data.response,
          toolCalls: result.data.toolCalls,
          draftCreated: result.data.draftCreated
        }
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ Error executing copilot query: ${result.message}`
        }
      ]);
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: "550px", padding: 0, overflow: "hidden" }}>
      <div style={{ background: "linear-gradient(90deg, #1e293b 0%, #334155 100%)", color: "#ffffff", padding: "1rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "1.8rem" }}>🤖</span>
          <div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "#f8fafc" }}>Store Keeper &amp; Finance Copilot</h2>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8" }}>
              Grounded AI Engine · Store: <strong>{storeId ?? "All Stores"}</strong> · Role: <strong>{userRole ?? "Manager"}</strong>
            </p>
          </div>
        </div>
        <span style={{ background: "#059669", color: "#ffffff", padding: "4px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 700 }}>
          Live RAG Connected
        </span>
      </div>

      {/* Chat messages */}
      <div style={{ flex: 1, padding: "1.25rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem", background: "#f8fafc" }}>
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
                padding: "0.85rem 1.25rem",
                borderRadius: "10px",
                fontSize: "0.95rem",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                background: m.role === "user" ? "#0369a1" : "#ffffff",
                color: m.role === "user" ? "#ffffff" : "#0f172a",
                border: m.role === "assistant" ? "1px solid #e2e8f0" : "none",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
              }}
            >
              {m.content}
            </div>

            {/* Chip for executed tools */}
            {m.toolCalls && m.toolCalls.length > 0 && (
              <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.35rem" }}>
                {m.toolCalls.map((tc, tIdx) => (
                  <span
                    key={tIdx}
                    style={{
                      fontSize: "0.7rem",
                      padding: "2px 8px",
                      background: "#e0f2fe",
                      color: "#0369a1",
                      borderRadius: "4px",
                      fontWeight: 600
                    }}
                  >
                    ⚡ Invoked: <code>{tc.name}</code>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "#64748b", fontSize: "0.9rem", padding: "0.5rem" }}>
            <span className="spinner" style={{ width: "18px", height: "18px" }} />
            Copilot is querying the accounting ledger and inventory balances…
          </div>
        )}
      </div>

      {/* Suggested chips */}
      <div style={{ padding: "0.6rem 1.25rem", background: "#f1f5f9", borderTop: "1px solid #e2e8f0", display: "flex", gap: "0.5rem", overflowX: "auto" }}>
        {MANAGER_QUICK_PROMPTS.map((prompt, idx) => (
          <button
            key={idx}
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => void handleSend(prompt)}
            style={{ fontSize: "0.8rem", whiteSpace: "nowrap", background: "#ffffff" }}
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        style={{ padding: "1rem 1.25rem", background: "#ffffff", borderTop: "1px solid #e2e8f0", display: "flex", gap: "0.75rem" }}
      >
        <input
          type="text"
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about daily sales, average order value, expiry dates, or margins…"
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn btn--primary" disabled={!input.trim() || loading} style={{ padding: "0 1.5rem" }}>
          Query Copilot
        </button>
      </form>
    </div>
  );
}
