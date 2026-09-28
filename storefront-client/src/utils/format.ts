import { API_ORIGIN } from "../config";

/** Integer cents -> "$4.99". */
export function formatMoney(minor: number, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
}

/** "12.5¢ / oz" style unit price for groceries (display only, so fractional cents are fine). */
export function formatUnitPrice(unit: { minorPerUnit: number; unit: string }, currency = "USD"): string {
  const perUnit = unit.minorPerUnit;
  const label = unit.unit === "each" ? "each" : unit.unit;
  if (perUnit >= 100) return `${formatMoney(Math.round(perUnit), currency)} / ${label}`;
  const cents = perUnit < 10 ? perUnit.toFixed(1) : Math.round(perUnit).toString();
  return `${cents}¢ / ${label}`;
}

/** Products and their images are served by the API; thumbnails come back as paths. */
export function assetUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${API_ORIGIN}${path}`;
}

export function formatDateTime(iso: string, locale = "en-US"): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export function titleCase(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
