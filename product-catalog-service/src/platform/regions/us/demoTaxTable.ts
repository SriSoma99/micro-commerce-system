import { addMoney, applyRateBps, money } from "../../money";
import { TaxProvider, TaxLineResult } from "../../types";

/**
 * ILLUSTRATIVE DEMO RATES - not tax advice, not current law. They exist so
 * the demo can show per-jurisdiction, per-category behaviour (groceries taxed
 * differently from candy and soft drinks). A production install swaps this
 * provider for an external tax service (Avalara, TaxJar, Stripe Tax...) that
 * implements the same `TaxProvider` interface.
 *
 * Rates are basis points (625 = 6.25%). To support another state, add a row.
 */
export const US_TAX_CODES = ["grocery", "prepared-food", "candy", "soft-drink", "alcohol", "general"] as const;

type UsTaxCode = (typeof US_TAX_CODES)[number];

const RATES_BPS: Record<string, Record<UsTaxCode, number>> = {
  IL: { grocery: 100, "prepared-food": 625, candy: 625, "soft-drink": 625, alcohol: 625, general: 625 },
  OH: { grocery: 0, "prepared-food": 575, candy: 575, "soft-drink": 575, alcohol: 575, general: 575 },
  PA: { grocery: 0, "prepared-food": 600, candy: 600, "soft-drink": 600, alcohol: 600, general: 600 },
};

export const US_JURISDICTIONS = [
  { id: "IL", displayName: "Illinois" },
  { id: "OH", displayName: "Ohio" },
  { id: "PA", displayName: "Pennsylvania" },
];

export const demoTaxTableProvider: TaxProvider = {
  id: "demo-table",
  displayName: "Demo tax table (illustrative rates)",

  async calculate({ jurisdiction, lines }) {
    const table = RATES_BPS[jurisdiction];
    if (!table) {
      throw new Error(`No demo tax rates for jurisdiction "${jurisdiction}"`);
    }

    const results: TaxLineResult[] = lines.map((line) => {
      const rateBps = table[line.taxCode as UsTaxCode];
      if (rateBps === undefined) {
        throw new Error(`Unknown tax code "${line.taxCode}" for ${jurisdiction}`);
      }
      return { lineId: line.lineId, rateBps, tax: applyRateBps(line.net, rateBps) };
    });

    const currency = lines[0]?.net.currency ?? "USD";
    const total = results.reduce((sum, line) => addMoney(sum, line.tax), money(0, currency));
    return { lines: results, total };
  },
};
