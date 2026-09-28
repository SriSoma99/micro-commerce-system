import { describe, expect, it } from "vitest";
import { assetUrl, formatMoney, formatUnitPrice, titleCase } from "./format";

describe("formatMoney", () => {
  it("formats integer cents as dollars", () => {
    expect(formatMoney(499)).toBe("$4.99");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(123456)).toBe("$1,234.56");
  });

  it("has no floating point drift on awkward amounts", () => {
    expect(formatMoney(1)).toBe("$0.01");
    expect(formatMoney(29)).toBe("$0.29");
    expect(formatMoney(1999)).toBe("$19.99");
  });
});

describe("formatUnitPrice", () => {
  it("shows cents per unit for small per-unit prices", () => {
    expect(formatUnitPrice({ minorPerUnit: 14.1, unit: "oz" })).toBe("14¢ / oz");
    expect(formatUnitPrice({ minorPerUnit: 2.5, unit: "oz" })).toBe("2.5¢ / oz");
  });

  it("switches to dollars once a unit costs a dollar or more", () => {
    expect(formatUnitPrice({ minorPerUnit: 358.67, unit: "oz" })).toBe("$3.59 / oz");
    expect(formatUnitPrice({ minorPerUnit: 125.8, unit: "lb" })).toBe("$1.26 / lb");
  });
});

describe("assetUrl", () => {
  it("prefixes API-relative paths with the API origin", () => {
    expect(assetUrl("/api/products/p-1/image.svg")).toMatch(/^https?:\/\/[^/]+\/api\/products\/p-1\/image\.svg$/);
  });

  it("leaves absolute URLs alone", () => {
    expect(assetUrl("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
  });
});

describe("titleCase", () => {
  it("turns slugs into readable labels", () => {
    expect(titleCase("gluten-free")).toBe("Gluten Free");
    expect(titleCase("vegan")).toBe("Vegan");
  });
});
