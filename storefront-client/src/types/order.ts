/** Client-side mirror of the backend's order / invoice / checkout types. Money is integer cents. */

export interface OrderLine {
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

export type PaymentStatus = "authorized" | "requires_action" | "captured" | "refunded" | "declined";

export type OrderStatus =
  | "payment_pending"
  | "placed"
  | "packed"
  | "ready"
  | "collected"
  | "cancelled"
  | "refunded";

export interface InvoiceSummary {
  id: string;
  number: string;
  orderId: string;
  storeId: string;
  storeName: string;
  totalMinor: number;
  currency: string;
  issuedAt: string;
}

export interface RefundSummary {
  id: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  reason: string;
  creditInvoiceNumber: string;
  refundedAt: string;
}

export interface Order {
  orderId: string;
  storeId: string;
  storeName: string;
  taxJurisdiction: string;
  status: OrderStatus;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  payment: {
    method: string;
    status: PaymentStatus;
    reference: string | null;
    card: { brand: string; last4: string } | null;
  };
  items: OrderLine[];
  placedAt: string;
  pickupSlot?: string | null;
  refunds?: RefundSummary[];
  invoice: InvoiceSummary | null;
}

export interface Quote {
  storeId: string;
  storeName: string;
  jurisdiction: string;
  currency: string;
  items: OrderLine[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface CheckoutResult {
  orderId: string;
  status: OrderStatus;
  requiresAction?: { clientSecret: string; paymentMethod: string };
  error?: string;
  declineCode?: string;
}

export interface ReceiptData {
  invoiceNumber: string;
  issuedAt: string;
  orderId: string;
  store: { id: string; name: string; jurisdiction: string };
  customer: { id: string; name: string; email: string };
  currency: string;
  locale: string;
  priceMode: string;
  lines: OrderLine[];
  totals: { subtotalMinor: number; taxMinor: number; totalMinor: number };
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
