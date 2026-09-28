import { getRegionPack } from "./registry";
import { StoreConfig, StoreLocation, UnitSystem } from "./types";

type ValidationResult = { ok: true; config: StoreConfig } | { ok: false; errors: string[] };

const UNIT_SYSTEMS: UnitSystem[] = ["imperial", "metric"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates an install request against the chosen region pack and fills
 * omitted fields from the pack's defaults. `currency` and `priceMode` are
 * fixed by the region (orders are frozen snapshots in that currency/tax
 * mode), so a request that contradicts them is rejected rather than honoured.
 */
export function validateInstallRequest(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, errors: ["Request body must be a JSON object"] };
  }
  const input = body as Record<string, unknown>;

  const pack = isNonEmptyString(input.region) ? getRegionPack(input.region) : undefined;
  if (!pack) {
    return { ok: false, errors: [`region must be one of the available regions`] };
  }

  const errors: string[] = [];
  const { defaults } = pack;

  if (input.currency !== undefined && input.currency !== defaults.currency) {
    errors.push(`currency is fixed to ${defaults.currency} for region ${pack.code}`);
  }
  if (input.priceMode !== undefined && input.priceMode !== defaults.priceMode) {
    errors.push(`priceMode is fixed to ${defaults.priceMode} for region ${pack.code}`);
  }

  const locale = input.locale ?? defaults.locale;
  if (!isNonEmptyString(locale)) errors.push("locale must be a non-empty string");

  const units = input.units ?? defaults.units;
  if (!UNIT_SYSTEMS.includes(units as UnitSystem)) errors.push(`units must be one of: ${UNIT_SYSTEMS.join(", ")}`);

  const taxInput = input.tax as { provider?: unknown } | undefined;
  const taxProvider = taxInput?.provider ?? defaults.taxProvider;
  if (!pack.taxProviders.some((p) => p.id === taxProvider)) {
    errors.push(`tax.provider must be one of: ${pack.taxProviders.map((p) => p.id).join(", ")}`);
  }

  const payments = input.payments ?? defaults.payments;
  const availablePayments = pack.paymentProviders.map((p) => p.method.id);
  if (!Array.isArray(payments) || payments.length === 0) {
    errors.push("payments must be a non-empty array of payment module ids");
  } else {
    for (const id of payments) {
      if (!availablePayments.includes(id as string)) {
        errors.push(`unknown payment module "${String(id)}"; available: ${availablePayments.join(", ")}`);
      }
    }
    if (new Set(payments).size !== payments.length) errors.push("payments must not contain duplicates");
  }

  const receipt = input.receipt ?? defaults.receipt;
  if (!pack.receiptTemplates.some((t) => t.id === receipt)) {
    errors.push(`receipt must be one of: ${pack.receiptTemplates.map((t) => t.id).join(", ")}`);
  }

  const stores = validateStores(input.stores, pack.jurisdictions.map((j) => j.id), errors);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    config: {
      region: pack.code,
      currency: defaults.currency,
      locale: locale as string,
      priceMode: defaults.priceMode,
      units: units as UnitSystem,
      tax: { provider: taxProvider as string },
      payments: payments as string[],
      receipt: receipt as string,
      stores,
      installedAt: new Date().toISOString(),
    },
  };
}

function validateStores(input: unknown, jurisdictions: string[], errors: string[]): StoreLocation[] {
  if (!Array.isArray(input) || input.length === 0) {
    errors.push("stores must be a non-empty array");
    return [];
  }

  const stores: StoreLocation[] = [];
  const seen = new Set<string>();

  input.forEach((raw, index) => {
    const label = `stores[${index}]`;
    if (typeof raw !== "object" || raw === null) {
      errors.push(`${label} must be an object`);
      return;
    }
    const { id, name, taxJurisdiction } = raw as Record<string, unknown>;

    if (!isNonEmptyString(id)) errors.push(`${label}.id must be a non-empty string`);
    else if (seen.has(id)) errors.push(`${label}.id "${id}" is duplicated`);
    else seen.add(id);

    if (!isNonEmptyString(name)) errors.push(`${label}.name must be a non-empty string`);

    if (!isNonEmptyString(taxJurisdiction) || !jurisdictions.includes(taxJurisdiction)) {
      errors.push(`${label}.taxJurisdiction must be one of: ${jurisdictions.join(", ")}`);
    }

    if (isNonEmptyString(id) && isNonEmptyString(name) && isNonEmptyString(taxJurisdiction)) {
      stores.push({ id: id.trim(), name: name.trim(), taxJurisdiction });
    }
  });

  return stores;
}
