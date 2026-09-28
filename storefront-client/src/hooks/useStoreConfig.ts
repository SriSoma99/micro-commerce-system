import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import type { PublicStoreConfig, StoreLocation } from "../types/store";

const STORE_KEY = "fresh-basket-store";

export type StoreConfigStatus = "loading" | "ready" | "notInstalled" | "error";

export interface UseStoreConfigResult {
  status: StoreConfigStatus;
  config: PublicStoreConfig | null;
  /** The store the shopper picked (or the first one). Pickup, tax and stock are all per store. */
  store: StoreLocation | null;
  selectStore: (storeId: string) => void;
  reload: () => Promise<void>;
}

const readStoreId = (): string | null => {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
};

/** Loads the install-time configuration (region, stores, payment methods) and tracks the chosen store. */
export function useStoreConfig(): UseStoreConfigResult {
  const [status, setStatus] = useState<StoreConfigStatus>("loading");
  const [config, setConfig] = useState<PublicStoreConfig | null>(null);
  const [storeId, setStoreId] = useState<string | null>(readStoreId);

  const load = useCallback(async (cancelled = false) => {
    const result = await apiRequest<PublicStoreConfig>("/store-config");
    if (cancelled) return;
    if (result.ok) {
      setConfig(result.data);
      setStatus("ready");
    } else {
      setStatus(result.code === "NOT_INSTALLED" ? "notInstalled" : "error");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load(cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  const reload = useCallback(async () => {
    await load(false);
  }, [load]);

  const selectStore = useCallback((id: string) => {
    setStoreId(id);
    try {
      localStorage.setItem(STORE_KEY, id);
    } catch {
      // Not persisted; still applies for this session.
    }
  }, []);

  const store = config?.stores.find((candidate) => candidate.id === storeId) ?? config?.stores[0] ?? null;
  return { status, config, store, selectStore, reload };
}
