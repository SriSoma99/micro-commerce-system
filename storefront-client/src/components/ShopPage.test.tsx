import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { catalogState, listPage, product } from "../test/fixtures";
import type { Department } from "../types/product";
import { ShopPage } from "./ShopPage";

const departments: Department[] = [
  { id: "dairy-eggs", name: "Dairy & Eggs", emoji: "🥛", colors: ["#e8f1fb", "#b9d3f2"], count: 142, subcategories: [] },
  { id: "frozen", name: "Frozen", emoji: "🧊", colors: ["#e0f3fa", "#a6d9ee"], count: 125, subcategories: [] },
];

const setup = (catalog = catalogState(), weeklyFinds = [product({ id: "p-9", name: "Weekly Special Butter", isWeeklyFind: true })]) => {
  const handlers = { onFiltersChange: vi.fn(), onClear: vi.fn(), onOpenProduct: vi.fn(), onAddProduct: vi.fn() };
  render(<ShopPage catalog={catalog} departments={departments} weeklyFinds={weeklyFinds} {...handlers} />);
  return { ...handlers, user: userEvent.setup() };
};

describe("ShopPage", () => {
  it("shows the landing (department tiles + weekly finds) before anything is chosen", async () => {
    const { onFiltersChange, user } = setup();

    expect(screen.getByRole("heading", { name: "Shop by category" })).toBeInTheDocument();
    expect(screen.getByText("Weekly Special Butter")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "All products" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Frozen\s*125\s*items/ })); // the tile (the sidebar also has a Frozen link)
    expect(onFiltersChange).toHaveBeenCalledWith({ category: "frozen" });
  });

  it("drops the landing and titles the results by the search once a search is active", () => {
    setup(catalogState({ filters: { q: "milk", sort: "relevance" }, page: listPage([product()], { total: 12 }) }));

    expect(screen.queryByRole("heading", { name: "Shop by category" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Results for “milk”" })).toBeInTheDocument();
    expect(screen.getByText("12 products")).toBeInTheDocument();
  });

  it("titles the results by the department, with removable filter chips", async () => {
    const { onFiltersChange, user } = setup(catalogState({ filters: { category: "dairy-eggs", inStock: true } }));

    expect(screen.getByRole("heading", { name: "Dairy & Eggs" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove filter In stock" }));
    expect(onFiltersChange).toHaveBeenCalledWith({ inStock: false });
  });

  it("offers 'Best match' sorting only while searching", () => {
    setup(catalogState({ filters: { q: "milk", sort: "relevance" } }));
    expect(screen.getByRole("option", { name: "Best match" })).toBeInTheDocument();
  });

  it("has no 'Best match' option without a search, and changing sort is reported", async () => {
    const { onFiltersChange, user } = setup();

    expect(screen.queryByRole("option", { name: "Best match" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Sort by"), "price-asc");
    expect(onFiltersChange).toHaveBeenCalledWith({ sort: "price-asc" });
  });

  it("opens a product and adds one to the cart from the grid", async () => {
    const { onOpenProduct, onAddProduct, user } = setup(catalogState({ filters: { category: "dairy-eggs" } }));

    await user.click(screen.getByRole("button", { name: "View details for Green Meadow Vanilla Greek Yogurt" }));
    expect(onOpenProduct).toHaveBeenCalledWith("p-00001");
    await user.click(screen.getByRole("button", { name: "Add Green Meadow Vanilla Greek Yogurt to cart" }));
    expect(onAddProduct).toHaveBeenCalled();
  });

  it("paginates: going to page 2 asks for page 2", async () => {
    const items = Array.from({ length: 24 }, (_, i) => product({ id: `p-${i}`, name: `Item ${i}` }));
    const { onFiltersChange, user } = setup(catalogState({ page: listPage(items, { total: 100 }) }));

    await user.click(screen.getByRole("button", { name: "Page 2" }));
    expect(onFiltersChange).toHaveBeenCalledWith({ page: 2 });
  });

  it("explains an empty result and offers to clear the filters", async () => {
    const { onClear, user } = setup(catalogState({ filters: { q: "zzzz", sort: "relevance" }, page: listPage([]) }));

    expect(screen.getByText("No products match")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("warns, and hides facet counts, while the circuit breaker serves the saved copy", () => {
    setup(catalogState({ isFallback: true, page: listPage([product()], { facets: null }) }));

    expect(screen.getByText(/saved copy/)).toBeInTheDocument();
    expect(screen.getByText(/Filters are unavailable/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Green Meadow Vanilla Greek Yogurt to cart" })).toBeInTheDocument(); // still shoppable
  });

  it("shows a retry when the very first load fails", async () => {
    const refetch = vi.fn();
    const { user } = setup(catalogState({ page: null, error: { ok: false, status: 0, code: "NETWORK_ERROR", message: "Cannot reach the shop service." }, refetch }));

    expect(screen.getByText("We couldn't load the products.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });
});
