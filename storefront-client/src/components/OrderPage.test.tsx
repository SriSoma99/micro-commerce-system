import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { envelope, failure, mockNetwork } from "../test/network";
import type { Order } from "../types/order";
import { OrderPage } from "./OrderPage";

const order = (overrides: Partial<Order> = {}): Order => ({
  orderId: "order-1234-abcd",
  storeId: "IL-01",
  storeName: "Batavia, IL",
  taxJurisdiction: "IL",
  status: "placed",
  currency: "USD",
  subtotalMinor: 1078,
  taxMinor: 11,
  totalMinor: 1089,
  payment: { method: "card-mock", status: "captured", reference: "pay_sim_1", card: { brand: "visa", last4: "4242" } },
  items: [{ lineNo: 1, productId: "p-1", name: "Green Meadow Vanilla Greek Yogurt", sizeLabel: "16 oz", soldBy: "each", quantity: 2, unitPriceMinor: 539, netMinor: 1078, taxCode: "grocery", taxRateBps: 100, taxMinor: 11, configuration: {} }],
  placedAt: "2026-01-01T00:00:00Z",
  invoice: { id: "inv_1", number: "IL-01-000001", orderId: "order-1234-abcd", storeId: "IL-01", storeName: "Batavia, IL", totalMinor: 1089, currency: "USD", issuedAt: "2026-01-01T00:00:00Z" },
  ...overrides,
});

afterEach(() => vi.restoreAllMocks());

describe("OrderPage", () => {
  it("confirms the order with totals, payment and a link to the stored invoice", async () => {
    const network = mockNetwork({ "GET /orders/order-1234-abcd": () => envelope(order()) });
    render(<OrderPage orderId="order-1234-abcd" token="bearer-1" />);

    expect(await screen.findByRole("heading", { name: "Thank you for your order!" })).toBeInTheDocument();
    expect(screen.getByText("Pickup at Batavia, IL")).toBeInTheDocument();
    expect(screen.getByText("$10.89")).toBeInTheDocument();
    expect(screen.getByText("Paid with VISA ····4242.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View invoice IL-01-000001" })).toHaveAttribute("href", "#/invoices/inv_1");
    expect(network.calls[0]?.headers).toMatchObject({ Authorization: "Bearer bearer-1" });
  });

  it("tells a pay-at-pickup customer to pay at the counter", async () => {
    mockNetwork({ "GET /orders/": () => envelope(order({ payment: { method: "pay-at-pickup", status: "authorized", reference: "p", card: null } })) });
    render(<OrderPage orderId="order-1234-abcd" token="t" />);

    expect(await screen.findByText("Pay when you pick up your order at the store.")).toBeInTheDocument();
  });

  it("says so when the order can't be found (or isn't yours)", async () => {
    mockNetwork({ "GET /orders/": () => failure(404, { error: "ORDER_NOT_FOUND", message: "No order" }) });
    render(<OrderPage orderId="nope" token="t" />);

    expect(await screen.findByText("We couldn't find that order.")).toBeInTheDocument();
  });
});
