import { Request, Response } from "express";
import * as paymentService from "../services/paymentService";
import { liveEnvelope } from "../utils/envelope";

/**
 * GET /api/payments/methods
 * Read-only on purpose: authorize/capture/refund are driven by checkout
 * internally and are not exposed as public, unauthenticated endpoints.
 */
export function listPaymentMethods(_req: Request, res: Response): void {
  const methods = paymentService.getEnabledPaymentMethods();
  if (!methods) {
    res.status(404).json({ error: "NOT_INSTALLED", message: "Store setup has not been completed" });
    return;
  }
  res.status(200).json(liveEnvelope(methods));
}
