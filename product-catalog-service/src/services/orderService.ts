import * as orderRepository from "../data/orderRepository";
import { inventoryRepository } from "../data/inventoryRepository";
import { Order, OrderStatus } from "../types/order";

export const getOrder = (customerId: string, orderId: string): Order | undefined =>
  orderRepository.findOrder(customerId, orderId);

export const getOrderById = (orderId: string): Order | undefined =>
  orderRepository.findOrderById(orderId);

export const listOrders = (customerId: string): Order[] =>
  orderRepository.listOrders(customerId);

export const updateOrderStatus = (orderId: string, status: OrderStatus): Order | undefined => {
  const existing = orderRepository.findOrderById(orderId);
  if (!existing) return undefined;

  const previousStatus = existing.status;
  const updated = orderRepository.updateOrderStatus(orderId, status);

  if (updated && (status === "cancelled" || status === "refunded") && previousStatus !== "cancelled" && previousStatus !== "refunded") {
    inventoryRepository.restoreStock(
      existing.storeId,
      existing.items.map((i) => ({ productId: i.productId, quantity: i.quantity }))
    );
  }

  return updated;
};
