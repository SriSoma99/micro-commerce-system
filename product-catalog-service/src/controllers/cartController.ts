import { Request, Response } from "express";
import * as cartService from "../services/cartService";
import { CartResult } from "../services/cartService";

/**
 * Express 5 + express.json() gives no request-body validation for free
 * (req.body is `any`), and this repo has no schema-validation library
 * precedent, so bodies are hand-checked here at the HTTP boundary - the
 * same "validate at the boundary, trust internal code" approach used
 * throughout the rest of the service.
 */
function parseAddItemBody(
  body: unknown
): { productId: string; quantity: number; selectedConfiguration?: Record<string, string>; storeId?: string } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object" };
  }
  const { productId, quantity, selectedConfiguration, storeId } = body as Record<string, unknown>;

  if (typeof productId !== "string" || productId.length === 0) {
    return { error: "productId must be a non-empty string" };
  }
  if (typeof quantity !== "number" || !Number.isInteger(quantity)) {
    return { error: "quantity must be an integer" };
  }
  if (selectedConfiguration !== undefined) {
    if (typeof selectedConfiguration !== "object" || selectedConfiguration === null || Array.isArray(selectedConfiguration)) {
      return { error: "selectedConfiguration must be an object of string values" };
    }
    for (const value of Object.values(selectedConfiguration)) {
      if (typeof value !== "string") {
        return { error: "selectedConfiguration values must be strings" };
      }
    }
  }

  const validStoreId = typeof storeId === "string" && storeId.trim() !== "" ? storeId.trim() : undefined;

  return { productId, quantity, selectedConfiguration: selectedConfiguration as Record<string, string> | undefined, storeId: validStoreId };
}

function parseQuantityBody(body: unknown): { quantity: number; storeId?: string } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object" };
  }
  const { quantity, storeId } = body as Record<string, unknown>;
  if (typeof quantity !== "number" || !Number.isInteger(quantity)) {
    return { error: "quantity must be an integer" };
  }
  const validStoreId = typeof storeId === "string" && storeId.trim() !== "" ? storeId.trim() : undefined;
  return { quantity, storeId: validStoreId };
}

function sendCartResult(res: Response, result: CartResult): void {
  if (result.ok) {
    res.status(200).json(result.payload);
    return;
  }
  res.status(result.status).json({ error: result.code, message: result.message });
}

/** GET /api/cart/:cartId */
export function getCart(req: Request, res: Response): void {
  const { cartId } = req.params;
  const payload = cartService.getCart(cartId as string);
  res.status(200).json(payload);
}

/** POST /api/cart/:cartId/items */
export async function addItem(req: Request, res: Response): Promise<void> {
  const { cartId } = req.params;
  const parsed = parseAddItemBody(req.body);
  if ("error" in parsed) {
    res.status(400).json({ error: "INVALID_REQUEST", message: parsed.error });
    return;
  }

  const storeId = parsed.storeId ?? (typeof req.query.storeId === "string" ? req.query.storeId : undefined);

  const result = await cartService.addItem(
    cartId as string,
    parsed.productId,
    parsed.quantity,
    parsed.selectedConfiguration,
    storeId
  );
  sendCartResult(res, result);
}

/** PATCH /api/cart/:cartId/items/:lineItemId */
export async function updateQuantity(req: Request, res: Response): Promise<void> {
  const { cartId, lineItemId } = req.params;
  const parsed = parseQuantityBody(req.body);
  if ("error" in parsed) {
    res.status(400).json({ error: "INVALID_REQUEST", message: parsed.error });
    return;
  }

  const storeId = parsed.storeId ?? (typeof req.query.storeId === "string" ? req.query.storeId : undefined);

  const result = await cartService.updateQuantity(cartId as string, lineItemId as string, parsed.quantity, storeId);
  sendCartResult(res, result);
}

/** DELETE /api/cart/:cartId/items/:lineItemId */
export function removeItem(req: Request, res: Response): void {
  const { cartId, lineItemId } = req.params;
  const result = cartService.removeItem(cartId as string, lineItemId as string);
  sendCartResult(res, result);
}

/** DELETE /api/cart/:cartId */
export function clearCart(req: Request, res: Response): void {
  const { cartId } = req.params;
  const payload = cartService.clearCart(cartId as string);
  res.status(200).json(payload);
}
