import type Database from "better-sqlite3";
import { DEPARTMENTS, DEPARTMENT_BY_ID } from "../db/catalog/taxonomy";
import { DietaryTag, FacetCount, ProductFacets, ProductListPage, ProductQuery, ProductSort } from "../types/product";
import { ProductRow, loadTags, rowToMaster } from "./productMapper";

/**
 * SQL search over the catalog: SQLite FTS5 for keywords, plain WHERE clauses
 * for filters, and "disjunctive" facet counts for the sidebar. Only this file
 * (and the other `data/*Repository` files) speaks SQL.
 */

type FilterKey = "q" | "category" | "subcategory" | "brand" | "dietary" | "price" | "rating" | "snap" | "weekly" | "stock";

interface Filter {
  key: FilterKey;
  sql: string;
  params: unknown[];
}

/** Price buckets shown in the sidebar; bounds are inclusive cents. */
export const PRICE_RANGES: { id: string; name: string; minMinor: number; maxMinor: number | null }[] = [
  { id: "under-2", name: "Under $2", minMinor: 0, maxMinor: 199 },
  { id: "2-5", name: "$2 – $5", minMinor: 200, maxMinor: 499 },
  { id: "5-10", name: "$5 – $10", minMinor: 500, maxMinor: 999 },
  { id: "10-20", name: "$10 – $20", minMinor: 1000, maxMinor: 1999 },
  { id: "20-up", name: "$20 & up", minMinor: 2000, maxMinor: null },
];

const RATING_STEPS = [4, 3, 2, 1];

/**
 * Turns free text into an FTS5 prefix-AND expression ("2% mlk" -> `"2"* "mlk"*`).
 * Only letters and digits survive, which also makes the expression injection-safe.
 */
export function toFtsExpression(q: string | undefined): string | undefined {
  const tokens = (q ?? "").toLowerCase().match(/[a-z0-9]+/g)?.slice(0, 8) ?? [];
  return tokens.length > 0 ? tokens.map((token) => `"${token}"*`).join(" ") : undefined;
}

function buildFilters(query: ProductQuery, fts: string | undefined): Filter[] {
  const filters: Filter[] = [];
  if (fts) {
    filters.push({ key: "q", sql: "p.id IN (SELECT id FROM products_fts WHERE products_fts MATCH ?)", params: [fts] });
  }
  if (query.category) filters.push({ key: "category", sql: "p.category = ?", params: [query.category] });
  if (query.subcategory) filters.push({ key: "subcategory", sql: "p.subcategory = ?", params: [query.subcategory] });
  if (query.brands && query.brands.length > 0) {
    filters.push({ key: "brand", sql: `p.brand IN (${query.brands.map(() => "?").join(",")})`, params: query.brands });
  }
  for (const tag of query.dietary ?? []) {
    filters.push({
      key: "dietary",
      sql: "EXISTS (SELECT 1 FROM product_tags t WHERE t.product_id = p.id AND t.tag = ?)",
      params: [tag],
    });
  }
  if (query.minPriceMinor !== undefined) filters.push({ key: "price", sql: "p.price_minor >= ?", params: [query.minPriceMinor] });
  if (query.maxPriceMinor !== undefined) filters.push({ key: "price", sql: "p.price_minor <= ?", params: [query.maxPriceMinor] });
  if (query.minRating !== undefined) filters.push({ key: "rating", sql: "p.rating_avg >= ?", params: [query.minRating] });
  if (query.snapEligible) filters.push({ key: "snap", sql: "p.snap_eligible = 1", params: [] });
  if (query.weeklyFinds) filters.push({ key: "weekly", sql: "p.is_weekly_find = 1", params: [] });
  if (query.inStock) {
    if (query.storeId) {
      filters.push({
        key: "stock",
        sql: "COALESCE((SELECT stock FROM store_inventory WHERE store_id = ? AND product_id = p.id), p.stock) > 0",
        params: [query.storeId],
      });
    } else {
      filters.push({ key: "stock", sql: "p.stock > 0", params: [] });
    }
  }
  return filters;
}

