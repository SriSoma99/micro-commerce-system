import { Request, Response } from "express";
import * as setupService from "../services/setupService";
import { liveEnvelope as envelope } from "../utils/envelope";

/** GET /api/setup/status */
export function getStatus(_req: Request, res: Response): void {
  res.status(200).json(envelope(setupService.getSetupStatus()));
}

/** GET /api/setup/options - regions and the modules each one offers. */
export function getOptions(_req: Request, res: Response): void {
  res.status(200).json(envelope(setupService.getSetupOptions()));
}

/** GET /api/store-config - public, secret-free view of the installed config. */
export function getStoreConfig(_req: Request, res: Response): void {
  const config = setupService.getPublicStoreConfig();
  if (!config) {
    res.status(404).json({ error: "NOT_INSTALLED", message: "Store setup has not been completed" });
    return;
  }
  res.status(200).json(envelope(config));
}

/** POST /api/setup/install - requires the one-time token in `x-setup-token`. */
export async function installStore(req: Request, res: Response): Promise<void> {
  const result = await setupService.install(req.header("x-setup-token"), req.body);

  if (result.ok) {
    res.status(201).json(envelope(result.config));
    return;
  }

  switch (result.reason) {
    case "ALREADY_INSTALLED":
      res.status(409).json({ error: "ALREADY_INSTALLED", message: "Store is already installed" });
      return;
    case "INVALID_SETUP_TOKEN":
      res.status(401).json({ error: "INVALID_SETUP_TOKEN", message: "Missing or invalid x-setup-token header" });
      return;
    case "VALIDATION_FAILED":
      res.status(400).json({ error: "VALIDATION_FAILED", message: "Invalid install request", details: result.errors });
      return;
  }
}
