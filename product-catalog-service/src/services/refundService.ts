import { randomUUID } from "node:crypto";
import { getPaymentProvider } from "../platform/platform";
import { Order, RefundSummary } from "../types/order";
import { findOrderById } from "../data/orderRepository";
import { updateOrderStatus } from "./orderService";

export interface RefundInput {
  orderId: string;
  reason?: string;
  amountMinor?: number; // if not provided, full refund
}

export type RefundResult =
  | { ok: true; refund: RefundSummary; order: Order }
  | { ok: false; status: number; code: string; message: string };

export async function processRefund(input: RefundInput): Promise<RefundResult> {
  const order = findOrderById(input.orderId);
  if (!order) {
    return { ok: false, status: 404, code: "ORDER_NOT_FOUND", message: `Order "${input.orderId}" not found` };
  }

  if (order.status === "cancelled" || order.status === "payment_pending") {
    return { ok: false, status: 400, code: "INVALID_ORDER_STATE", message: `Cannot refund order in state "${order.status}"` };
  }

  const refundAmountMinor = input.amountMinor ?? order.totalMinor;
  if (refundAmountMinor <= 0 || refundAmountMinor > order.totalMinor) {
    return { ok: false, status: 400, code: "INVALID_REFUND_AMOUNT", message: `Refund amount must be between 1 and ${order.totalMinor}` };
  }

  const provider = getPaymentProvider(order.payment.method);
  if (!provider) {
    return { ok: false, status: 500, code: "PAYMENT_PROVIDER_NOT_FOUND", message: `Provider "${order.payment.method}" not found` };
  }

  // Gateway refund if reference exists and payment was captured
  if (order.payment.reference && order.payment.status === "captured") {
    try {
      const refundOutcome = await provider.refund(order.payment.reference, {
        amountMinor: refundAmountMinor,
        currency: order.currency,
      });

      if (refundOutcome.status === "declined") {
        return {
          ok: false,
          status: 402,
          code: refundOutcome.declineCode ?? "REFUND_DECLINED",
          message: "Refund was declined by the payment provider",
        };
      }
    } catch (err) {
      return {
        ok: false,
        status: 502,
        code: "GATEWAY_ERROR",
        message: (err as Error).message || "Payment gateway refund failed",
      };
    }
  }

  const refundId = `ref_${randomUUID()}`;
  const creditNumber = `CR-${order.orderId.substring(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  const refundSummary: RefundSummary = {
    id: refundId,
    orderId: order.orderId,
    amountMinor: refundAmountMinor,
    currency: order.currency,
    reason: input.reason ?? "Customer refund",
    creditInvoiceNumber: creditNumber,
    refundedAt: now,
  };

  // Mark order as refunded if full refund
  if (refundAmountMinor === order.totalMinor) {
    updateOrderStatus(order.orderId, "refunded");
  }

  const updatedOrder = findOrderById(order.orderId) as Order;
  return { ok: true, refund: refundSummary, order: updatedOrder };
}
