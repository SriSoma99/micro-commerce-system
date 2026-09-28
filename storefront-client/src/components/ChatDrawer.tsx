import { useState, useRef, useEffect } from "react";
import { sendAiChatMessage } from "../api/aiClient";
import type { AiMessageUi } from "../types/ai";

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  storeId?: string | null;
  token?: string | null;
  onAddToCart?: (productId: string, quantity: number) => Promise<string | null>;
}

const QUICK_PROMPTS = [
  "I need eggs vegan fed",
  "Suggest a gluten-free dinner recipe",
  "What is the return policy for damaged berries?",
  "Find organic produce under $5"
];

export function ChatDrawer({ isOpen, onClose, storeId, token, onAddToCart }: ChatDrawerProps) {
  const [messages, setMessages] = useState<AiMessageUi[]>([
    {
      role: "assistant",
      content: "👋 Hi! I'm **Rufus**, your Aperture Commerce AI assistant. Ask me for recipe ideas, dietary ingredients, store stock, or return policies!"
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [cartAddingId, setCartAddingId] = useState<string | null>(null);
  const [addedToast, setAddedToast] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, loading]);

  if (!isOpen) return null;

  async function handleSend(textToSend?: string) {
    const prompt = (textToSend ?? input).trim();
    if (!prompt || loading) return;

    const userMsg: AiMessageUi = { role: "user", content: prompt };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const result = await sendAiChatMessage(prompt, {
      conversationId,
      persona: "shopper",
      storeId: storeId ?? undefined,
      token: token ?? undefined
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
          content: `⚠️ Sorry, I encountered an issue: ${result.message}. Please try again.`
        }
      ]);
    }
  }

  async function handleQuickAddToCart(productId: string, name: string) {
    if (!onAddToCart) return;
    setCartAddingId(productId);
    const err = await onAddToCart(productId, 1);
    setCartAddingId(null);
    if (!err) {
      setAddedToast(`Added “${name}” to your cart!`);
      setTimeout(() => setAddedToast(null), 3000);
    }
  }

  return (
    <div className="cart-drawer__overlay" onClick={onClose}>
      <div
        className="cart-drawer"
        style={{ width: "440px", maxWidth: "95vw" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="AI Shopping Assistant"
      >
        <div className="cart-drawer__header" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#ffffff", padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.5rem" }}>🤖</span>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "#f8fafc" }}>Rufus AI Assistant</h2>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Grounded on {storeId ?? "Local"} Store Inventory</span>
            </div>
          </div>
          <button className="cart-drawer__close" onClick={onClose} aria-label="Close Assistant" style={{ color: "#94a3b8" }}>
            ✕
          </button>
        </div>

        {addedToast && (
          <div style={{ background: "#10b981", color: "#ffffff", padding: "0.5rem 1rem", fontSize: "0.85rem", fontWeight: 600, textAlign: "center" }}>
            ✓ {addedToast}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
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
                  maxWidth: "88%",
                  padding: "0.75rem 1rem",
                  borderRadius: "12px",
                  fontSize: "0.9rem",
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap",
                  background: m.role === "user" ? "#0284c7" : "#f1f5f9",
                  color: m.role === "user" ? "#ffffff" : "#0f172a",
                  borderBottomRightRadius: m.role === "user" ? "2px" : "12px",
                  borderBottomLeftRadius: m.role === "assistant" ? "2px" : "12px"
                }}
              >
                {m.content}
              </div>

              {/* Render interactive product cards if tool returned catalog items */}
              {m.toolCalls && m.toolCalls.map((tc, tIdx) => {
                if (tc.name === "search_catalog_ai") {
                  const data = tc.result as { items?: { id: string; name: string; brand: string; priceMinor: number; stock: number; sizeLabel: string }[] };
                  const items = data.items ?? [];
                  if (items.length === 0) return null;

                  return (
                    <div key={tIdx} style={{ marginTop: "0.5rem", width: "100%", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Recommended Items:</span>
                      {items.slice(0, 3).map((item) => (
                        <div
                          key={item.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            background: "#ffffff",
                            border: "1px solid #e2e8f0",
                            borderRadius: "8px",
                            padding: "0.5rem 0.75rem"
                          }}
                        >
                          <div style={{ fontSize: "0.85rem" }}>
                            <div style={{ fontWeight: 600, color: "#0f172a" }}>{item.brand} {item.name}</div>
                            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                              ${(item.priceMinor / 100).toFixed(2)} · {item.sizeLabel} · <span style={{ color: item.stock > 0 ? "#16a34a" : "#ef4444" }}>{item.stock > 0 ? `${item.stock} in stock` : "Out of stock"}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            disabled={item.stock <= 0 || cartAddingId === item.id}
                            onClick={() => void handleQuickAddToCart(item.id, item.name)}
                            style={{ fontSize: "0.75rem", padding: "4px 8px", whiteSpace: "nowrap" }}
                          >
                            {cartAddingId === item.id ? "Adding…" : "+ Add"}
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#64748b", fontSize: "0.85rem", padding: "0.5rem" }}>
              <span className="spinner" style={{ width: "16px", height: "16px" }} />
              Rufus is thinking &amp; checking store inventory…
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div style={{ padding: "0.5rem 1rem", borderTop: "1px solid #e2e8f0", display: "flex", gap: "0.4rem", overflowX: "auto", background: "#f8fafc" }}>
          {QUICK_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => void handleSend(prompt)}
              style={{
                fontSize: "0.75rem",
                padding: "4px 8px",
                borderRadius: "16px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#334155",
                whiteSpace: "nowrap",
                cursor: "pointer"
              }}
            >
              {prompt}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          style={{ padding: "0.75rem 1rem", borderTop: "1px solid #e2e8f0", display: "flex", gap: "0.5rem", background: "#ffffff" }}
        >
          <input
            type="text"
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask for recipes, dietary items, policies…"
            style={{ flex: 1, fontSize: "0.9rem" }}
          />
          <button type="submit" className="btn btn--primary" disabled={!input.trim() || loading} style={{ padding: "0 1.25rem" }}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
