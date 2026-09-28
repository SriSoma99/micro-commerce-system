import { apiRequest } from "./client";
import type { Order, Quote } from "../types/order";

export interface PlaceOrderInput {
  cartId: string;
  storeId: string;
  paymentMethod: string;
  paymentToken?: string;
  idempotencyKey?: string;
}

/** 201: the order is placed. 202: a 3-D Secure challenge must be completed first. */
export type PlaceOrderData = Order | { order: Order; paymentAction: { type: "3ds" } };

export const isChallenge = (data: PlaceOrderData): data is { order: Order; paymentAction: { type: "3ds" } } => "paymentAction" in data;

/** What the cart costs at a store, with tax - nothing is charged or saved. */
export const getQuote = (token: string, cartId: string, storeId: string, signal?: AbortSignal) =>
  apiRequest<Quote>("/checkout/quote", { method: "POST", token, body: { cartId, storeId }, signal });

export const placeOrder = (token: string, input: PlaceOrderInput) => {
  const { idempotencyKey, ...body } = input;
  return apiRequest<PlaceOrderData>("/checkout", {
    method: "POST",
    token,
    body,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  });
};

export const confirmPayment = (token: string, orderId: string, approved: boolean) =>
  apiRequest<Order>(`/orders/${orderId}/payment/confirm`, { method: "POST", token, body: { approved } });
