import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { envelope, failure, mockNetwork } from "../test/network";
import type { InvoiceSummary } from "../types/order";
import { InvoicesPage } from "./InvoicesPage";

const invoice = (n: number, overrides: Partial<InvoiceSummary> = {}): InvoiceSummary => ({
  id: `inv_${n}`,
  number: `IL-01-00000${n}`,
  orderId: `order-${n}`,
  storeId: "IL-01",
  storeName: "Batavia, IL",
  totalMinor: 1089 * n,
  currency: "USD",
  issuedAt: "2026-01-0" + n + "T15:30:00Z",
  ...overrides,
});

afterEach(() => vi.restoreAllMocks());

describe("InvoicesPage", () => {
  it("lists the customer's invoices with number, store and exact total, each linking to its view", async () => {
    const network = mockNetwork({ "GET /customers/me/invoices": () => envelope([invoice(2), invoice(1)]) });
    render(<InvoicesPage token="bearer-1" />);

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText("IL-01-000002")).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText("$21.78")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("$10.89")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View invoice IL-01-000002" })).toHaveAttribute("href", "#/invoices/inv_2");
    expect(network.calls[0]?.headers).toMatchObject({ Authorization: "Bearer bearer-1" });
  });

  it("has a friendly empty state", async () => {
    mockNetwork({ "GET /customers/me/invoices": () => envelope([]) });
    render(<InvoicesPage token="t" />);

    expect(await screen.findByText("No invoices yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start shopping" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an error instead of an empty page when loading fails", async () => {
    mockNetwork({ "GET /customers/me/invoices": () => failure(500, { error: "X", message: "Something broke" }) });
    render(<InvoicesPage token="t" />);

    expect(await screen.findByText("Something broke")).toBeInTheDocument();
  });
});
