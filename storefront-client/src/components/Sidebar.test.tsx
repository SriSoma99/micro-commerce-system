import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EMPTY_FILTERS } from "../api/catalogQuery";
import { facets } from "../test/fixtures";
import { Sidebar } from "./Sidebar";

const setup = (props: Partial<Parameters<typeof Sidebar>[0]> = {}) => {
  const onChange = vi.fn();
  const onClear = vi.fn();
  render(<Sidebar filters={EMPTY_FILTERS} facets={facets()} onChange={onChange} onClear={onClear} canClear={false} {...props} />);
  return { onChange, onClear, user: userEvent.setup() };
};

describe("Sidebar", () => {
  it("lists departments, brands, dietary tags, ratings and prices with their counts", () => {
    setup();

    expect(screen.getByRole("button", { name: /Dairy & Eggs/ })).toHaveTextContent("142");
    expect(screen.getByLabelText(/Green Meadow/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Vegan/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Under \$2/ })).toHaveTextContent("152");
    expect(screen.getByLabelText(/SNAP \/ EBT eligible/)).toBeInTheDocument();
  });

  it("selects a department, and clears back to all departments", async () => {
    const { onChange, user } = setup();

    await user.click(screen.getByRole("button", { name: /Frozen/ }));
    expect(onChange).toHaveBeenCalledWith({ category: "frozen" });

    await user.click(screen.getByRole("button", { name: "All departments" }));
    expect(onChange).toHaveBeenCalledWith({ category: null });
  });

  it("shows the subcategories of the chosen department and toggles one", async () => {
    const { onChange, user } = setup({
      filters: { ...EMPTY_FILTERS, category: "dairy-eggs" },
      facets: facets({ subcategories: [{ id: "milk", name: "Milk", count: 12 }, { id: "yogurt", name: "Yogurt", count: 39 }] }),
    });

    await user.click(screen.getByRole("button", { name: /Yogurt/ }));
    expect(onChange).toHaveBeenCalledWith({ subcategory: "yogurt" });
  });

  it("toggles a brand on and off (multi-select)", async () => {
    const { onChange, user } = setup({ filters: { ...EMPTY_FILTERS, brands: ["Pure Sip"] } });

    await user.click(screen.getByLabelText(/Green Meadow/));
    expect(onChange).toHaveBeenCalledWith({ brands: ["Pure Sip", "Green Meadow"] });

    await user.click(screen.getByLabelText(/Pure Sip/));
    expect(onChange).toHaveBeenCalledWith({ brands: [] });
  });

  it("toggles dietary tags and the availability checkboxes", async () => {
    const { onChange, user } = setup();

    await user.click(screen.getByLabelText(/Vegan/));
    expect(onChange).toHaveBeenCalledWith({ dietary: ["vegan"] });
    await user.click(screen.getByLabelText(/In stock/));
    expect(onChange).toHaveBeenCalledWith({ inStock: true });
    await user.click(screen.getByLabelText(/This week's finds/));
    expect(onChange).toHaveBeenCalledWith({ weeklyFinds: true });
  });

  it("picks a price range, and un-picks it when clicked again", async () => {
    const first = setup();
    await first.user.click(screen.getByRole("button", { name: /\$2 – \$5/ }));
    expect(first.onChange).toHaveBeenCalledWith({ minPrice: 200, maxPrice: 499 });

    const second = setup({ filters: { ...EMPTY_FILTERS, minPrice: 200, maxPrice: 499 } });
    const active = screen.getAllByRole("button", { name: /\$2 – \$5/ }).at(-1) as HTMLElement;
    expect(active).toHaveClass("is-active");
    await second.user.click(active);
    expect(second.onChange).toHaveBeenCalledWith({ minPrice: null, maxPrice: null });
  });

  it("picks a minimum rating", async () => {
    const { onChange, user } = setup();

    const reviews = screen.getByRole("group", { name: "Customer reviews" });
    await user.click(within(reviews).getAllByRole("button")[0] as HTMLElement);

    expect(onChange).toHaveBeenCalledWith({ minRating: 4 });
  });

  it("offers Clear all only when something is selected", async () => {
    const off = setup();
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
    off.onClear.mockClear();

    const on = setup({ canClear: true });
    await on.user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(on.onClear).toHaveBeenCalled();
  });

  it("explains itself, instead of showing stale counts, when there are no facets (fallback mode)", () => {
    setup({ facets: null });

    expect(screen.getByText(/Filters are unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Department" })).not.toBeInTheDocument();
  });
});
