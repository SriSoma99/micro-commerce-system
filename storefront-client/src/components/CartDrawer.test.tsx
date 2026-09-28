import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Cart } from "../types/cart";
import { CartDrawer } from "./CartDrawer";

const cart = (overrides: Partial<Cart> = {}): Cart => ({
  cartId: "c1",
  itemCount: 3,
  subtotalMinor: 1077,
  currency: "USD",
  updatedAt: "2026-01-01T00:00:00Z",
  items: [
    { lineItemId: "l1", productId: "p-1", name: "Green Meadow Vanilla Greek Yogurt", thumbnail: "/api/products/p-1/image.svg", priceMinor: 539, currency: "USD", quantity: 2, sizeLabel: "16 oz", soldBy: "each", taxCode: "grocery" },
    { lineItemId: "l2", productId: "p-2", name: "Green Acre Bananas", thumbnail: "/api/products/p-2/image.svg", priceMinor: 59, currency: "USD", quantity: 1, sizeLabel: "per lb", soldBy: "weight", taxCode: "grocery" },
  ],
  ...overrides,
});

const setup = (props: Partial<Parameters<typeof CartDrawer>[0]> = {}) => {
  const handlers = { onClose: vi.fn(), onUpdateQuantity: vi.fn(async () => null), onRemoveItem: vi.fn(async () => null), onCheckout: vi.fn() };
  render(<CartDrawer isOpen cart={cart()} error={null} {...handlers} {...props} />);
  return { ...handlers, user: userEvent.setup() };
};

describe("CartDrawer", () => {
  it("renders nothing when closed", () => {
    render(<CartDrawer isOpen={false} cart={cart()} error={null} onClose={vi.fn()} onUpdateQuantity={vi.fn()} onRemoveItem={vi.fn()} onCheckout={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists lines with exact line totals and the subtotal", () => {
    setup();

    expect(screen.getByText("Green Meadow Vanilla Greek Yogurt")).toBeInTheDocument();
    expect(screen.getByText("$10.78")).toBeInTheDocument(); // 2 x $5.39
    expect(screen.getByText("$0.59 / lb")).toBeInTheDocument();
    expect(screen.getByText("1 lb")).toBeInTheDocument(); // weight items count pounds
    expect(screen.getByText("$10.77")).toBeInTheDocument(); // the subtotal comes from the server, as-is
    expect(screen.getByText(/Sales tax is calculated for your pickup store/)).toBeInTheDocument();
  });

  it("changes quantity with the line's id", async () => {
    const { onUpdateQuantity, user } = setup();

    await user.click(screen.getByRole("button", { name: "Increase quantity of Green Meadow Vanilla Greek Yogurt" }));
    expect(onUpdateQuantity).toHaveBeenCalledWith("l1", 3);

    await user.click(screen.getByRole("button", { name: "Decrease quantity of Green Meadow Vanilla Greek Yogurt" }));
    expect(onUpdateQuantity).toHaveBeenCalledWith("l1", 1);
  });

  it("won't decrease below one (removing is a separate, explicit action)", () => {
    setup();
    expect(screen.getByRole("button", { name: "Decrease quantity of Green Acre Bananas" })).toBeDisabled();
  });

  it("removes a line", async () => {
    const { onRemoveItem, user } = setup();

    await user.click(screen.getByRole("button", { name: "Remove Green Acre Bananas" }));

    expect(onRemoveItem).toHaveBeenCalledWith("l2");
  });

  it("shows a stock or validation error inline", () => {
    setup({ error: "Only 3 unit(s) available" });
    expect(screen.getByRole("alert")).toHaveTextContent("Only 3 unit(s) available");
  });

  it("goes to checkout", async () => {
    const { onCheckout, user } = setup();

    await user.click(screen.getByRole("button", { name: "Checkout" }));

    expect(onCheckout).toHaveBeenCalledTimes(1);
  });

  it("has a friendly empty state with no checkout button", async () => {
    const { onClose, user } = setup({ cart: cart({ items: [], itemCount: 0, subtotalMinor: 0 }) });

    expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Checkout" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start shopping" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape and on the close button", async () => {
    const { onClose, user } = setup();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Close cart" }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
