import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { logger } from "../utils/logger";
import { readStoreConfig, writeStoreConfig } from "./configStore";
import { registerBuiltinRegionPacks } from "./regions";
import { validateInstallRequest } from "./validateConfig";
import { getRegionPack, listRegionPacks } from "./registry";
import { PaymentProvider, ReceiptTemplate, RegionPack, StoreConfig, TaxProvider } from "./types";

/** The config plus the concrete modules it resolved to at boot. */
export interface ActivePlatform {
  config: StoreConfig;
  tax: TaxProvider;
  payments: PaymentProvider[];
  receipt: ReceiptTemplate;
}

let active: ActivePlatform | undefined;
let setupToken: string | undefined;

export function getPlatform(): ActivePlatform | undefined {
  return active;
}

export function getPaymentProvider(methodId: string): PaymentProvider | undefined {
  if (!active) return undefined;
  return active.payments.find((p) => p.method.id === methodId);
}

/**
 * Address rules of the installed region. Customer accounts work before
 * install too (seeded demo users), so with no config it falls back to the
 * first registered pack rather than refusing to validate.
 */
export function getAddressRules(): RegionPack["address"] {
  const pack = (active && getRegionPack(active.config.region)) ?? listRegionPacks()[0];
  if (!pack) throw new Error("No region pack registered");
  return pack.address;
}

/** Simulated payments must never go unnoticed: say so loudly in the server log. */
function warnIfSimulated(platform: ActivePlatform): void {
  const simulated = platform.payments.filter((p) => p.method.simulated).map((p) => p.method.id);
  if (simulated.length > 0) {
    logger.warn("Platform", `Payment modules in SIMULATION mode (no real money moves): ${simulated.join(", ")}`);
  }
}

/** Turns a stored config into live modules; throws if any id no longer resolves. */
function resolve(config: StoreConfig): ActivePlatform {
  const pack = getRegionPack(config.region);
  if (!pack) throw new Error(`Unknown region "${config.region}"`);

  const tax = pack.taxProviders.find((p) => p.id === config.tax.provider);
  if (!tax) throw new Error(`Unknown tax provider "${config.tax.provider}"`);

  const payments = config.payments.map((id) => {
    const provider = pack.paymentProviders.find((p) => p.method.id === id);
    if (!provider) throw new Error(`Unknown payment module "${id}"`);
    return provider;
  });

  const receipt = pack.receiptTemplates.find((t) => t.id === config.receipt);
  if (!receipt) throw new Error(`Unknown receipt template "${config.receipt}"`);

  return { config, tax, payments, receipt };
}

/**
 * Called from `createApp()`. Registers the built-in region packs, then boots
 * from the persisted config if there is one. With no (or an unusable) config
 * the store is "not installed" and a one-time setup token is issued instead.
 * Re-evaluated on every call so the in-process test suite can re-launch.
 */
export function initPlatform(): void {
  registerBuiltinRegionPacks();
  active = undefined;
  setupToken = undefined;

  try {
    const stored = readStoreConfig();
    if (stored !== undefined) {
      active = resolve(stored as StoreConfig);
      logger.info("Platform", `Store installed: region=${active.config.region}, stores=${active.config.stores.length}`);
      warnIfSimulated(active);
      return;
    }
  } catch (err) {
    logger.error("Platform", `Stored config is unusable, treating store as not installed: ${(err as Error).message}`);
  }

  // Opt-in demo convenience: with DEMO_AUTO_INSTALL=true a fresh, unconfigured store installs
  // itself with a US demo configuration (5 stores across IL/OH/PA, every payment module), so a demo
  // stack is usable without running the setup wizard. Off by default - it skips the setup token.
  if (process.env.DEMO_AUTO_INSTALL === "true") {
    const demo = validateInstallRequest({
      region: "US",
      stores: [
        { id: "IL-01", name: "Batavia Flagship, IL", taxJurisdiction: "IL" },
        { id: "IL-02", name: "Naperville Superstore, IL", taxJurisdiction: "IL" },
        { id: "OH-01", name: "Columbus Central, OH", taxJurisdiction: "OH" },
        { id: "OH-02", name: "Cleveland Harbor, OH", taxJurisdiction: "OH" },
        { id: "PA-01", name: "Pittsburgh East, PA", taxJurisdiction: "PA" },
      ],
      payments: ["card-mock", "ebt-mock", "pay-at-pickup"],
    });
    if (demo.ok) {
      active = completeInstall(demo.config);
      logger.warn("Platform", "DEMO_AUTO_INSTALL: installed the US demo configuration (5 stores across IL/OH/PA)");
      return;
    }
  }

  // `||` not `??`: docker-compose passes an unset variable through as "", and
  // an empty string must never become the token.
  setupToken = process.env.SETUP_TOKEN || randomBytes(16).toString("hex");
  logger.warn("Platform", "Store is not installed. Complete setup with the one-time setup token:");
  logger.warn("Platform", `  SETUP TOKEN: ${setupToken}`);
}

export function isSetupTokenValid(candidate: unknown): boolean {
  if (setupToken === undefined || typeof candidate !== "string") return false;
  // Hash first so both buffers are the same length for timingSafeEqual.
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(setupToken).digest();
  return timingSafeEqual(a, b);
}

/** Persists the config, activates its modules and burns the setup token. */
export function completeInstall(config: StoreConfig): ActivePlatform {
  const platform = resolve(config);
  writeStoreConfig(config);
  active = platform;
  setupToken = undefined;
  logger.info("Platform", `Install complete: region=${config.region}, stores=${config.stores.length}`);
  warnIfSimulated(platform);
  return platform;
}
