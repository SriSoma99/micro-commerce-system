/** Card-form helpers. The gateway is the real judge of a card; these only keep the form tidy and catch typos early. */

export const digitsOnly = (value: string): string => value.replace(/\D/g, "");

/** "4242424242424242" -> "4242 4242 4242 4242" (Amex-style 4-6-5 for 15 digits). */
export function formatCardNumber(input: string): string {
  const digits = digitsOnly(input).slice(0, 19);
  if (/^3[47]/.test(digits)) {
    return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter(Boolean).join(" ");
  }
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

/** Types "1228" or "12/28" -> "12/28": inserts the slash and stops at MM/YY. */
export function formatExpiry(input: string): string {
  const digits = digitsOnly(input).slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** "12/28" -> { month: 12, year: 2028 }; null when it isn't a real month/year. */
export function parseExpiry(text: string): { month: number; year: number } | null {
  const match = /^(\d{2})\/(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const month = Number(match[1]);
  if (month < 1 || month > 12) return null;
  return { month, year: 2000 + Number(match[2]) };
}

export function brandOf(number: string): "visa" | "mastercard" | "amex" | "ebt" | "card" {
  const digits = digitsOnly(number);
  if (/^4/.test(digits)) return "visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]|7[01]|720))/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^6000/.test(digits)) return "ebt";
  return "card";
}

export interface CardFields {
  number: string;
  expiry: string;
  cvc: string;
}

export type CardErrors = Partial<Record<keyof CardFields, string>>;

/** Whether an MM/YY is already past (valid through the last day of its month). */
export function isExpired(expiry: { month: number; year: number }, now = new Date()): boolean {
  return expiry.year < now.getFullYear() || (expiry.year === now.getFullYear() && expiry.month < now.getMonth() + 1);
}

/** Sanity checks only - length, format, not-expired. Whether the card is good is the gateway's call. */
export function validateCard(fields: CardFields, now = new Date()): CardErrors {
  const errors: CardErrors = {};
  const digits = digitsOnly(fields.number);
  if (digits.length < 13 || digits.length > 19) errors.number = "Enter the card number.";

  const expiry = parseExpiry(fields.expiry);
  if (!expiry) errors.expiry = "Use the format MM/YY.";
  else if (isExpired(expiry, now)) errors.expiry = "This card has expired.";

  if (!/^\d{3,4}$/.test(fields.cvc)) errors.cvc = "Enter the 3 or 4 digit security code.";
  return errors;
}
