import type { CatalogFilters } from "../api/catalogQuery";
import { formatMoney, titleCase } from "../utils/format";

interface ActiveFiltersProps {
  filters: CatalogFilters;
  departmentName: string | null;
  onChange: (patch: Partial<CatalogFilters>) => void;
}

/** The current selection as removable chips, so a shopper can always see (and undo) what is narrowing the results. */
export function ActiveFilters({ filters, departmentName, onChange }: ActiveFiltersProps) {
  const chips: { key: string; label: string; remove: Partial<CatalogFilters> }[] = [];

  if (filters.q.trim()) chips.push({ key: "q", label: `“${filters.q.trim()}”`, remove: { q: "" } });
  if (filters.category) chips.push({ key: "category", label: departmentName ?? titleCase(filters.category), remove: { category: null } });
  if (filters.subcategory) chips.push({ key: "sub", label: titleCase(filters.subcategory), remove: { subcategory: null } });
  for (const brand of filters.brands) chips.push({ key: `b-${brand}`, label: brand, remove: { brands: filters.brands.filter((b) => b !== brand) } });
  for (const tag of filters.dietary) chips.push({ key: `d-${tag}`, label: titleCase(tag), remove: { dietary: filters.dietary.filter((t) => t !== tag) } });
  if (filters.minPrice !== null || filters.maxPrice !== null) {
    const range = `${formatMoney(filters.minPrice ?? 0)} – ${filters.maxPrice !== null ? formatMoney(filters.maxPrice) : "up"}`;
    chips.push({ key: "price", label: range, remove: { minPrice: null, maxPrice: null } });
  }
  if (filters.minRating !== null) chips.push({ key: "rating", label: `${filters.minRating}★ & up`, remove: { minRating: null } });
  if (filters.snap) chips.push({ key: "snap", label: "SNAP eligible", remove: { snap: false } });
  if (filters.weeklyFinds) chips.push({ key: "finds", label: "Weekly finds", remove: { weeklyFinds: false } });
  if (filters.inStock) chips.push({ key: "stock", label: "In stock", remove: { inStock: false } });

  if (chips.length === 0) return null;
  return (
    <ul className="chips" aria-label="Active filters">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button type="button" className="chip" onClick={() => onChange(chip.remove)} aria-label={`Remove filter ${chip.label}`}>
            {chip.label} <span aria-hidden="true">×</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
