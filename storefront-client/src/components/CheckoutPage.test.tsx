import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { envelope, failure, mockNetwork } from "../test/network";
import type { Cart } from "../types/cart";
import type { Order, Quote } from "../types/order";
import type { PublicStoreConfig } from "../types/store";
import { CheckoutPage } from "./CheckoutPage";

const GATEWAY = "http://gateway.test";
const FULL_CARD = "4242424242424242";

const config: PublicStoreConfig = {
  region: "US",
  currency: "USD",
  locale: "en-US",
  priceMode: "tax-exclusive",
  units: "imperial",
  paymentSimulation: true,
  stores: [
    { id: "IL-01", name: "Batavia, IL", taxJurisdiction: "IL" },
    { id: "OH-01", name: "Columbus, OH", taxJurisdiction: "OH" },
  ],
  paymentMethods: [
    { id: "card-mock", displayName: "Credit / debit card", kind: "card", simulated: true, clientConfig: { tokenizationUrl: `${GATEWAY}/v1/tokens`, publishableKey: "pk_test_dummy", testCardsUrl: `${GATEWAY}/v1/test-cards`, tokenMethod: "card" } },
    { id: "pay-at-pickup", displayName: "Pay at pickup", kind: "offline", simulated: true },
  ],
};

const cart: Cart = {
  cartId: "cart-1",
  itemCount: 2,
  subtotalMinor: 1078,
  currency: "USD",
  updatedAt: "2026-01-01T00:00:00Z",
  items: [{ lineItemId: "l1", productId: "p-1", name: "Green Meadow Vanilla Greek Yogurt", thumbnail: "/x.svg", priceMinor: 539, currency: "USD", quantity: 2, sizeLabel: "16 oz", soldBy: "each", taxCode: "grocery" }],
};

const line = { lineNo: 1, productId: "p-1", name: "Green Meadow Vanilla Greek Yogurt", sizeLabel: "16 oz", soldBy: "each" as const, quantity: 2, unitPriceMinor: 539, netMinor: 1078, taxCode: "grocery", taxRateBps: 100, taxMinor: 11, configuration: {} };
const quoteFor = (storeId: string): Quote =>
  storeId === "OH-01"
    ? { storeId, storeName: "Columbus, OH", jurisdiction: "OH", currency: "USD", items: [{ ...line, taxRateBps: 0, taxMinor: 0 }], subtotalMinor: 1078, taxMinor: 0, totalMinor: 1078 }
    : { storeId, storeName: "Batavia, IL", jurisdiction: "IL", currency: "USD", items: [line], subtotalMinor: 1078, taxMinor: 11, totalMinor: 1089 };

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
  items: [line],
  placedAt: "2026-01-01T00:00:00Z",
  invoice: { id: "inv_1", number: "IL-01-000001", orderId: "order-1234-abcd", storeId: "IL-01", storeName: "Batavia, IL", totalMinor: 1089, currency: "USD", issuedAt: "2026-01-01T00:00:00Z" },
  ...overrides,
});

const TEST_CARDS = { card: [{ number: "4242 4242 4242 4242", outcome: "Approved (Visa)" }, { number: "4000 0000 0000 9995", outcome: "Declined: insufficient_funds" }], ebt: [] };

/** The routes every scenario shares; a test overrides only what it is about. */
const baseRoutes = (overrides: Record<string, () => Response | Promise<Response>> = {}) => ({
  "POST /checkout/quote": (call: { body: unknown }) => envelope(quoteFor((call.body as { storeId: string }).storeId)),
  "GET /v1/test-cards": () => new Response(JSON.stringify(TEST_CARDS)),
  "POST /v1/tokens": () => new Response(JSON.stringify({ token: "tok_sim_abc", brand: "visa", last4: "4242" }), { status: 201 }),
  "POST /checkout": () => envelope(order(), 201),
  ...overrides,
});

