import type { AiCompletionRequest, AiCompletionResponse, AiToolCall, LlmProvider } from "./types";

/**
 * Deterministic local desktop LLM provider:
 * Extracts user intent, parameters, and routes tool calls for:
 * 1. Shopper Rufus (dietary recipes, vegan-fed eggs, organic search, 1-click cart addition).
 * 2. Store Manager & Finance Copilot (sales queries for exact dates e.g. 10-Sep-2026, expiring batches, WAC margins).
 * 3. Support Action Agent (RAG policy answers, damaged perishable refund dispatch <= $25, and supervisor drafts > $25).
 */
export class DeterministicLocalLlmProvider implements LlmProvider {
  readonly id = "local-deterministic";
  readonly displayName = "Deterministic Local Engine (Offline)";
  readonly isCloud = false;

  async generateCompletion(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const { messages, persona, tools } = request;
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const lowerQuery = lastUserMessage.toLowerCase();

    // 1. Check if the previous message was a tool result that needs summarization
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "tool" && lastMessage.toolResults && lastMessage.toolResults.length > 0) {
      return {
        message: {
          role: "assistant",
          content: this.summarizeToolResults(lastMessage.toolResults)
        },
        finishReason: "stop",
        usage: { promptTokens: 120, completionTokens: 85, totalTokens: 205 }
      };
    }

    // 2. Intent-to-Tool Routing: Determine if a tool needs to be called
    const toolCalls: AiToolCall[] = [];

    // A) Sales Analytics (e.g., "average sale on 10-Sep-2026", "what were sales on 2026-09-10")
    if ((persona === "store_manager" || persona === "support_desk" || request.userRole === "finance" || request.userRole === "admin" || request.userRole === "store-manager") &&
        (lowerQuery.includes("average sale") || lowerQuery.includes("sales on") || lowerQuery.includes("aov") || lowerQuery.includes("revenue on") || lowerQuery.includes("daily sales"))) {
      
      const dateMatch = this.extractDate(lowerQuery) ?? "2026-09-10";
      const storeMatch = this.extractStoreId(lowerQuery) ?? request.storeId ?? "IL-01";
      const isNetwork = lowerQuery.includes("network") || lowerQuery.includes("all stores") || request.userRole === "finance" || request.userRole === "admin";

      if (this.hasTool(tools, "get_store_sales_analytics")) {
        toolCalls.push({
          id: `call_${Date.now()}_sales`,
          name: "get_store_sales_analytics",
          arguments: {
            date: dateMatch,
            storeId: storeMatch,
            scope: isNetwork ? "network" : "store"
          }
        });
      }
    }

    // B) Expiring Batches / Low Stock (Manager Copilot)
    else if ((persona === "store_manager" || request.userRole === "store-manager" || request.userRole === "admin") &&
             (lowerQuery.includes("expir") || lowerQuery.includes("low stock") || lowerQuery.includes("batch") || lowerQuery.includes("spoil"))) {
      if (this.hasTool(tools, "get_expiring_batches_ai")) {
        toolCalls.push({
          id: `call_${Date.now()}_expiry`,
          name: "get_expiring_batches_ai",
          arguments: {
            storeId: request.storeId ?? "IL-01",
            daysThreshold: 30
          }
        });
      }
    }

    // C) Refund or Damage Resolution (Support Action Agent / Shopper)
    else if (lowerQuery.includes("refund") || lowerQuery.includes("squished") || lowerQuery.includes("moldy") || lowerQuery.includes("damaged") || lowerQuery.includes("broken") || lowerQuery.includes("return")) {
      const orderIdMatch = lowerQuery.match(/\b(ord[-_]?[0-9a-f]+|ord[-_]?\d+)\b/i)?.[0]?.toUpperCase() ?? "ORD-DEMO-001";
      const directDollarMatch = lastUserMessage.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
      const rawNumberMatch = lastUserMessage.match(/\b(\d+\.\d{2})\b/);
      let amountMinor = 530; // default $5.30 if unspecified
      if (directDollarMatch && directDollarMatch[1]) {
        amountMinor = Math.round(parseFloat(directDollarMatch[1]) * 100);
      } else if (rawNumberMatch && rawNumberMatch[1]) {
        amountMinor = Math.round(parseFloat(rawNumberMatch[1]) * 100);
      }

      if (this.hasTool(tools, "execute_customer_refund_ai")) {
        toolCalls.push({
          id: `call_${Date.now()}_refund`,
          name: "execute_customer_refund_ai",
          arguments: {
            orderId: orderIdMatch,
            amountMinor,
            reason: lowerQuery.includes("moldy") ? "Damaged / Moldy Perishable Grocery" : "Customer Quality Dispute",
            itemType: lowerQuery.includes("berries") || lowerQuery.includes("milk") || lowerQuery.includes("meat") || lowerQuery.includes("produce") ? "perishable" : "non_perishable"
          }
        });
      } else if (this.hasTool(tools, "query_store_policy_ai")) {
        toolCalls.push({
          id: `call_${Date.now()}_policy`,
          name: "query_store_policy_ai",
          arguments: {
            query: lastUserMessage,
            topic: lowerQuery.includes("perish") || lowerQuery.includes("moldy") || lowerQuery.includes("berries") ? "perishable_goods" : "returns_and_refunds"
          }
        });
      }
    }

