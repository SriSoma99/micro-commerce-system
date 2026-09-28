import { completeInstall, getPlatform, isSetupTokenValid } from "../platform/platform";
import { listRegionPacks } from "../platform/registry";
import { PaymentMethodInfo, StoreConfig } from "../platform/types";
import { validateInstallRequest } from "../platform/validateConfig";
import * as authService from "./authService";

export interface SetupStatus {
  installed: boolean;
}

export interface RegionOption {
  code: string;
  displayName: string;
  defaults: {
    currency: string;
    locale: string;
    priceMode: string;
    units: string;
    taxProvider: string;
    payments: string[];
    receipt: string;
  };
  taxProviders: { id: string; displayName: string }[];
  paymentMethods: PaymentMethodInfo[];
  receiptTemplates: { id: string; displayName: string }[];
  jurisdictions: { id: string; displayName: string }[];
}

/** What the storefront needs to know - deliberately excludes anything secret. */
export interface PublicStoreConfig extends Omit<StoreConfig, "payments" | "tax" | "receipt"> {
  taxProvider: string;
  paymentMethods: PaymentMethodInfo[];
  /** True when any enabled payment module is a simulator - the UI must show a "simulated payments" notice. */
  paymentSimulation: boolean;
  receipt: string;
}

export type InstallResult =
  | { ok: true; config: PublicStoreConfig }
  | { ok: false; reason: "ALREADY_INSTALLED" | "INVALID_SETUP_TOKEN" }
  | { ok: false; reason: "VALIDATION_FAILED"; errors: string[] };

export function getSetupStatus(): SetupStatus {
  return { installed: getPlatform() !== undefined };
}

export function getSetupOptions(): RegionOption[] {
  return listRegionPacks().map((pack) => ({
    code: pack.code,
    displayName: pack.displayName,
    defaults: { ...pack.defaults },
    taxProviders: pack.taxProviders.map(({ id, displayName }) => ({ id, displayName })),
    paymentMethods: pack.paymentProviders.map((p) => p.method),
    receiptTemplates: pack.receiptTemplates.map(({ id, displayName }) => ({ id, displayName })),
    jurisdictions: pack.jurisdictions,
  }));
}

function toPublicConfig(config: StoreConfig, paymentMethods: PaymentMethodInfo[]): PublicStoreConfig {
  const { payments: _payments, tax, ...rest } = config;
  void _payments;
  return { ...rest, taxProvider: tax.provider, paymentMethods, paymentSimulation: paymentMethods.some((m) => m.simulated) };
}

export function getPublicStoreConfig(): PublicStoreConfig | undefined {
  const platform = getPlatform();
  if (!platform) return undefined;
  return toPublicConfig(
    platform.config,
    platform.payments.map((p) => p.method)
  );
}

export async function install(setupToken: unknown, body: unknown): Promise<InstallResult> {
  if (getPlatform()) return { ok: false, reason: "ALREADY_INSTALLED" };
  if (!isSetupTokenValid(setupToken)) return { ok: false, reason: "INVALID_SETUP_TOKEN" };

  const validated = validateInstallRequest(body);
  if (!validated.ok) return { ok: false, reason: "VALIDATION_FAILED", errors: validated.errors };

  // Optional first admin creation
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (input.adminUser && typeof input.adminUser === "object" && input.adminUser !== null) {
    const admin = input.adminUser as { email?: string; password?: string; name?: string };
    if (admin.email && admin.password && admin.name) {
      const regResult = await authService.register({
        email: admin.email,
        password: admin.password,
        name: admin.name,
        role: "admin",
      });
      if (!regResult.ok) {
        const errorMsg = regResult.reason === "EMAIL_TAKEN" ? "Admin email is already registered" : "Failed to register admin account";
        return { ok: false, reason: "VALIDATION_FAILED", errors: [errorMsg] };
      }
    }
  }

  const platform = completeInstall(validated.config);
  return {
    ok: true,
    config: toPublicConfig(
      platform.config,
      platform.payments.map((p) => p.method)
    ),
  };
}
