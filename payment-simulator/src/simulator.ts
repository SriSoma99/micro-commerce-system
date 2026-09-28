import { randomUUID } from "node:crypto";

/**
 * The gateway's brain: deterministic, driven by documented test card numbers
 * (like Stripe's sandbox). A card number is only ever seen by `createToken`;
 * everything after that works on the token, and only brand + last 4 are kept.
 */

export type DeclineCode =
  | "card_declined"
  | "insufficient_funds"
  | "expired_card"
  | "incorrect_cvc"
  | "invalid_number"
  | "processing_error";

export type PaymentStatus = "authorized" | "requires_action" | "captured" | "refunded" | "declined";
export type TokenMethod = "card" | "ebt";

export interface CardInput {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
}

type Outcome = { status: "authorized" | "requires_action" } | { status: "declined"; declineCode: DeclineCode };

export interface PaymentView {
  id: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  orderRef: string;
  capturedMinor: number;
  refundedMinor: number;
  declineCode?: DeclineCode;
  actionType?: "3ds";
  card?: { brand: string; last4: string };
}

export class SimulatorError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export interface TestCard {
  number: string;
  outcome: string;
}

export const CARD_TEST_CARDS: TestCard[] = [
  { number: "4242 4242 4242 4242", outcome: "Approved (Visa)" },
  { number: "5555 5555 5555 4444", outcome: "Approved (Mastercard)" },
  { number: "4000 0000 0000 0002", outcome: "Declined: card_declined" },
  { number: "4000 0000 0000 9995", outcome: "Declined: insufficient_funds" },
  { number: "4000 0000 0000 0069", outcome: "Declined: expired_card" },
  { number: "4000 0000 0000 0127", outcome: "Declined: incorrect_cvc" },
  { number: "4000 0000 0000 0119", outcome: "Declined: processing_error" },
  { number: "4000 0000 0000 3220", outcome: "Requires a 3-D Secure challenge" },
];

export const EBT_TEST_CARDS: TestCard[] = [
  { number: "6000 0000 0000 0001", outcome: "Approved (SNAP/EBT)" },
  { number: "6000 0000 0000 0002", outcome: "Declined: insufficient_funds" },
];

const CARD_SCENARIOS: Record<string, Outcome> = {
  "4000000000000002": { status: "declined", declineCode: "card_declined" },
  "4000000000009995": { status: "declined", declineCode: "insufficient_funds" },
  "4000000000000069": { status: "declined", declineCode: "expired_card" },
  "4000000000000127": { status: "declined", declineCode: "incorrect_cvc" },
  "4000000000000119": { status: "declined", declineCode: "processing_error" },
  "4000000000003220": { status: "requires_action" },
};

// ---- Card evaluation --------------------------------------------------------------

const digitsOnly = (value: string): string => value.replace(/[\s-]/g, "");

function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function brandOf(digits: string): string {
  if (/^4/.test(digits)) return "visa";
  if (/^(5[1-5]|2(2[2-9][1-9]|[3-6]|7[01]|720))/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^6000/.test(digits)) return "ebt";
  return "card";
}

function isExpired(expMonth: number, expYear: number, now: Date): boolean {
  const year = expYear < 100 ? 2000 + expYear : expYear;
  // Valid through the last day of the expiry month.
  return year < now.getFullYear() || (year === now.getFullYear() && expMonth < now.getMonth() + 1);
}

const decline = (declineCode: DeclineCode): Outcome => ({ status: "declined", declineCode });

function evaluate(method: TokenMethod, card: CardInput, now: Date): { outcome: Outcome; brand: string; last4: string } {
  const digits = digitsOnly(card.number);
  const last4 = digits.slice(-4);

  if (method === "ebt") {
    if (!/^6000\d{12}$/.test(digits)) return { outcome: decline("invalid_number"), brand: "ebt", last4 };
    return { outcome: digits === "6000000000000002" ? decline("insufficient_funds") : { status: "authorized" }, brand: "ebt", last4 };
  }

  const brand = brandOf(digits);
  if (!/^\d{13,19}$/.test(digits) || !passesLuhn(digits)) return { outcome: decline("invalid_number"), brand, last4 };
  if (isExpired(card.expMonth, card.expYear, now)) return { outcome: decline("expired_card"), brand, last4 };
  if (!/^\d{3,4}$/.test(card.cvc)) return { outcome: decline("incorrect_cvc"), brand, last4 };
  return { outcome: CARD_SCENARIOS[digits] ?? { status: "authorized" }, brand, last4 };
}

