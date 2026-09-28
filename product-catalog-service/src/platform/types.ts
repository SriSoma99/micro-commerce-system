/**
 * Platform layer: everything that varies by region (tax, payments, receipts,
 * units) is expressed here as an interface, and chosen once at install time
 * via a `StoreConfig`. Core services depend on these interfaces only - they
 * never branch on a country code. Adding a region means adding a region pack
 * (see `regions/`), not editing the core.
 */

/** Integer minor units (cents) plus currency - never a float dollar amount. */
export interface Money {
  amountMinor: number;
  currency: string;
}

export type RegionCode = "US";
export type PriceMode = "tax-exclusive" | "tax-inclusive";
export type UnitSystem = "imperial" | "metric";

export interface StoreLocation {
  id: string;
  name: string;
  /** Tax jurisdiction key understood by the configured TaxProvider (US: state code). */
  taxJurisdiction: string;
}

/**
 * The install-time configuration document. Holds module *ids* only - never
 * credentials. A payment module that needs secrets reads them from the
 * environment itself.
 */
export interface StoreConfig {
  region: RegionCode;
  currency: string;
  locale: string;
  priceMode: PriceMode;
  units: UnitSystem;
  tax: { provider: string };
  payments: string[];
  receipt: string;
  stores: StoreLocation[];
  installedAt: string;
}

// ---- Tax --------------------------------------------------------------------

export interface TaxLineInput {
  lineId: string;
  /** Line amount before tax (tax-exclusive) - quantity already applied. */
  net: Money;
  /** Region-defined category key, e.g. "grocery", "candy". */
  taxCode: string;
}

export interface TaxLineResult {
  lineId: string;
  /** Applied rate in basis points (625 = 6.25%). */
  rateBps: number;
  tax: Money;
}

export interface TaxResult {
  lines: TaxLineResult[];
  total: Money;
}

export interface TaxProvider {
  readonly id: string;
  readonly displayName: string;
  calculate(input: { jurisdiction: string; lines: TaxLineInput[] }): Promise<TaxResult>;
}

// ---- Payments ---------------------------------------------------------------

export type PaymentMethodKind = "card" | "wallet" | "benefit" | "offline";

export interface PaymentMethodInfo {
  id: string;
  displayName: string;
  kind: PaymentMethodKind;
  /** True for demo modules: the UI and receipts must label these so nobody mistakes them for live payments. */
  simulated: boolean;
  /**
   * Present for gateway-backed methods: where the BROWSER sends card details to
   * get a one-time token. The shop backend only ever receives that token, so a
   * card number never touches (or is logged by) this service.
   */
  clientConfig?: {
    tokenizationUrl: string;
    publishableKey: string;
    testCardsUrl?: string;
    /** Which kind of card the gateway should expect ("card" | "ebt"). */
    tokenMethod: "card" | "ebt";
  };
}

/** What the customer supplied to pay: a gateway token, or nothing (pay at pickup). */
export type PaymentSource = { kind: "token"; token: string } | { kind: "none" };

export type PaymentStatus = "authorized" | "requires_action" | "captured" | "refunded" | "declined";

export type DeclineCode =
  | "card_declined"
  | "insufficient_funds"
  | "expired_card"
  | "incorrect_cvc"
  | "invalid_number"
  | "processing_error"
  | "invalid_token"
  | "unsupported_source";

export interface PaymentResult {
  status: PaymentStatus;
  reference: string;
  /** Set when `status` is `declined`. */
  declineCode?: DeclineCode;
  /** Set when `status` is `requires_action` (e.g. a 3-D Secure challenge). */
  actionType?: "3ds";
  /** Brand and last 4 only - a full card number is never returned, stored or logged. */
  card?: { brand: string; last4: string };
}

/** Raised for an operation that is invalid in the payment's current state (e.g. refunding an uncaptured payment). */
export class PaymentStateError extends Error {
  constructor(
    readonly code: "UNKNOWN_PAYMENT" | "INVALID_STATE" | "AMOUNT_EXCEEDS_CAPTURED",
    message: string
  ) {
    super(message);
    this.name = "PaymentStateError";
  }
}

/** The gateway could not be reached (network error, timeout, 5xx). Checkout must fail closed: no order, no charge. */
export class PaymentGatewayUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentGatewayUnavailableError";
  }
}

/**
 * The port every payment module implements. A real gateway (Stripe, Adyen,
 * Razorpay...) is one more adapter behind this interface; nothing upstream
 * changes.
 *
 * Lifecycle: authorize -> (requires_action -> confirmAction) -> capture ->
 * refund. A decline is a normal *result* (`status: "declined"`), not an
 * exception; only misuse of the lifecycle throws `PaymentStateError`.
 */
export interface PaymentProvider {
  readonly method: PaymentMethodInfo;
  authorize(request: { orderRef: string; amount: Money; source: PaymentSource }): Promise<PaymentResult>;
  /** Completes (or fails) a `requires_action` payment once the customer finished the challenge. */
  confirmAction(reference: string, approved: boolean): Promise<PaymentResult>;
  capture(reference: string): Promise<PaymentResult>;
  /** Refunds up to the captured amount in total; repeat calls accumulate. */
  refund(reference: string, amount: Money): Promise<PaymentResult>;
}

// ---- Receipts ---------------------------------------------------------------

export interface ReceiptLine {
  lineNo: number;
  productId: string;
  name: string;
  sizeLabel: string;
  soldBy: "each" | "weight";
  quantity: number;
  unitPriceMinor: number;
  netMinor: number;
  taxCode: string;
  taxRateBps: number;
  taxMinor: number;
  configuration: Record<string, string>;
}

/**
 * Everything a receipt shows, frozen at the moment the order was placed. The
 * stored invoice IS this snapshot: later price, tax-rate, store or profile
 * changes can never alter an invoice that was already issued.
 */
export interface ReceiptData {
  invoiceNumber: string;
  issuedAt: string;
  orderId: string;
  store: { id: string; name: string; jurisdiction: string };
  customer: { id: string; name: string; email: string };
  currency: string;
  locale: string;
  priceMode: PriceMode;
  lines: ReceiptLine[];
  totals: { subtotalMinor: number; taxMinor: number; totalMinor: number };
  /** Tax grouped by rate, as US receipts print it. */
  taxSummary: { rateBps: number; netMinor: number; taxMinor: number }[];
  payment: {
    methodId: string;
    methodName: string;
    status: PaymentStatus;
    reference: string;
    simulated: boolean;
    card?: { brand: string; last4: string };
  };
}

/** A region's receipt format: turns a `ReceiptData` snapshot into a printable HTML document. */
export interface ReceiptTemplate {
  readonly id: string;
  readonly displayName: string;
  render(data: ReceiptData): string;
}

// ---- Region pack ------------------------------------------------------------

export interface RegionPack {
  code: RegionCode;
  displayName: string;
  defaults: {
    currency: string;
    locale: string;
    priceMode: PriceMode;
    units: UnitSystem;
    taxProvider: string;
    payments: string[];
    receipt: string;
  };
  /** Module ids this region offers. Setup rejects anything outside these. */
  taxProviders: TaxProvider[];
  paymentProviders: PaymentProvider[];
  receiptTemplates: ReceiptTemplate[];
  /** Valid `StoreLocation.taxJurisdiction` values, with labels for the setup UI. */
  jurisdictions: { id: string; displayName: string }[];
  /** How a postal address is validated in this region (regex sources, for JSON-friendliness). */
  address: {
    country: string;
    regionPattern: string;
    regionExample: string;
    postalCodePattern: string;
    postalCodeExample: string;
  };
}
