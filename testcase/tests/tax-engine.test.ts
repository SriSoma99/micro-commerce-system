/**
 * The money/tax engine has no HTTP surface yet (checkout will consume it), so
 * this suite requires the compiled modules directly - the same dist/-only
 * approach as support/testApp.ts, still no dependency on the TypeScript source.
 */
/* eslint-disable @typescript-eslint/no-var-requires */
const { applyRateBps, addMoney, money, formatMoney } = require("../../product-catalog-service/dist/platform/money") as {
  applyRateBps: (a: Money, bps: number) => Money;
  addMoney: (a: Money, b: Money) => Money;
  money: (amountMinor: number, currency: string) => Money;
  formatMoney: (a: Money, locale: string) => string;
};
const { demoTaxTableProvider } = require("../../product-catalog-service/dist/platform/regions/us/demoTaxTable") as {
  demoTaxTableProvider: {
    calculate: (input: {
      jurisdiction: string;
      lines: { lineId: string; net: Money; taxCode: string }[];
    }) => Promise<{ lines: { lineId: string; rateBps: number; tax: Money }[]; total: Money }>;
  };
};

interface Money {
  amountMinor: number;
  currency: string;
}

describe("Money helpers", () => {
  // TC-070
  it("rejects non-integer minor units", () => {
    expect(() => money(19.99, "USD")).toThrow();
    expect(money(1999, "USD")).toEqual({ amountMinor: 1999, currency: "USD" });
  });

  // TC-071
  it("applies basis-point rates with integer math, rounding half up", () => {
    // 6.25% of $3.00 = 18.75c -> 19c ; 6.00% of $1.25 = 7.5c -> 8c
    expect(applyRateBps(money(300, "USD"), 625).amountMinor).toBe(19);
    expect(applyRateBps(money(125, "USD"), 600).amountMinor).toBe(8);
    // 0% and tiny amounts never produce fractional cents
    expect(applyRateBps(money(999, "USD"), 0).amountMinor).toBe(0);
    expect(applyRateBps(money(1, "USD"), 625).amountMinor).toBe(0);
  });

  // TC-072
  it("refuses to add different currencies", () => {
    expect(() => addMoney(money(100, "USD"), money(100, "EUR"))).toThrow(/mismatch/i);
  });

  // TC-073
  it("formats USD for en-US", () => {
    expect(formatMoney(money(123456, "USD"), "en-US")).toBe("$1,234.56");
  });
});

describe("US demo tax table", () => {
  const lines = [
    { lineId: "milk", net: money(499, "USD"), taxCode: "grocery" },
    { lineId: "candy", net: money(299, "USD"), taxCode: "candy" },
  ];

  // TC-074
  it("taxes groceries and candy differently within the same jurisdiction", async () => {
    const oh = await demoTaxTableProvider.calculate({ jurisdiction: "OH", lines });
    expect(oh.lines.find((l) => l.lineId === "milk")?.tax.amountMinor).toBe(0);
    expect(oh.lines.find((l) => l.lineId === "candy")?.rateBps).toBe(575);

    const il = await demoTaxTableProvider.calculate({ jurisdiction: "IL", lines });
    expect(il.lines.find((l) => l.lineId === "milk")?.rateBps).toBe(100);
  });

  // TC-075
  it("total tax equals the sum of the per-line taxes", async () => {
    const result = await demoTaxTableProvider.calculate({ jurisdiction: "PA", lines });
    const sum = result.lines.reduce((acc, l) => acc + l.tax.amountMinor, 0);
    expect(result.total).toEqual({ amountMinor: sum, currency: "USD" });
  });

  // TC-076
  it("rejects an unknown jurisdiction or tax code", async () => {
    await expect(demoTaxTableProvider.calculate({ jurisdiction: "ZZ", lines })).rejects.toThrow(/jurisdiction/);
    await expect(
      demoTaxTableProvider.calculate({
        jurisdiction: "IL",
        lines: [{ lineId: "x", net: money(100, "USD"), taxCode: "made-up" }],
      })
    ).rejects.toThrow(/tax code/);
  });
});