// ---- State ------------------------------------------------------------------------

interface TokenRecord {
  method: TokenMethod;
  outcome: Outcome;
  brand: string;
  last4: string;
  used: boolean;
  expiresAt: number;
}

interface PaymentRecord extends PaymentView {}

const TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 10_000;

/** Map capped at MAX_ENTRIES, evicting the oldest - a long-running demo never grows without bound. */
function capped<V>(): Map<string, V> {
  const map = new Map<string, V>();
  const set = map.set.bind(map);
  map.set = (key, value) => {
    set(key, value);
    if (map.size > MAX_ENTRIES) map.delete(map.keys().next().value as string);
    return map;
  };
  return map;
}

export function createSimulator() {
  const tokens = capped<TokenRecord>();
  const payments = capped<PaymentRecord>();

  const loadPayment = (id: string): PaymentRecord => {
    const record = payments.get(id);
    if (!record) throw new SimulatorError(404, "payment_not_found", `No payment "${id}"`);
    return record;
  };

  const wrongState = (record: PaymentRecord, doing: string): SimulatorError =>
    new SimulatorError(409, "invalid_state", `Cannot ${doing} a payment that is ${record.status}`);

  return {
    /** The only place a card number is seen. Returns brand + last4 and a one-time token. */
    createToken(method: TokenMethod, card: CardInput, now = new Date()) {
      const { outcome, brand, last4 } = evaluate(method, card, now);
      const token = `tok_sim_${randomUUID().replace(/-/g, "")}`;
      tokens.set(token, { method, outcome, brand, last4, used: false, expiresAt: now.getTime() + TOKEN_TTL_MS });
      return { token, method, brand, last4 };
    },

    authorize(input: { token: string; amountMinor: number; currency: string; orderRef: string }, now = new Date()): PaymentView {
      const record = tokens.get(input.token);
      if (!record) throw new SimulatorError(400, "invalid_token", "Unknown payment token");
      if (record.used) throw new SimulatorError(400, "token_already_used", "This token has already been used");
      if (record.expiresAt < now.getTime()) throw new SimulatorError(400, "token_expired", "This token has expired");
      record.used = true;

      const payment: PaymentRecord = {
        id: `pay_sim_${randomUUID().replace(/-/g, "")}`,
        status: record.outcome.status,
        amountMinor: input.amountMinor,
        currency: input.currency,
        orderRef: input.orderRef,
        capturedMinor: 0,
        refundedMinor: 0,
        card: { brand: record.brand, last4: record.last4 },
        ...(record.outcome.status === "declined" ? { declineCode: record.outcome.declineCode } : {}),
        ...(record.outcome.status === "requires_action" ? { actionType: "3ds" as const } : {}),
      };
      payments.set(payment.id, payment);
      return { ...payment };
    },

    get: (id: string): PaymentView => ({ ...loadPayment(id) }),

    confirmAction(id: string, approved: boolean): PaymentView {
      const payment = loadPayment(id);
      if (payment.status !== "requires_action") throw wrongState(payment, "confirm");
      payment.status = approved ? "authorized" : "declined";
      delete payment.actionType;
      if (!approved) payment.declineCode = "card_declined";
      return { ...payment };
    },

    capture(id: string): PaymentView {
      const payment = loadPayment(id);
      if (payment.status === "captured") return { ...payment }; // idempotent
      if (payment.status !== "authorized") throw wrongState(payment, "capture");
      payment.status = "captured";
      payment.capturedMinor = payment.amountMinor;
      return { ...payment };
    },

    /** Any successful refund returns `refunded`; the payment only becomes `refunded` once fully refunded. */
    refund(id: string, amountMinor: number): PaymentView {
      const payment = loadPayment(id);
      if (payment.status !== "captured" && payment.status !== "refunded") throw wrongState(payment, "refund");
      if (payment.refundedMinor + amountMinor > payment.capturedMinor) {
        throw new SimulatorError(
          409,
          "amount_exceeds_captured",
          `Refund of ${amountMinor} exceeds the ${payment.capturedMinor - payment.refundedMinor} still refundable`
        );
      }
      payment.refundedMinor += amountMinor;
      if (payment.refundedMinor === payment.capturedMinor) payment.status = "refunded";
      return { ...payment, status: "refunded" };
    },
  };
}

export type Simulator = ReturnType<typeof createSimulator>;
