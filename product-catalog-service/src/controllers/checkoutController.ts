import { Request, Response } from "express";
import { currentCustomer } from "../middleware/requireAuth";
import { CheckoutOutcome, confirmPayment, placeOrder, quoteOrder } from "../services/checkoutService";
import { liveEnvelope } from "../utils/envelope";

function send(res: Response, outcome: CheckoutOutcome): void {
  switch (outcome.kind) {
    case "placed":
      res.status(201).json(liveEnvelope(outcome.order));
      return;
    case "payment_action_required":
      // 202: accepted but not complete - the customer must finish the 3-D Secure challenge.
      res.status(202).json(liveEnvelope({ order: outcome.order, paymentAction: { type: outcome.actionType } }));
      return;
    case "error":
      res.status(outcome.status).json({
        error: outcome.code,
        message: outcome.message,
        ...(outcome.declineCode ? { declineCode: outcome.declineCode } : {}),
      });
  }
}

const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200;

/**
 * POST /api/checkout  (signed in)
 * { cartId, storeId, paymentMethod, paymentToken? }
 * `paymentToken` comes from the payment gateway: the browser sends card details
 * to the gateway directly and passes us only the resulting token.
 */
export async function checkout(req: Request, res: Response): Promise<void> {
  const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const problems: string[] = [];
  if (!text(body.cartId)) problems.push("cartId is required");
  if (!text(body.storeId)) problems.push("storeId is required");
  if (!text(body.paymentMethod)) problems.push("paymentMethod is required");
  if (body.paymentToken !== undefined && !text(body.paymentToken)) problems.push("paymentToken must be a non-empty string");
  if (problems.length > 0) {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "Invalid checkout request", details: problems });
    return;
  }

  const headerKey = req.header("idempotency-key") || req.header("x-idempotency-key");
  const idempotencyKey = (typeof headerKey === "string" && headerKey.trim().length > 0)
    ? headerKey.trim()
    : (typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length > 0 ? body.idempotencyKey.trim() : undefined);

  send(
    res,
    await placeOrder({
      customer: currentCustomer(res),
      cartId: body.cartId as string,
      storeId: body.storeId as string,
      paymentMethod: body.paymentMethod as string,
      paymentToken: body.paymentToken as string | undefined,
      idempotencyKey,
    })
  );
}

/** POST /api/orders/:orderId/payment/confirm  { approved } - completes a 3-D Secure challenge. */
export async function confirmOrderPayment(req: Request, res: Response): Promise<void> {
  const approved = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>).approved : undefined;
  if (typeof approved !== "boolean") {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "approved must be true or false" });
    return;
  }
  send(res, await confirmPayment(currentCustomer(res), req.params.orderId as string, approved));
}

/** POST /api/checkout/quote  (signed in)  { cartId, storeId } - tax + total for a cart at a store, nothing charged or saved. */
export async function quote(req: Request, res: Response): Promise<void> {
  const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  if (!text(body.cartId) || !text(body.storeId)) {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "cartId and storeId are required" });
    return;
  }

  const outcome = await quoteOrder(body.cartId, body.storeId);
  if (outcome.kind === "quote") {
    res.status(200).json(liveEnvelope(outcome.quote));
    return;
  }
  res.status(outcome.status).json({ error: outcome.code, message: outcome.message });
}
