import { Request, Response } from "express";
import { generatePickupSlots } from "../services/pickupSlotService";
import { liveEnvelope } from "../utils/envelope";
import { getPlatform } from "../platform/platform";

/** GET /api/stores/:storeId/pickup-slots */
export function getStorePickupSlots(req: Request, res: Response): void {
  const storeId = req.params.storeId as string;
  const platform = getPlatform();

  if (platform && !platform.config.stores.some((s) => s.id === storeId)) {
    res.status(404).json({ error: "STORE_NOT_FOUND", message: `Store "${storeId}" not found in current store config` });
    return;
  }

  const slots = generatePickupSlots(storeId);
  res.status(200).json(liveEnvelope(slots));
}
