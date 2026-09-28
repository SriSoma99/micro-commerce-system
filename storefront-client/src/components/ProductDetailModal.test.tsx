import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { detail } from "../test/fixtures";
import type { ProductDetail } from "../types/product";
import { ProductDetailModal, type ProductDetailModalProps } from "./ProductDetailModal";

const respond = (product: ProductDetail, isFallback = false) =>
  new Response(JSON.stringify({ data: product, isFallback, source: isFallback ? "circuit-breaker-fallback" : "live-core", retrievedAt: "2026-01-01T00:00:00Z" }), { status: 200 });

afterEach(() => vi.restoreAllMocks());

const setup = async (product = detail(), options: { fallback?: boolean; onAdd?: ProductDetailModalProps["onAdd"] } = {}) => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(respond(product, options.fallback));
  const props = { onClose: vi.fn(), onStatusChange: vi.fn(), onAdd: options.onAdd ?? vi.fn(async () => null), onAdded: vi.fn() };
  render(<ProductDetailModal productId={product.id} {...props} />);
  await screen.findByRole("heading", { name: product.name });
  return { ...props, user: userEvent.setup() };
};

describe("ProductDetailModal", () => {
  it("loads and shows the detail, and reports the live status upward", async () => {
    const { onStatusChange } = await setup();

    expect(screen.getByText("Creamy Greek yogurt.")).toBeInTheDocument();
    expect(screen.getByText("Keep refrigerated")).toBeInTheDocument();
    expect(screen.getByText("In stock")).toBeInTheDocument();
    expect(onStatusChange).toHaveBeenCalledWith({ source: "live-core", retrievedAt: "2026-01-01T00:00:00Z" });
  });

  it("adds the chosen quantity and closes", async () => {
    const onAdd = vi.fn(async () => null);
    const { user, onClose, onAdded } = await setup(detail(), { onAdd });

    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    await user.click(screen.getByRole("button", { name: /Add to cart · \$16\.17/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onAdd).toHaveBeenCalledWith("p-00001", 3, undefined);
    expect(onAdded).toHaveBeenCalledWith("Green Meadow Vanilla Greek Yogurt");
  });

  it("sends the chosen configuration option", async () => {
    const onAdd = vi.fn(async () => null);
    const withOption = detail({ name: "HomeStar Trash Bags", configurationOptions: [{ name: "Scent", choices: ["Unscented", "Lemon Fresh"], defaultChoice: "Unscented" }] });
    const { user } = await setup(withOption, { onAdd });

    await user.selectOptions(screen.getByLabelText("Scent"), "Lemon Fresh");
    await user.click(screen.getByRole("button", { name: /Add to cart/ }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith("p-00001", 1, { Scent: "Lemon Fresh" }));
  });

  it("shows the server's message and stays open when the add is refused", async () => {
    const onAdd = vi.fn(async () => "Only 3 unit(s) available");
    const { user, onClose } = await setup(detail(), { onAdd });

    await user.click(screen.getByRole("button", { name: /Add to cart/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Only 3 unit(s) available");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("can't add an out-of-stock product; warns when stock is low", async () => {
    await setup(detail({ stock: 0 }));
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to cart/ })).toBeDisabled();
  });

  it("shows how many are left when stock is low, and caps the quantity at stock", async () => {
    const { user } = await setup(detail({ stock: 2 }));
    expect(screen.getByText("Only 2 left")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
  });

  it("warns that the information is saved data when the circuit breaker is serving the fallback", async () => {
    await setup(detail(), { fallback: true });
    expect(screen.getByText(/saved product information/)).toBeInTheDocument();
  });

  it("sells loose produce by the pound", async () => {
    await setup(detail({ name: "Bananas", soldBy: "weight", priceMinor: 59, sizeLabel: "per lb" }));
    expect(screen.getByRole("group", { name: "Pounds" })).toBeInTheDocument();
    expect(screen.getByText("/ lb")).toBeInTheDocument();
  });

  it("closes on Escape and on the close button", async () => {
    const { user, onClose } = await setup();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("says so when the product no longer exists", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "NOT_FOUND", message: "No product" }), { status: 404 }));
    render(<ProductDetailModal productId="gone" onClose={vi.fn()} onStatusChange={vi.fn()} onAdd={vi.fn()} onAdded={vi.fn()} />);

    expect(await screen.findByText("This product is no longer available.")).toBeInTheDocument();
  });
});
