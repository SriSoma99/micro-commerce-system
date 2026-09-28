import { useEffect, useState } from "react";
import { hasActiveFilters, PAGE_SIZE, type CatalogFilters } from "../api/catalogQuery";
import type { CatalogState } from "../hooks/useCatalog";
import type { Department, ProductCategory, ProductMaster, ProductSort } from "../types/product";
import { ActiveFilters } from "./ActiveFilters";
import { DepartmentTiles } from "./DepartmentTiles";
import { Pagination } from "./Pagination";
import { ProductCard } from "./ProductCard";
import { Sidebar } from "./Sidebar";

interface ShopPageProps {
  catalog: CatalogState;
  departments: Department[];
  weeklyFinds: ProductMaster[];
  onFiltersChange: (patch: Partial<CatalogFilters>) => void;
  onClear: () => void;
  onOpenProduct: (productId: string) => void;
  onAddProduct: (product: ProductMaster) => void;
}

const SORT_LABELS: Record<ProductSort, string> = {
  relevance: "Best match",
  popular: "Most popular",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  rating: "Avg. customer review",
  name: "Name: A to Z",
  "unit-price-asc": "Unit price: low to high",
};

export function ShopPage({ catalog, departments, weeklyFinds, onFiltersChange, onClear, onOpenProduct, onAddProduct }: ShopPageProps) {
  const { filters, page, isFetching, error, isFallback } = catalog;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const active = hasActiveFilters(filters);
  const departmentName = departments.find((d) => d.id === filters.category)?.name ?? null;

  // Moving to another page of results should start at the top.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [filters.page]);

  const sorts: ProductSort[] = filters.q.trim() ? ["relevance", "popular", "price-asc", "price-desc", "rating", "name", "unit-price-asc"] : ["popular", "price-asc", "price-desc", "rating", "name", "unit-price-asc"];
  const showLanding = !active && filters.page === 1;

  return (
    <div className="page shop">
      <aside className={`shop__sidebar${filtersOpen ? " is-open" : ""}`} aria-label="Filters">
        <Sidebar filters={filters} facets={page?.facets ?? null} onChange={onFiltersChange} onClear={onClear} canClear={active} />
        <button type="button" className="btn btn--primary btn--block shop__apply" onClick={() => setFiltersOpen(false)}>
          Show {page?.total != null ? page.total.toLocaleString() : ""} results
        </button>
      </aside>

      <section className="shop__main" aria-busy={isFetching}>
        {showLanding && (
          <>
            <DepartmentTiles departments={departments} onSelect={(category: ProductCategory) => onFiltersChange({ category })} />

            {weeklyFinds.length > 0 && (
              <section aria-labelledby="finds-heading">
                <h2 id="finds-heading" className="section-title">
                  This week's finds <span className="section-title__note">Here today, gone when they're gone</span>
                </h2>
                <div className="strip">
                  {weeklyFinds.map((product) => (
                    <ProductCard key={product.id} product={product} onOpen={onOpenProduct} onAdd={onAddProduct} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <div className="results-bar">
          <div>
            <h2 className="results-bar__title">{filters.q.trim() ? `Results for “${filters.q.trim()}”` : departmentName ?? (active ? "Results" : "All products")}</h2>
            <p>{page?.total != null ? `${page.total.toLocaleString()} ${page.total === 1 ? "product" : "products"}` : "Loading…"}</p>
          </div>
          <div className="results-bar__controls">
            <button type="button" className="btn btn--secondary btn--sm shop__filters-toggle" onClick={() => setFiltersOpen(true)}>
              Filters{active ? " •" : ""}
            </button>
            <label className="sort">
              <span className="sr-only">Sort by</span>
              <select value={filters.sort} onChange={(e) => onFiltersChange({ sort: e.target.value as ProductSort })} aria-label="Sort by">
                {sorts.map((sort) => (
                  <option key={sort} value={sort}>
                    {SORT_LABELS[sort]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <ActiveFilters filters={filters} departmentName={departmentName} onChange={onFiltersChange} />

        {isFallback && <div className="notice notice--warning">The live catalog is unavailable, so you're seeing a saved copy while the circuit breaker recovers. Prices and stock may be out of date.</div>}

        {error && !page && (
          <div className="page-state">
            <p>We couldn't load the products.</p>
            <p>{error.message}</p>
            <button type="button" className="btn btn--primary" onClick={catalog.refetch}>
              Try again
            </button>
          </div>
        )}

        {page && page.items.length === 0 && (
          <div className="page-state">
            <h3>No products match</h3>
            <p>Try removing a filter or searching for something else.</p>
            {active && (
              <button type="button" className="btn btn--secondary" onClick={onClear}>
                Clear all filters
              </button>
            )}
          </div>
        )}

        {page && page.items.length > 0 && (
          <div className={`grid${isFetching ? " is-loading" : ""}`}>
            {page.items.map((product) => (
              <ProductCard key={product.id} product={product} onOpen={onOpenProduct} onAdd={onAddProduct} />
            ))}
          </div>
        )}

        {page && <Pagination page={page.page} total={page.total} pageSize={PAGE_SIZE} onPage={(next) => onFiltersChange({ page: next })} />}
      </section>
    </div>
  );
}
