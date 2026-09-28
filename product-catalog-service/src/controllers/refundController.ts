import { Request, Response } from "express";
import { processRefund } from "../services/refundService";
import { liveEnvelope } from "../utils/envelope";

/** POST /api/orders/:orderId/refund */
export async function createRefund(req: Request, res: Response): Promise<void> {
  const { orderId } = req.params;
  const { reason, amountMinor } = req.body ?? {};

  const result = await processRefund({
    orderId: orderId as string,
    reason: typeof reason === "string" ? reason : undefined,
    amountMinor: typeof amountMinor === "number" ? amountMinor : undefined,
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.code, message: result.message });
    return;
  }

  res.status(201).json(liveEnvelope(result.refund));
}