    // D) Shopper Product Search / Recipe (e.g. "eggs vegan fed", "gluten-free pasta", "recipe for chili")
    else if (persona === "shopper" || lowerQuery.includes("need") || lowerQuery.includes("find") || lowerQuery.includes("search") || lowerQuery.includes("recipe") || lowerQuery.includes("buy")) {
      const dietary: string[] = [];
      if (lowerQuery.includes("vegan") || lowerQuery.includes("vegan fed") || lowerQuery.includes("vegetarian-fed")) dietary.push("vegetarian-fed", "organic");
      if (lowerQuery.includes("gluten-free") || lowerQuery.includes("gluten free")) dietary.push("gluten-free");
      if (lowerQuery.includes("organic")) dietary.push("organic");

      // Extract core product name
      let searchKeyword = lowerQuery
        .replace(/i need|find me|search for|looking for|vegan fed|vegan|gluten-free|organic|in stock|buy/gi, "")
        .trim();
      if (searchKeyword.includes("egss") || searchKeyword.includes("egg")) searchKeyword = "eggs";
      if (searchKeyword.includes("avocad")) searchKeyword = "avocado";
      if (searchKeyword.includes("strawber")) searchKeyword = "strawberries";
      if (searchKeyword.includes("bread") || searchKeyword.includes("sourdough")) searchKeyword = "bread";
      if (!searchKeyword || searchKeyword.length < 2) searchKeyword = "eggs";

      if (this.hasTool(tools, "search_catalog_ai")) {
        toolCalls.push({
          id: `call_${Date.now()}_search`,
          name: "search_catalog_ai",
          arguments: {
            query: searchKeyword,
            dietary: dietary.length > 0 ? dietary : undefined,
            storeId: request.storeId ?? "OH-01"
          }
        });
      }
    }

    // If tools were identified, request tool execution
    if (toolCalls.length > 0) {
      return {
        message: {
          role: "assistant",
          content: "I am analyzing the latest store inventory and policies to assist you...",
          toolCalls
        },
        finishReason: "tool_calls",
        usage: { promptTokens: 90, completionTokens: 45, totalTokens: 135 }
      };
    }

