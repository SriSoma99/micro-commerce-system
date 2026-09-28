import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CopilotTab } from "./CopilotTab";
import * as aiClient from "../api/aiClient";

describe("CopilotTab Component (Store Keeper & Finance Copilot - AI-02)", () => {
  it("renders manager copilot header and sends sales queries", async () => {
    vi.spyOn(aiClient, "sendAiChatMessage").mockResolvedValueOnce({
      ok: true,
      status: 200,
      source: "live-core",
      retrievedAt: new Date().toISOString(),
      isFallback: false,
      data: {
        conversationId: "conv_mgr_1",
        response: "On September 10, 2026, Batavia, IL (IL-01) recorded 16 transactions with an Average Sale (AOV) of $30.15.",
        toolCalls: [
          {
            name: "get_store_sales_analytics",
            arguments: { date: "2026-09-10", storeId: "IL-01" },
            result: { orderCount: 16, grossSales: "$482.40", averageSale: "$30.15" }
          }
        ]
      }
    });

    render(<CopilotTab token="mock_token" storeId="IL-01" userRole="store-manager" />);

    expect(screen.getByText(/Store Keeper & Finance Copilot/i)).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Ask about daily sales/i);
    fireEvent.change(input, { target: { value: "What is average sale on 10-Sep-2026?" } });
    fireEvent.click(screen.getByRole("button", { name: "Query Copilot" }));

    await waitFor(() => {
      expect(screen.getByText(/Average Sale \(AOV\) of \$30\.15/i)).toBeInTheDocument();
      expect(screen.getByText(/get_store_sales_analytics/i)).toBeInTheDocument();
    });
  });
});
