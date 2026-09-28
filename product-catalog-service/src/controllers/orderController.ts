import { Request, Response } from "express";
import { currentCustomer } from "../middleware/requireAuth";
import { getOrder, listOrders, updateOrderStatus } from "../services/orderService";
import { OrderStatus } from "../types/order";
import { liveEnvelope } from "../utils/envelope";

const VALID_STATUSES: OrderStatus[] = ["placed", "packed", "ready", "collected", "cancelled"];

/** GET /api/orders - the signed-in customer's orders, newest first. */
export function listMyOrders(_req: Request, res: Response): void {
  res.status(200).json(liveEnvelope(listOrders(currentCustomer(res).id)));
}

/** GET /api/orders/:orderId - owner only; someone else's id looks the same as a nonexistent one. */
export function getOrderById(req: Request, res: Response): void {
  const { orderId } = req.params;
  const order = getOrder(currentCustomer(res).id, orderId as string);

  if (!order) {
    res.status(404).json({ error: "ORDER_NOT_FOUND", message: `No order found with id "${orderId}"` });
    return;
  }
  res.status(200).json(liveEnvelope(order));
}

/** PATCH /api/orders/:orderId/status - advances order lifecycle */
export function updateStatus(req: Request, res: Response): void {
  const { orderId } = req.params;
  const { status } = req.body ?? {};

  if (!status || !VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: "INVALID_STATUS", message: `Status must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }

  const updated = updateOrderStatus(orderId as string, status);
  if (!updated) {
    res.status(404).json({ error: "ORDER_NOT_FOUND", message: `No order found with id "${orderId}"` });
    return;
  }

  res.status(200).json(liveEnvelope(updated));
}
