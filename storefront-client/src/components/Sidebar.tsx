import type { CatalogFilters } from "../api/catalogQuery";
import type { DietaryTag, ProductFacets } from "../types/product";
import { formatMoney, titleCase } from "../utils/format";

interface SidebarProps {
  filters: CatalogFilters;
  facets: ProductFacets | null;
  onChange: (patch: Partial<CatalogFilters>) => void;
  onClear: () => void;
  canClear: boolean;
}

const toggle = <T,>(list: T[], value: T): T[] => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

/**
 * The Amazon-style filter column: department tree, quick toggles, brand,
 * dietary, rating and price. All counts come from the server's facets and
 * already reflect the current selection (each facet ignores its own filter).
 */
export function Sidebar({ filters, facets, onChange, onClear, canClear }: SidebarProps) {
  if (!facets) {
    return (
      <div className="sidebar">
        <div className="notice notice--warning">Filters are unavailable while the catalog is running from its cached copy. Browsing and search still work.</div>
      </div>
    );
  }

  const activePrice = facets.priceRanges.find((range) => filters.minPrice === range.minMinor && filters.maxPrice === range.maxMinor);

  return (
    <div className="sidebar">
      <div className="sidebar__head">
        <h2>Filters</h2>
        {canClear && (
          <button type="button" className="link-button" onClick={onClear}>
            Clear all
          </button>
        )}
      </div>

      <fieldset className="facet">
        <legend>Department</legend>
        <ul className="facet__list">
          <li>
            <button type="button" className={`facet__link${filters.category === null ? " is-active" : ""}`} onClick={() => onChange({ category: null })}>
              All departments
            </button>
          </li>
          {facets.categories.map((category) => (
            <li key={category.id}>
              <button type="button" className={`facet__link${filters.category === category.id ? " is-active" : ""}`} onClick={() => onChange({ category: category.id as CatalogFilters["category"] })}>
                <span>{category.name}</span>
                <span className="facet__count">{category.count}</span>
              </button>
              {filters.category === category.id && facets.subcategories.length > 0 && (
                <ul className="facet__sub">
                  {facets.subcategories.map((sub) => (
                    <li key={sub.id}>
                      <button type="button" className={`facet__link${filters.subcategory === sub.id ? " is-active" : ""}`} onClick={() => onChange({ subcategory: filters.subcategory === sub.id ? null : sub.id })}>
                        <span>{sub.name}</span>
                        <span className="facet__count">{sub.count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="facet">
        <legend>Availability</legend>
        <label className="check">
          <input type="checkbox" checked={filters.inStock} onChange={(e) => onChange({ inStock: e.target.checked })} />
          <span>In stock</span>
          <span className="facet__count">{facets.inStock}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.snap} onChange={(e) => onChange({ snap: e.target.checked })} />
          <span>SNAP / EBT eligible</span>
          <span className="facet__count">{facets.snapEligible}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.weeklyFinds} onChange={(e) => onChange({ weeklyFinds: e.target.checked })} />
          <span>This week's finds</span>
          <span className="facet__count">{facets.weeklyFinds}</span>
        </label>
      </fieldset>

      {facets.brands.length > 0 && (
        <fieldset className="facet">
          <legend>Brand</legend>
          {facets.brands.slice(0, 8).map((brand) => (
            <label key={brand.id} className="check">
              <input type="checkbox" checked={filters.brands.includes(brand.id)} onChange={() => onChange({ brands: toggle(filters.brands, brand.id) })} />
              <span>{brand.name}</span>
              <span className="facet__count">{brand.count}</span>
            </label>
          ))}
        </fieldset>
      )}

      {facets.dietary.length > 0 && (
        <fieldset className="facet">
          <legend>Dietary</legend>
          {facets.dietary.map((tag) => (
            <label key={tag.id} className="check">
              <input type="checkbox" checked={filters.dietary.includes(tag.id as DietaryTag)} onChange={() => onChange({ dietary: toggle(filters.dietary, tag.id as DietaryTag) })} />
              <span>{titleCase(tag.name)}</span>
              <span className="facet__count">{tag.count}</span>
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="facet">
        <legend>Customer reviews</legend>
        <ul className="facet__list">
          {facets.ratings.map((rating) => (
            <li key={rating.minRating}>
              <button type="button" className={`facet__link${filters.minRating === rating.minRating ? " is-active" : ""}`} onClick={() => onChange({ minRating: filters.minRating === rating.minRating ? null : rating.minRating })}>
                <span>
                  <span className="stars-inline" aria-hidden="true">
                    {"★".repeat(rating.minRating)}
                    {"☆".repeat(5 - rating.minRating)}
                  </span>{" "}
                  &amp; up
                </span>
                <span className="facet__count">{rating.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="facet">
        <legend>Price</legend>
        <ul className="facet__list">
          {facets.priceRanges.map((range) => (
            <li key={range.id}>
              <button
                type="button"
                className={`facet__link${activePrice?.id === range.id ? " is-active" : ""}`}
                onClick={() => onChange(activePrice?.id === range.id ? { minPrice: null, maxPrice: null } : { minPrice: range.minMinor, maxPrice: range.maxMinor })}
              >
                <span>{range.name}</span>
                <span className="facet__count">{range.count}</span>
              </button>
            </li>
          ))}
        </ul>
        {(filters.minPrice !== null || filters.maxPrice !== null) && !activePrice && (
          <p className="facet__note">
            {formatMoney(filters.minPrice ?? 0)} – {filters.maxPrice !== null ? formatMoney(filters.maxPrice) : "any"}
          </p>
        )}
      </fieldset>
    </div>
  );
}