const setup = async (props: Partial<Parameters<typeof CheckoutPage>[0]> = {}) => {
  const onPlaced = vi.fn();
  const onSelectStore = vi.fn();
  render(<CheckoutPage token="bearer-1" cart={cart} config={config} storeId="IL-01" onSelectStore={onSelectStore} onPlaced={onPlaced} {...props} />);
  return { onPlaced, onSelectStore, user: userEvent.setup() };
};

const fillCard = async (user: ReturnType<typeof userEvent.setup>, number = FULL_CARD, expiry = "1230", cvc = "123") => {
  await user.type(screen.getByLabelText(/Card number/), number);
  await user.type(screen.getByLabelText(/Expiry/), expiry);
  await user.type(screen.getByLabelText("Security code"), cvc);
};

afterEach(() => vi.restoreAllMocks());

describe("CheckoutPage", () => {
  it("prices the cart at the chosen store: shows the server's tax and total, and 'Pay' carries that total", async () => {
    mockNetwork(baseRoutes());
    await setup();

    const summary = screen.getByRole("complementary", { name: "Order summary" });
    expect(await within(summary).findByText("Sales tax (IL)")).toBeInTheDocument();
    expect(within(summary).getByText("$0.11")).toBeInTheDocument();
    expect(within(summary).getAllByText("$10.89").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Pay $10.89" })).toBeEnabled();
  });

  it("re-prices when the store changes (tax follows the store's state)", async () => {
    const network = mockNetwork(baseRoutes());
    const { rerender } = render(<CheckoutPage token="t" cart={cart} config={config} storeId="IL-01" onSelectStore={vi.fn()} onPlaced={vi.fn()} />);
    await screen.findByText("Sales tax (IL)");

    rerender(<CheckoutPage token="t" cart={cart} config={config} storeId="OH-01" onSelectStore={vi.fn()} onPlaced={vi.fn()} />);

    expect(await screen.findByText("Sales tax (OH)")).toBeInTheDocument();
    expect(network.callsTo("/checkout/quote").map((call) => (call.body as { storeId: string }).storeId)).toEqual(["IL-01", "OH-01"]);
    expect(screen.getByRole("button", { name: "Pay $10.78" })).toBeInTheDocument();
  });

  it("displays the locked pickup store location for the order", async () => {
    mockNetwork(baseRoutes());
    await setup();

    expect(screen.getByText(/Batavia, IL/)).toBeInTheDocument();
    expect(screen.getByText("Locked for Order")).toBeInTheDocument();
    expect(screen.getByText(/Store #IL-01/)).toBeInTheDocument();
  });

  it("makes the demo nature unmissable", async () => {
    mockNetwork(baseRoutes());
    await setup();

    expect(await screen.findByText(/Simulated payment\./)).toBeInTheDocument();
    expect(screen.getByText(/local dummy payment server/)).toBeInTheDocument();
  });

  it("checks the card form before contacting anyone", async () => {
    const network = mockNetwork(baseRoutes());
    const { user } = await setup();
    await screen.findByRole("button", { name: "Pay $10.89" });

    await user.click(screen.getByRole("button", { name: "Pay $10.89" }));

    expect(screen.getByText("Enter the card number.")).toBeInTheDocument();
    expect(screen.getByText("Use the format MM/YY.")).toBeInTheDocument();
    expect(screen.getByText("Enter the 3 or 4 digit security code.")).toBeInTheDocument();
    expect(network.callsTo("/v1/tokens")).toHaveLength(0);
    expect(network.calls.filter((call) => call.method === "POST" && call.url.endsWith("/checkout"))).toHaveLength(0); // the quote on page load is fine; no charge
  });

  it("formats the card number and expiry as you type, and names the card brand", async () => {
    mockNetwork(baseRoutes());
    const { user } = await setup();

    await user.type(screen.getByLabelText(/Card number/), FULL_CARD);
    await user.type(screen.getByLabelText(/Expiry/), "1230");

    expect(screen.getByLabelText(/Card number/)).toHaveValue("4242 4242 4242 4242");
    expect(screen.getByLabelText(/Expiry/)).toHaveValue("12/30");
    expect(screen.getByText("Visa")).toBeInTheDocument();
  });

  it("PAYS: tokenizes at the GATEWAY with the publishable key, and sends the SHOP only the token, never the card number", async () => {
    const network = mockNetwork(baseRoutes());
    const { onPlaced, user } = await setup();
    await screen.findByRole("button", { name: "Pay $10.89" });

    await fillCard(user);
    await user.click(screen.getByRole("button", { name: "Pay $10.89" }));

    await waitFor(() => expect(onPlaced).toHaveBeenCalledWith(expect.objectContaining({ orderId: "order-1234-abcd" })));

    const [tokenCall] = network.callsTo("/v1/tokens");
    expect(tokenCall?.url).toBe(`${GATEWAY}/v1/tokens`);
    expect(tokenCall?.headers).toMatchObject({ Authorization: "Bearer pk_test_dummy" });
    expect(tokenCall?.body).toEqual({ method: "card", number: FULL_CARD, expMonth: 12, expYear: 2030, cvc: "123" });

    const [checkoutCall] = network.calls.filter((call) => call.method === "POST" && call.url.endsWith("/checkout"));
    expect(checkoutCall?.headers).toMatchObject({ Authorization: "Bearer bearer-1" });
    expect(checkoutCall?.body).toEqual({ cartId: "cart-1", storeId: "IL-01", paymentMethod: "card-mock", paymentToken: "tok_sim_abc" });

    // The shop backend saw no card data at all.
    const sentToShop = JSON.stringify(network.calls.filter((call) => !call.url.startsWith(GATEWAY)).map((call) => call.body));
    expect(sentToShop).not.toContain(FULL_CARD);
    expect(sentToShop).not.toContain("cvc");
  });

  it("shows a plain-language reason when the card is declined, and lets the shopper try again", async () => {
    mockNetwork(baseRoutes({ "POST /checkout": () => failure(402, { error: "PAYMENT_DECLINED", message: "Your payment was declined", declineCode: "insufficient_funds" }) }));
    const { onPlaced, user } = await setup();
    await screen.findByRole("button", { name: "Pay $10.89" });

    await fillCard(user, "4000000000009995");
    await user.click(screen.getByRole("button", { name: "Pay $10.89" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("enough funds");
    expect(onPlaced).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pay $10.89" })).toBeEnabled(); // can retry
    expect(screen.getByLabelText(/Card number/)).toHaveValue("4000 0000 0000 9995"); // entries are kept
  });

  it("does not place an order when the payment service can't be reached, and says nothing was charged", async () => {
    const network = mockNetwork(baseRoutes({ "POST /v1/tokens": () => Promise.reject(new TypeError("Failed to fetch")) }));
    const { onPlaced, user } = await setup();
    await screen.findByRole("button", { name: "Pay $10.89" });

    await fillCard(user);
    await user.click(screen.getByRole("button", { name: "Pay $10.89" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("haven't been charged");
    expect(onPlaced).not.toHaveBeenCalled();
    expect(network.calls.filter((call) => call.method === "POST" && call.url.endsWith("/checkout"))).toHaveLength(0);
  });

  it("reports a payment-gateway outage from the shop as 'not charged'", async () => {
    mockNetwork(baseRoutes({ "POST /checkout": () => failure(503, { error: "PAYMENT_GATEWAY_UNAVAILABLE", message: "The payment service is unavailable. You have not been charged; please try again." }) }));
    const { user } = await setup();
    await screen.findByRole("button", { name: "Pay $10.89" });

    await fillCard(user);
    await user.click(screen.getByRole("button", { name: "Pay $10.89" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("not been charged");
  });

  it("disables the button while the payment is processing", async () => {
    let finish: (response: Response) => void = () => {};
    mockNetwork(baseRoutes({ "POST /checkout": () => new Promise<Response>((resolve) => (finish = resolve)) }));
    const { user } = await setup();
    await screen.findByRole("button", { name: "Pay $10.89" });

    await fillCard(user);
    await user.click(screen.getByRole("button", { name: "Pay $10.89" }));

    expect(await screen.findByRole("button", { name: "Processing payment…" })).toBeDisabled();
    finish(envelope(order(), 201));
  });

  describe("3-D Secure", () => {
    const challengeRoutes = (confirm: () => Response) =>
      baseRoutes({
        "POST /checkout": () => envelope({ order: order({ status: "payment_pending", invoice: null, payment: { method: "card-mock", status: "requires_action", reference: "pay_sim_3ds", card: { brand: "visa", last4: "3220" } } }), paymentAction: { type: "3ds" } }, 202),
        "POST /orders/order-1234-abcd/payment/confirm": confirm,
      });

    it("asks the shopper to verify, then places the order once approved", async () => {
      const network = mockNetwork(challengeRoutes(() => envelope(order(), 201)));
      const { onPlaced, user } = await setup();
      await screen.findByRole("button", { name: "Pay $10.89" });

      await fillCard(user, "4000000000003220");
      await user.click(screen.getByRole("button", { name: "Pay $10.89" }));
      await user.click(await screen.findByRole("button", { name: "Approve payment" }));

      await waitFor(() => expect(onPlaced).toHaveBeenCalled());
      expect(network.callsTo("/payment/confirm")[0]?.body).toEqual({ approved: true });
    });

    it("reports a declined challenge and doesn't place the order", async () => {
      mockNetwork(challengeRoutes(() => failure(402, { error: "PAYMENT_DECLINED", message: "declined", declineCode: "card_declined" })));
      const { onPlaced, user } = await setup();
      await screen.findByRole("button", { name: "Pay $10.89" });

      await fillCard(user, "4000000000003220");
      await user.click(screen.getByRole("button", { name: "Pay $10.89" }));
      await user.click(await screen.findByRole("button", { name: "Decline" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("declined");
      expect(onPlaced).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("offers the gateway's test cards and fills the form from one", async () => {
    mockNetwork(baseRoutes());
    const { user } = await setup();

    await user.click(await screen.findByText("Demo: test card numbers"));
    await user.click(screen.getByRole("button", { name: "Use test card 4000 0000 0000 9995" }));

    expect(screen.getByLabelText(/Card number/)).toHaveValue("4000 0000 0000 9995");
    expect(screen.getByLabelText("Security code")).toHaveValue("123");
    expect((screen.getByLabelText(/Expiry/) as HTMLInputElement).value).toMatch(/^12\/\d{2}$/);
  });

  it("pay at pickup: no card form, no tokenization, and the button says 'Place order'", async () => {
    const network = mockNetwork(baseRoutes({ "POST /checkout": () => envelope(order({ payment: { method: "pay-at-pickup", status: "authorized", reference: "pickup_1", card: null } }), 201) }));
    const { onPlaced, user } = await setup();
    await screen.findByRole("button", { name: "Pay $10.89" });

    await user.click(screen.getByLabelText(/Pay at pickup/));
    expect(screen.queryByLabelText(/Card number/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Place order $10.89" }));

    await waitFor(() => expect(onPlaced).toHaveBeenCalled());
    expect(network.callsTo("/v1/tokens")).toHaveLength(0);
    const checkoutCall = network.calls.find((call) => call.method === "POST" && call.url.endsWith("/checkout"));
    expect(checkoutCall?.body).toEqual({ cartId: "cart-1", storeId: "IL-01", paymentMethod: "pay-at-pickup" });
  });

  it("shows an empty-cart page instead of a checkout form", () => {
    render(<CheckoutPage token="t" cart={{ ...cart, items: [], itemCount: 0, subtotalMinor: 0 }} config={config} storeId="IL-01" onSelectStore={vi.fn()} onPlaced={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Your cart is empty" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Card number/)).not.toBeInTheDocument();
  });

  it("shows a quote failure (e.g. a store problem) and keeps Pay disabled", async () => {
    mockNetwork(baseRoutes({ "POST /checkout/quote": () => failure(400, { error: "UNKNOWN_STORE", message: 'No store "X"' }) }));
    await setup();

    expect(await screen.findByRole("alert")).toHaveTextContent('No store "X"');
    expect(screen.getByRole("button", { name: "Calculating…" })).toBeDisabled();
  });
});
