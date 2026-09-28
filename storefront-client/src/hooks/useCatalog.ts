import { useEffect, useMemo, useState } from "react";
import { apiRequest, type ApiError } from "../api/client";
import { fromUrlSearch, toApiQuery, type CatalogFilters } from "../api/catalogQuery";
import type { Department, ProductListPage, ProductMaster, ResilienceSource } from "../types/product";

export interface CatalogState {
  filters: CatalogFilters;
  page: ProductListPage | null;
  /** True while a (new) request is in flight; `page` keeps showing the previous results meanwhile. */
  isFetching: boolean;
  error: ApiError | null;
  isFallback: boolean;
  status: { source: ResilienceSource; retrievedAt: string } | null;
  refetch: () => void;
}

/**
 * Fetches one page of products for the filters in the address bar. The URL is
 * the source of truth (so views can be linked and the back button works); the
 * previous results stay on screen while the next ones load, so the grid
 * doesn't flash empty on every click.
 */
export function useCatalog(search: string, enabled = true, storeId?: string | null): CatalogState {
  const filters = useMemo(() => {
    const f = fromUrlSearch(search);
    if (storeId) f.storeId = storeId;
    return f;
  }, [search, storeId]);
  const apiQuery = useMemo(() => toApiQuery(filters), [filters]);

  const [page, setPage] = useState<ProductListPage | null>(null);
  // Which request the current `page` answers. While it differs from the wanted one, we are fetching.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [status, setStatus] = useState<CatalogState["status"]>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const requestKey = `${apiQuery}#${reloadKey}`;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    apiRequest<ProductListPage>(`/products?${apiQuery}`, { signal: controller.signal })
      .then((result) => {
        if (result.ok) {
          setPage(result.data);
          setError(null);
          setIsFallback(result.isFallback);
          setStatus({ source: result.source, retrievedAt: result.retrievedAt });
        } else {
          setError(result);
        }
        setLoadedKey(`${apiQuery}#${reloadKey}`);
      })
      .catch(() => {
        // Aborted: a newer request has taken over.
      });

    return () => controller.abort();
  }, [apiQuery, reloadKey, enabled]);

  return { filters, page, isFetching: enabled && loadedKey !== requestKey, error, isFallback, status, refetch: () => setReloadKey((key) => key + 1) };
}

/** The department tree (names, emoji, counts) for the "Shop by category" tiles. Loaded once. */
export function useDepartments(): Department[] {
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<Department[]>("/catalog/departments").then((result) => {
      if (!cancelled && result.ok) setDepartments(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return departments;
}

/** This week's finds, for the landing page's featured row. */
export function useWeeklyFinds(count = 8): ProductMaster[] {
  const [items, setItems] = useState<ProductMaster[]>([]);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<ProductListPage>(`/products?weeklyFinds=true&inStock=true&sort=rating&pageSize=${count}`).then((result) => {
      if (!cancelled && result.ok) setItems(result.data.items);
    });
    return () => {
      cancelled = true;
    };
  }, [count]);

  return items;
}
