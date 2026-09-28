import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChatDrawer } from "./ChatDrawer";
import * as aiClient from "../api/aiClient";

describe("ChatDrawer Component (Shopper Rufus Assistant - AI-01)", () => {
  it("renders assistant drawer when open and displays initial welcome message", () => {
    render(<ChatDrawer isOpen={true} onClose={vi.fn()} storeId="OH-01" />);

    expect(screen.getByRole("dialog", { name: "AI Shopping Assistant" })).toBeInTheDocument();
    expect(screen.getByText(/Rufus AI Assistant/i)).toBeInTheDocument();
    expect(screen.getByText(/Hi! I'm/i)).toBeInTheDocument();
  });

  it("sends user prompt and renders assistant response with recommended product cards", async () => {
    vi.spyOn(aiClient, "sendAiChatMessage").mockResolvedValueOnce({
      ok: true,
      status: 200,
      source: "live-core",
      retrievedAt: new Date().toISOString(),
      isFallback: false,
      data: {
        conversationId: "conv_123",
        response: "Here are the organic eggs available at your store:",
        toolCalls: [
          {
            name: "search_catalog_ai",
            arguments: { query: "eggs" },
            result: {
              items: [
                {
                  id: "p-00080",
                  name: "Cage-Free Vegetarian-Fed Eggs",
                  brand: "Goldhen",
                  priceMinor: 299,
                  stock: 42,
                  sizeLabel: "1 Dozen"
                }
              ]
            }
          }
        ]
      }
    });

    const onAddToCart = vi.fn().mockResolvedValue(null);

    render(<ChatDrawer isOpen={true} onClose={vi.fn()} storeId="OH-01" onAddToCart={onAddToCart} />);

    const input = screen.getByPlaceholderText(/Ask for recipes/i);
    fireEvent.change(input, { target: { value: "I need eggs vegan fed" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText(/Here are the organic eggs/i)).toBeInTheDocument();
      expect(screen.getByText(/Goldhen Cage-Free Vegetarian-Fed Eggs/i)).toBeInTheDocument();
      expect(screen.getByText(/\$2.99/i)).toBeInTheDocument();
    });

    const addBtn = screen.getByRole("button", { name: "+ Add" });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(onAddToCart).toHaveBeenCalledWith("p-00080", 1);
    });
  });
});