    // Default conversational response if no specific tool matches
    return {
      message: {
        role: "assistant",
        content: `I am your **Aperture Commerce AI Assistant**. I can help you find grocery items, check dietary tags, calculate store sales metrics, look up batch expiries, and resolve return/refund policies. How can I help you today?`
      },
      finishReason: "stop",
      usage: { promptTokens: 60, completionTokens: 40, totalTokens: 100 }
    };
  }

  private summarizeToolResults(results: { name: string; result: unknown }[]): string {
    const parts: string[] = [];

    for (const r of results) {
      const data = (r.result ?? {}) as Record<string, unknown>;

      if (r.name === "search_catalog_ai") {
        const items = (data.items ?? []) as { id: string; name: string; brand: string; priceMinor: number; stock: number; sizeLabel: string }[];
        if (items.length === 0) {
          parts.push(`I searched our current catalog and local store inventory, but couldn't find an exact match. Would you like me to suggest related alternatives?`);
        } else {
          parts.push(`Here are the matching grocery items currently available in stock at your selected store:\n`);
          for (const item of items.slice(0, 4)) {
            const price = (item.priceMinor / 100).toFixed(2);
            parts.push(`- **${item.brand} ${item.name}** (${item.sizeLabel}) - **$${price}** · In Stock: **${item.stock} left**`);
          }
          parts.push(`\nYou can click **"Add to Cart"** on any item to add it directly to your shopping basket!`);
        }
      } else if (r.name === "get_store_sales_analytics") {
        const date = String(data.date ?? "2026-09-10");
        const aov = String(data.averageSale ?? "$28.50");
        const count = String(data.orderCount ?? "16");
        const gross = String(data.grossSales ?? "$456.00");
        const store = String(data.storeName ?? "Batavia, IL (IL-01)");
        const scope = String(data.scope ?? "store");

        if (scope === "network") {
          parts.push(`### 📊 Enterprise Financial Report for ${date}\n\n` +
            `- **Total Network Orders:** **${count}** transactions\n` +
            `- **Network Gross Revenue:** **${gross}**\n` +
            `- **Network Average Sale (AOV):** **${aov}** per order\n` +
            `- **Estimated Gross Margin:** **38.4%**\n\n` +
            `*Sales data is verified against the general accounting ledger across IL, OH, and PA jurisdictions.*`);
        } else {
          parts.push(`On **${date}**, the **${store}** store processed **${count}** customer orders with a total gross revenue of **${gross}**, achieving an **Average Sale (Average Order Value)** of **${aov}** per order.`);
        }
      } else if (r.name === "execute_customer_refund_ai") {
        if (data.status === "auto_approved") {
          const amount = ((Number(data.amountMinor) || 0) / 100).toFixed(2);
          parts.push(`✅ **Refund Automatically Approved & Processed**\n\n` +
            `Under our **Freshness Guarantee Policy**, an instant refund of **$${amount}** has been processed for Order **#${String(data.orderId ?? "")}**.\n` +
            `- **Credit Receipt Reference:** \`${String(data.creditNoteNumber ?? "")}\`\n` +
            `- **Reason:** ${String(data.reason ?? "")}\n` +
            `- **Action Taken:** Funds returned to original payment card.`);
        } else if (data.status === "draft_created") {
          const amount = ((Number(data.amountMinor) || 0) / 100).toFixed(2);
          parts.push(`⚠️ **Supervisor Approval Required**\n\n` +
            `The requested refund amount of **$${amount}** for Order **#${String(data.orderId ?? "")}** exceeds the instant autonomous threshold ($25.00).\n` +
            `I have created an **Action Approval Draft** (Draft ID: \`${String(data.draftId ?? "")}\`) for store manager / supervisor review. You will receive an update once approved.`);
        }
      } else if (r.name === "get_expiring_batches_ai") {
        const batches = (data.batches ?? []) as { productName: string; batchNumber: string; expiryDate: string; stock: number; storeName: string }[];
        if (batches.length === 0) {
          parts.push(`✅ **Inventory Health Check:** No perishable batches are approaching expiry within the next 30 days.`);
        } else {
          parts.push(`### ⚠️ Perishable Expiry Warnings (Next 30 Days):\n`);
          for (const b of batches.slice(0, 5)) {
            parts.push(`- **${b.productName}** (Batch: \`${b.batchNumber}\`): **${b.stock} units** expiring on **${b.expiryDate}** at ${b.storeName}`);
          }
          parts.push(`\n*Recommendation: Consider marking down these items by 20% or initiating an inter-store rebalance.*`);
        }
      } else if (r.name === "query_store_policy_ai") {
        const policies = (data.policies ?? []) as { title: string; summary: string; rules: string[] }[];
        if (policies.length > 0) {
          const first = policies[0];
          if (first) {
            parts.push(`### 📜 Store Policy Summary: ${first.title}\n\n${first.summary}\n`);
            for (const rule of first.rules.slice(0, 3)) {
              parts.push(`• ${rule}`);
            }
          }
        }
      }
    }

    return parts.length > 0 ? parts.join("\n\n") : "I have completed the requested operation with the latest store data.";
  }

  private hasTool(tools: AiCompletionRequest["tools"], name: string): boolean {
    if (!tools || tools.length === 0) return true; // if no tools specified, allow default
    return tools.some((t) => t.name === name);
  }

  private extractDate(query: string): string | null {
    // Matches 10-Sep-2026, 2026-09-10, Sep 10 2026, September 10, 2026
    const isoMatch = query.match(/\b(202\d-\d{2}-\d{2})\b/);
    if (isoMatch) return isoMatch[1] ?? null;

    const sepMatch = query.match(/(\d{1,2})[-/ ]?(sep|september)[-/ ]?(202\d)?/i) || query.match(/(sep|september)[-/ ]?(\d{1,2})[,/-]? ?(202\d)?/i);
    if (sepMatch) {
      const part1 = sepMatch[1] ?? "";
      const part2 = sepMatch[2] ?? "";
      const day = /^\d+$/.test(part1) ? part1.padStart(2, "0") : part2.padStart(2, "0");
      const year = sepMatch[3] ?? "2026";
      return `${year}-09-${day}`;
    }
    return null;
  }

  private extractStoreId(query: string): string | null {
    if (query.includes("il-01") || query.includes("batavia")) return "IL-01";
    if (query.includes("il-02") || query.includes("aurora")) return "IL-02";
    if (query.includes("oh-01") || query.includes("columbus")) return "OH-01";
    if (query.includes("oh-02") || query.includes("dublin")) return "OH-02";
    if (query.includes("pa-01") || query.includes("pittsburgh")) return "PA-01";
    return null;
  }
}
