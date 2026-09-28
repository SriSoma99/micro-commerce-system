import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { product } from "../test/fixtures";
import { ProductCard } from "./ProductCard";

describe("ProductCard", () => {
  it("shows name, price, unit price, size, rating and the SNAP tag", () => {
    render(<ProductCard product={product()} onOpen={vi.fn()} onAdd={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Green Meadow Vanilla Greek Yogurt" })).toBeInTheDocument();
    expect(screen.getByText("$5.39")).toBeInTheDocument();
    expect(screen.getByText("34¢ / oz")).toBeInTheDocument();
    expect(screen.getByText("16 oz")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /4\.3 out of 5 stars, 312 reviews/ })).toBeInTheDocument();
    expect(screen.getByText("SNAP")).toBeInTheDocument();
    expect(screen.getByText("Store brand")).toBeInTheDocument();
  });

  it("marks weekly finds and hides the store-brand badge for national brands", () => {
    render(<ProductCard product={product({ isWeeklyFind: true, isPrivateLabel: false })} onOpen={vi.fn()} onAdd={vi.fn()} />);

    expect(screen.getByText("Weekly find")).toBeInTheDocument();
    expect(screen.queryByText("Store brand")).not.toBeInTheDocument();
  });

  it("prices loose produce per pound and adds one pound at a time", async () => {
    const onAdd = vi.fn();
    render(<ProductCard product={product({ name: "Bananas", priceMinor: 59, soldBy: "weight", sizeLabel: "per lb" })} onOpen={vi.fn()} onAdd={onAdd} />);

    expect(screen.getByText("$0.59")).toBeInTheDocument();
    expect(screen.getByText("/ lb")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add Bananas to cart" }));
    expect(screen.getByRole("button", { name: "Add Bananas to cart" })).toHaveTextContent("Add 1 lb");
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("opens the detail view from the image/name and adds from the button", async () => {
    const onOpen = vi.fn();
    const onAdd = vi.fn();
    const item = product();
    render(<ProductCard product={item} onOpen={onOpen} onAdd={onAdd} />);

    await userEvent.click(screen.getByRole("button", { name: `View details for ${item.name}` }));
    expect(onOpen).toHaveBeenCalledWith("p-00001");

    await userEvent.click(screen.getByRole("button", { name: `Add ${item.name} to cart` }));
    expect(onAdd).toHaveBeenCalledWith(item);
  });

  it("loads the product image from the API origin", () => {
    render(<ProductCard product={product()} onOpen={vi.fn()} onAdd={vi.fn()} />);

    const image = document.querySelector("img");
    expect(image?.getAttribute("src")).toMatch(/^https?:\/\/.+\/api\/products\/p-00001\/image\.svg$/);
  });
});
