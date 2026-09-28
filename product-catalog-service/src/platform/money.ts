import { Money } from "./types";

export function money(amountMinor: number, currency: string): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`Money must be integer minor units, got ${amountMinor}`);
  }
  return { amountMinor, currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

/**
 * Applies a basis-point rate (625 = 6.25%) using integer math, rounding half
 * away from zero to the nearest minor unit. Avoids the float drift that
 * `price * 0.0625` would introduce.
 */
export function applyRateBps(amount: Money, rateBps: number): Money {
  const scaled = amount.amountMinor * rateBps;
  const rounded = Math.sign(scaled) * Math.floor((Math.abs(scaled) + 5000) / 10000);
  return { amountMinor: rounded, currency: amount.currency };
}

export function formatMoney(amount: Money, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: amount.currency }).format(
    amount.amountMinor / 100
  );
}