function where(filters: Filter[], exclude: FilterKey[] = [], extra?: string): { sql: string; params: unknown[] } {
  const active = filters.filter((filter) => !exclude.includes(filter.key));
  const clauses = [...active.map((filter) => `(${filter.sql})`), ...(extra ? [extra] : [])];
  return { sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "", params: active.flatMap((filter) => filter.params) };
}

const ORDER_BY: Record<Exclude<ProductSort, "relevance">, string> = {
  popular: "p.rating_count DESC, p.id",
  "price-asc": "p.price_minor ASC, p.id",
  "price-desc": "p.price_minor DESC, p.id",
  rating: "p.rating_avg DESC, p.rating_count DESC, p.id",
  name: "p.name COLLATE NOCASE ASC, p.id",
  "unit-price-asc": "p.unit_minor ASC, p.id",
};

// ---- Facets -----------------------------------------------------------------------

/**
 * Each facet is counted with every filter EXCEPT its own, so choosing a brand
 * doesn't collapse the brand list to that one brand (standard "disjunctive"
 * faceting, as on Amazon).
 */
function computeFacets(db: Database.Database, query: ProductQuery, filters: Filter[]): ProductFacets {
  const count = (exclude: FilterKey[], extra?: string): number => {
    const w = where(filters, exclude, extra);
    return (db.prepare(`SELECT COUNT(*) AS c FROM products p ${w.sql}`).get(...w.params) as { c: number }).c;
  };

  const categoryWhere = where(filters, ["category", "subcategory"]);
  const categoryCounts = new Map(
    (
      db.prepare(`SELECT p.category AS id, COUNT(*) AS c FROM products p ${categoryWhere.sql} GROUP BY p.category`).all(
        ...categoryWhere.params
      ) as { id: string; c: number }[]
    ).map((row) => [row.id, row.c])
  );
  const categories: FacetCount[] = DEPARTMENTS.filter(
    (department) => (categoryCounts.get(department.id) ?? 0) > 0 || department.id === query.category
  ).map((department) => ({ id: department.id, name: department.name, count: categoryCounts.get(department.id) ?? 0 }));

  let subcategories: FacetCount[] = [];
  if (query.category) {
    const w = where(filters, ["subcategory"]);
    subcategories = (
      db
        .prepare(
          `SELECT p.subcategory AS id, p.subcategory_name AS name, COUNT(*) AS count
             FROM products p ${w.sql} GROUP BY p.subcategory ORDER BY p.subcategory_name`
        )
        .all(...w.params) as FacetCount[]
    ).filter((row) => row.count > 0);
  }

  const brandWhere = where(filters, ["brand"]);
  const brands = db
    .prepare(
      `SELECT p.brand AS id, p.brand AS name, COUNT(*) AS count
         FROM products p ${brandWhere.sql} GROUP BY p.brand ORDER BY count DESC, p.brand LIMIT 25`
    )
    .all(...brandWhere.params) as FacetCount[];

  const dietaryWhere = where(filters, ["dietary"]);
  const dietary = db
    .prepare(
      `SELECT t.tag AS id, t.tag AS name, COUNT(DISTINCT p.id) AS count
         FROM products p JOIN product_tags t ON t.product_id = p.id ${dietaryWhere.sql}
        GROUP BY t.tag ORDER BY count DESC, t.tag`
    )
    .all(...dietaryWhere.params) as FacetCount[];

  const ratingWhere = where(filters, ["rating"]);
  const ratingRow = db
    .prepare(
      `SELECT ${RATING_STEPS.map((step) => `COALESCE(SUM(p.rating_avg >= ${step}), 0) AS r${step}`).join(", ")}
         FROM products p ${ratingWhere.sql}`
    )
    .get(...ratingWhere.params) as Record<string, number>;

  const priceWhere = where(filters, ["price"]);
  const priceRow = db
    .prepare(
      `SELECT ${PRICE_RANGES.map(
        (range) =>
          `COALESCE(SUM(p.price_minor >= ${range.minMinor}${range.maxMinor === null ? "" : ` AND p.price_minor <= ${range.maxMinor}`}), 0) AS "${range.id}"`
      ).join(", ")}
         FROM products p ${priceWhere.sql}`
    )
    .get(...priceWhere.params) as Record<string, number>;

  return {
    categories,
    subcategories,
    brands: brands.map((brand) => ({ ...brand, name: brand.id })),
    dietary: dietary.map((tag) => ({ ...tag, name: tag.id as DietaryTag })),
    ratings: RATING_STEPS.map((step) => ({ minRating: step, count: ratingRow[`r${step}`] ?? 0 })),
    priceRanges: PRICE_RANGES.map((range) => ({ ...range, count: priceRow[range.id] ?? 0 })),
    snapEligible: count(["snap"], "p.snap_eligible = 1"),
    weeklyFinds: count(["weekly"], "p.is_weekly_find = 1"),
    inStock: query.storeId
      ? count(
          ["stock"],
          "COALESCE((SELECT stock FROM store_inventory WHERE store_id = '" + query.storeId.replace(/'/g, "''") + "' AND product_id = p.id), p.stock) > 0"
        )
      : count(["stock"], "p.stock > 0"),
  };
}

