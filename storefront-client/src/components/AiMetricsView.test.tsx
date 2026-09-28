import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AiMetricsView } from "./AiMetricsView";
import * as aiClient from "../api/aiClient";

describe("AiMetricsView Component (AI & RAG Observability Dashboard - AI-06, OBS)", () => {
  it("renders RAGAS Faithfulness score, Context Precision, and tool counters", async () => {
    vi.spyOn(aiClient, "fetchAiMetrics").mockResolvedValue({
      ok: true,
      status: 200,
      source: "live-core",
      retrievedAt: new Date().toISOString(),
      isFallback: false,
      data: {
        totalQueries: 250,
        faithfulnessScore: 0.995,
        contextPrecision: 0.972,
        contextRecall: 0.985,
        avgLatencyMs: 195,
        autoApprovedActionsCount: 68,
        supervisorDraftsCount: 9,
        autoRefundTotalMinor: 38200,
        toolInvocations: {
          search_catalog_ai: 150,
          get_store_sales_analytics: 55,
          query_store_policy_ai: 25,
          execute_customer_refund_ai: 20
        },
        personaBreakdown: {
          shopper: 170,
          store_manager: 60,
          support_desk: 20
        }
      }
    });

    render(<AiMetricsView />);

    await waitFor(() => {
      expect(screen.getByText("99.5%")).toBeInTheDocument();
      expect(screen.getByText("97.2%")).toBeInTheDocument();
      expect(screen.getByText("195 ms")).toBeInTheDocument();
      expect(screen.getByText("68 processed")).toBeInTheDocument();
      expect(screen.getByText("search_catalog_ai")).toBeInTheDocument();
    });
  });
});
