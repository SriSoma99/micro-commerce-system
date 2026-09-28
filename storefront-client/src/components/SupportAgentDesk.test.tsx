import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SupportAgentDesk } from "./SupportAgentDesk";
import * as aiClient from "../api/aiClient";

describe("SupportAgentDesk Component (AI Customer Support & Action Desk - AI-04, AI-05)", () => {
  it("renders pending supervisor approval drafts and handles approval action", async () => {
    vi.spyOn(aiClient, "fetchAiDrafts").mockResolvedValue({
      ok: true,
      status: 200,
      source: "live-core",
      retrievedAt: new Date().toISOString(),
      isFallback: false,
      data: {
        drafts: [
          {
            id: "draft_test_123",
            conversationId: "conv_1",
            customerId: "cust_demo",
            actionType: "refund",
            parametersJson: JSON.stringify({ orderId: "ORD-5541", amountMinor: 4850, reason: "Spoiled meat" }),
            reason: "High value claim ($48.50) exceeding $25.00 threshold - requires supervisor approval.",
            riskScore: 0.85,
            status: "pending",
            supervisorId: null,
            createdAt: new Date().toISOString(),
            reviewedAt: null
          }
        ]
      }
    });

    vi.spyOn(aiClient, "fetchAiPolicies").mockResolvedValue({
      ok: true,
      status: 200,
      source: "live-core",
      retrievedAt: new Date().toISOString(),
      isFallback: false,
      data: { policies: [] }
    });

    const approveSpy = vi.spyOn(aiClient, "approveAiDraft").mockResolvedValue({
      ok: true,
      status: 200,
      source: "live-core",
      retrievedAt: new Date().toISOString(),
      isFallback: false,
      data: { status: "approved", draftId: "draft_test_123" }
    });

    render(<SupportAgentDesk token="mock_token" />);

    await waitFor(() => {
      expect(screen.getByText(/draft_test_123/i)).toBeInTheDocument();
      expect(screen.getByText(/ORD-5541/i)).toBeInTheDocument();
      expect(screen.getByText("HIGH VALUE CLAIM")).toBeInTheDocument();
    });

    const approveBtn = screen.getByRole("button", { name: /Approve & Refund/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(approveSpy).toHaveBeenCalledWith("mock_token", "draft_test_123");
    });
  });
});
