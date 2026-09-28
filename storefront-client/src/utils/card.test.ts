import { describe, expect, it } from "vitest";
import { brandOf, formatCardNumber, formatExpiry, isExpired, parseExpiry, validateCard } from "./card";

describe("formatCardNumber", () => {
  it("groups digits in fours and ignores non-digits", () => {
    expect(formatCardNumber("4242424242424242")).toBe("4242 4242 4242 4242");
    expect(formatCardNumber("4242-4242 4242.4242")).toBe("4242 4242 4242 4242");
    expect(formatCardNumber("42424")).toBe("4242 4");
  });

  it("uses the 4-6-5 grouping for American Express", () => {
    expect(formatCardNumber("378282246310005")).toBe("3782 822463 10005");
  });

  it("caps the length", () => {
    expect(formatCardNumber("1".repeat(30)).replace(/ /g, "")).toHaveLength(19);
  });
});

describe("formatExpiry / parseExpiry", () => {
  it("inserts the slash as you type", () => {
    expect(formatExpiry("1")).toBe("1");
    expect(formatExpiry("12")).toBe("12");
    expect(formatExpiry("122")).toBe("12/2");
    expect(formatExpiry("1228")).toBe("12/28");
    expect(formatExpiry("12/28")).toBe("12/28");
    expect(formatExpiry("122899")).toBe("12/28");
  });

  it("parses MM/YY into a month and a four-digit year", () => {
    expect(parseExpiry("12/28")).toEqual({ month: 12, year: 2028 });
    expect(parseExpiry("01/30")).toEqual({ month: 1, year: 2030 });
  });

  it("rejects impossible or malformed values", () => {
    expect(parseExpiry("13/28")).toBeNull();
    expect(parseExpiry("00/28")).toBeNull();
    expect(parseExpiry("1/28")).toBeNull();
    expect(parseExpiry("12/2028")).toBeNull();
    expect(parseExpiry("")).toBeNull();
  });
});

describe("isExpired", () => {
  const now = new Date("2026-09-19T12:00:00Z");

  it("treats the current month as still valid", () => {
    expect(isExpired({ month: 9, year: 2026 }, now)).toBe(false);
  });

  it("expires past months and years", () => {
    expect(isExpired({ month: 8, year: 2026 }, now)).toBe(true);
    expect(isExpired({ month: 12, year: 2025 }, now)).toBe(true);
    expect(isExpired({ month: 1, year: 2027 }, now)).toBe(false);
  });
});

describe("brandOf", () => {
  it("recognises the common brands", () => {
    expect(brandOf("4242 4242 4242 4242")).toBe("visa");
    expect(brandOf("5555 5555 5555 4444")).toBe("mastercard");
    expect(brandOf("3782 822463 10005")).toBe("amex");
    expect(brandOf("6000 0000 0000 0001")).toBe("ebt");
    expect(brandOf("9999")).toBe("card");
  });
});

describe("validateCard", () => {
  const now = new Date("2026-09-19T12:00:00Z");
  const good = { number: "4242 4242 4242 4242", expiry: "12/28", cvc: "123" };

  it("accepts a well-formed card", () => {
    expect(validateCard(good, now)).toEqual({});
  });

  it("reports each problem on its own field", () => {
    expect(validateCard({ number: "4242", expiry: "1", cvc: "1" }, now)).toEqual({
      number: "Enter the card number.",
      expiry: "Use the format MM/YY.",
      cvc: "Enter the 3 or 4 digit security code.",
    });
  });

  it("rejects an expired card", () => {
    expect(validateCard({ ...good, expiry: "01/20" }, now).expiry).toBe("This card has expired.");
  });

  it("accepts a 4 digit code (Amex)", () => {
    expect(validateCard({ ...good, cvc: "1234" }, now)).toEqual({});
  });
});
