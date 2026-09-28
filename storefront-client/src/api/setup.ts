import { apiRequest, type ApiResult } from "./client";
import type { StoreConfig } from "../types/store";

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
  paymentMethods: {
    id: string;
    displayName: string;
    kind: string;
    simulated: boolean;
  }[];
  receiptTemplates: { id: string; displayName: string }[];
  jurisdictions: { id: string; displayName: string }[];
}

export interface SetupStatus {
  installed: boolean;
}

export interface InstallPayload {
  region: string;
  currency?: string;
  locale?: string;
  priceMode?: string;
  units?: string;
  tax?: { provider: string };
  payments?: string[];
  receipt?: string;
  stores: { id: string; name: string; taxJurisdiction: string }[];
  adminUser?: { email: string; password: string; name: string };
}

export async function fetchSetupStatus(): Promise<ApiResult<SetupStatus>> {
  return apiRequest<SetupStatus>("/setup/status");
}

export async function fetchSetupOptions(): Promise<ApiResult<RegionOption[]>> {
  return apiRequest<RegionOption[]>("/setup/options");
}

export async function installStore(
  setupToken: string,
  payload: InstallPayload
): Promise<ApiResult<StoreConfig>> {
  return apiRequest<StoreConfig>("/setup/install", {
    method: "POST",
    headers: {
      "x-setup-token": setupToken.trim(),
    },
    body: payload,
  });
}
