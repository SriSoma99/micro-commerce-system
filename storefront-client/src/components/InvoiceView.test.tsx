import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { envelope, failure, mockNetwork } from "../test/network";
import { InvoiceView } from "./InvoiceView";

const summary = { id: "inv_1", number: "IL-01-000001", orderId: "order-1", storeId: "IL-01", storeName: "Batavia, IL", totalMinor: 1089, currency: "USD", issuedAt: "2026-01-01T15:30:00Z" };
const receipt = (simulated = true) => ({
  invoiceNumber: "IL-01-000001",
  issuedAt: "2026-01-01T15:30:00Z",
  orderId: "order-1",
  store: { id: "IL-01", name: "Batavia, IL", jurisdiction: "IL" },
  customer: { id: "c", name: "Test User", email: "testuser@mydomain.com" },
  currency: "USD",
  lines: [],
  totals: { subtotalMinor: 1078, taxMinor: 11, totalMinor: 1089 },
  payment: { methodName: "Credit / debit card", status: "captured", reference: "pay_sim_1", simulated, card: { brand: "visa", last4: "4242" } },
});
const RECEIPT_HTML = "<!doctype html><html><body><h1>BATAVIA, IL</h1><b>IL-01-000001</b></body></html>";

const routes = (simulated = true) => ({
  "GET /customers/me/invoices/inv_1/html": () => new Response(RECEIPT_HTML, { status: 200, headers: { "content-type": "text/html" } }),
  "GET /customers/me/invoices/inv_1": () => envelope({ summary, receipt: receipt(simulated) }),
});

afterEach(() => vi.restoreAllMocks());

describe("InvoiceView", () => {
  it("shows the stored invoice: header details and the server-rendered receipt in a sandboxed frame", async () => {
    const network = mockNetwork(routes());
    render(<InvoiceView invoiceId="inv_1" token="bearer-1" />);

    expect(await screen.findByRole("heading", { name: "Invoice IL-01-000001" })).toBeInTheDocument();
    expect(screen.getByText(/Batavia, IL/)).toBeInTheDocument();
    expect(screen.getByText("$10.89")).toBeInTheDocument();

    const frame = screen.getByTitle("Invoice IL-01-000001") as HTMLIFrameElement;
    expect(frame.getAttribute("srcdoc")).toBe(RECEIPT_HTML);
    // No scripts may run inside the receipt.
    expect(frame.getAttribute("sandbox")).not.toContain("allow-scripts");
    expect(network.calls.every((call) => call.headers.Authorization === "Bearer bearer-1")).toBe(true);
  });

  it("warns that a simulated payment was not real money", async () => {
    mockNetwork(routes(true));
    render(<InvoiceView invoiceId="inv_1" token="t" />);

    expect(await screen.findByText(/simulated payment\. No real money was charged/)).toBeInTheDocument();
  });

  it("has no simulation warning for a real payment", async () => {
    mockNetwork(routes(false));
    render(<InvoiceView invoiceId="inv_1" token="t" />);

    await screen.findByRole("heading", { name: "Invoice IL-01-000001" });
    expect(screen.queryByText(/simulated payment/)).not.toBeInTheDocument();
  });

  it("prints the receipt frame (not the whole page)", async () => {
    mockNetwork(routes());
    render(<InvoiceView invoiceId="inv_1" token="t" />);
    const frame = (await screen.findByTitle("Invoice IL-01-000001")) as HTMLIFrameElement;
    const print = vi.fn();
    Object.defineProperty(frame.contentWindow, "print", { value: print, configurable: true });

    await userEvent.click(screen.getByRole("button", { name: "Print / Save as PDF" }));

    expect(print).toHaveBeenCalledTimes(1);
  });

  it("downloads the receipt as an HTML file named after the invoice", async () => {
    mockNetwork(routes());
    const createUrl = vi.fn(() => "blob:receipt");
    URL.createObjectURL = createUrl;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<InvoiceView invoiceId="inv_1" token="t" />);
    await screen.findByRole("heading", { name: "Invoice IL-01-000001" });

    await userEvent.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(createUrl).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("says so when the invoice doesn't exist or belongs to someone else", async () => {
    mockNetwork({
      "GET /customers/me/invoices/nope/html": () => failure(404, { error: "INVOICE_NOT_FOUND", message: "x" }),
      "GET /customers/me/invoices/nope": () => failure(404, { error: "INVOICE_NOT_FOUND", message: "x" }),
    });
    render(<InvoiceView invoiceId="nope" token="t" />);

    expect(await screen.findByText("We couldn't find that invoice.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to my invoices" })).toHaveAttribute("href", "#/invoices");
  });
});