// ---- Query ------------------------------------------------------------------------

export function queryProducts(db: Database.Database, query: ProductQuery): ProductListPage {
  const fts = toFtsExpression(query.q);
  const filters = buildFilters(query, fts);

  // With a keyword and sort=relevance, join the FTS ranking in (which also
  // performs the match), instead of the plain IN-subquery filter.
  const ranked = query.sort === "relevance" && fts !== undefined;
  const pageWhere = where(filters, ranked ? ["q"] : []);
  
  let from = ranked
    ? `products p JOIN (SELECT id, bm25(products_fts, 0, 10, 4, 1, 3, 0.5) AS score
                          FROM products_fts WHERE products_fts MATCH ?) r ON r.id = p.id`
    : "products p";

  if (query.storeId) {
    from += " LEFT JOIN store_inventory si ON si.product_id = p.id AND si.store_id = ?";
  }

  const orderBy = ranked ? "r.score ASC, p.rating_count DESC, p.id" : ORDER_BY[query.sort === "relevance" ? "popular" : query.sort];

  const selectCols = query.storeId
    ? "p.*, si.store_id, COALESCE(si.stock, p.stock) AS store_stock, COALESCE(si.reserved, 0) AS store_reserved"
    : "p.*";

  const params: unknown[] = [
    ...(ranked ? [fts] : []),
    ...(query.storeId ? [query.storeId] : []),
    ...pageWhere.params,
    query.pageSize,
    (query.page - 1) * query.pageSize,
  ];

  const rows = db
    .prepare(`SELECT ${selectCols} FROM ${from} ${pageWhere.sql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params) as ProductRow[];

  const totalWhere = where(filters);
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM products p ${totalWhere.sql}`).get(...totalWhere.params) as {
    total: number;
  };

  const tags = loadTags(db, rows.map((row) => row.id));
  return {
    items: rows.map((row) => rowToMaster(row, tags.get(row.id) ?? [])),
    total,
    page: query.page,
    pageSize: query.pageSize,
    facets: computeFacets(db, query, filters),
  };
}

/** Department tree with live counts, for navigation and the "Shop by category" tiles. */
export function queryDepartments(db: Database.Database): {
  id: string;
  name: string;
  emoji: string;
  colors: [string, string];
  count: number;
  subcategories: FacetCount[];
}[] {
  const rows = db
    .prepare(
      `SELECT category, subcategory AS id, subcategory_name AS name, COUNT(*) AS count
         FROM products GROUP BY category, subcategory ORDER BY subcategory_name`
    )
    .all() as { category: string; id: string; name: string; count: number }[];

  return DEPARTMENTS.map((department) => {
    const subcategories = rows.filter((row) => row.category === department.id).map(({ id, name, count }) => ({ id, name, count }));
    return {
      id: department.id,
      name: DEPARTMENT_BY_ID[department.id].name,
      emoji: department.emoji,
      colors: department.colors,
      count: subcategories.reduce((sum, sub) => sum + sub.count, 0),
      subcategories,
    };
  });
}
