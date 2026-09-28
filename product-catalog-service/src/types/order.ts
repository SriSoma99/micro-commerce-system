import { PaymentStatus, ReceiptLine } from "../platform/types";

/**
 * Domain model for orders and invoices. An order is an immutable snapshot of a
 * cart at checkout (prices, tax and store frozen); the invoice is the receipt
 * rendered from that snapshot and is stored under the customer's account.
 */
export type OrderStatus =
  | "payment_pending"
  | "placed"
  | "packed"
  | "ready"
  | "collected"
  | "cancelled"
  | "refunded";

export interface OrderPayment {
  method: string;
  status: PaymentStatus;
  reference: string | null;
  card: { brand: string; last4: string } | null;
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
  customerId: string;
  cartId: string;
  storeId: string;
  storeName: string;
  taxJurisdiction: string;
  status: OrderStatus;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  payment: OrderPayment;
  items: ReceiptLine[];
  placedAt: string;
  pickupSlot?: string | null;
  refunds?: RefundSummary[];
  /** Set once an invoice has been issued (not for a payment still pending). */
  invoice: InvoiceSummary | null;
}

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
