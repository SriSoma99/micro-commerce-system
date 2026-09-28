import { Request, Response } from "express";
import { findProductImageSpec } from "../data/productRepository";
import { DEPARTMENT_BY_ID } from "../db/catalog/taxonomy";
import { getDepartments, getProductDetail, getProductList } from "../services/catalogService";
import { DietaryTag, ProductCategory, ProductQuery, ProductSort } from "../types/product";
import { renderProductImage } from "../utils/productImage";

const SORTS: ProductSort[] = ["relevance", "popular", "price-asc", "price-desc", "rating", "name", "unit-price-asc"];
const DIETARY: DietaryTag[] = ["organic", "vegan", "vegetarian", "gluten-free", "dairy-free", "keto"];
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

/** `?brand=A&brand=B` arrives as an array, `?brand=A` as a string. */
function asList(value: unknown): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

function asFlag(value: unknown, name: string, errors: string[]): boolean {
  if (value === undefined || value === "false" || value === "0") return false;
  if (value === "true" || value === "1") return true;
  errors.push(`${name} must be true or false`);
  return false;
}

function asInt(value: unknown, name: string, errors: string[], min: number, max = Number.MAX_SAFE_INTEGER): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (typeof value !== "string" || value.trim() === "" || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push(`${name} must be an integer between ${min} and ${max === Number.MAX_SAFE_INTEGER ? "a large number" : max}`);
    return undefined;
  }
  return parsed;
}

/**
 * Hand-checked at the HTTP boundary, same approach as the cart controller.
 * Everything downstream (SQL builder, fallback search) can trust the result.
 */
function parseProductQuery(raw: Request["query"]): { query: ProductQuery } | { errors: string[] } {
  const errors: string[] = [];

  const q = typeof raw.q === "string" ? raw.q.trim() : undefined;
  if (raw.q !== undefined && (typeof raw.q !== "string" || raw.q.length > 100)) errors.push("q must be a string of at most 100 characters");

  let category: ProductCategory | undefined;
  if (raw.category !== undefined) {
    if (typeof raw.category === "string" && raw.category in DEPARTMENT_BY_ID) category = raw.category as ProductCategory;
    else errors.push(`category must be one of: ${Object.keys(DEPARTMENT_BY_ID).join(", ")}`);
  }

  let subcategory: string | undefined;
  if (raw.subcategory !== undefined) {
    if (typeof raw.subcategory === "string" && /^[a-z0-9-]{1,60}$/.test(raw.subcategory)) subcategory = raw.subcategory;
    else errors.push("subcategory must be a lowercase slug");
  }

  const brands = asList(raw.brand);
  if (brands.length > 10 || brands.some((brand) => brand.length === 0 || brand.length > 60)) errors.push("brand must be at most 10 values of 1-60 characters");

  const dietary = asList(raw.dietary);
  const badDietary = dietary.filter((tag) => !DIETARY.includes(tag as DietaryTag));
  if (badDietary.length > 0) errors.push(`dietary must be any of: ${DIETARY.join(", ")}`);

  const minPriceMinor = asInt(raw.minPrice, "minPrice", errors, 0);
  const maxPriceMinor = asInt(raw.maxPrice, "maxPrice", errors, 0);
  if (minPriceMinor !== undefined && maxPriceMinor !== undefined && minPriceMinor > maxPriceMinor) errors.push("minPrice must not exceed maxPrice");

  const minRating = asInt(raw.minRating, "minRating", errors, 1, 5);

  const snapEligible = asFlag(raw.snap, "snap", errors);
  const weeklyFinds = asFlag(raw.weeklyFinds, "weeklyFinds", errors);
  const inStock = asFlag(raw.inStock, "inStock", errors);
  const storeId = typeof raw.storeId === "string" && raw.storeId.trim() !== "" ? raw.storeId.trim() : undefined;

  let sort: ProductSort = q ? "relevance" : "popular";
  if (raw.sort !== undefined) {
    if (typeof raw.sort === "string" && SORTS.includes(raw.sort as ProductSort)) sort = raw.sort as ProductSort;
    else errors.push(`sort must be one of: ${SORTS.join(", ")}`);
  }

  const page = asInt(raw.page, "page", errors, 1) ?? 1;
  const pageSize = asInt(raw.pageSize, "pageSize", errors, 1, MAX_PAGE_SIZE) ?? DEFAULT_PAGE_SIZE;

  if (errors.length > 0) return { errors };
  return {
    query: {
      ...(q ? { q } : {}),
      ...(category ? { category } : {}),
      ...(subcategory ? { subcategory } : {}),
      ...(brands.length > 0 ? { brands } : {}),
      ...(dietary.length > 0 ? { dietary: dietary as DietaryTag[] } : {}),
      ...(minPriceMinor !== undefined ? { minPriceMinor } : {}),
      ...(maxPriceMinor !== undefined ? { maxPriceMinor } : {}),
      ...(minRating !== undefined ? { minRating } : {}),
      ...(snapEligible ? { snapEligible } : {}),
      ...(weeklyFinds ? { weeklyFinds } : {}),
      ...(inStock ? { inStock } : {}),
      ...(storeId ? { storeId } : {}),
      sort,
      page,
      pageSize,
    },
  };
}

/**
 * GET /api/products
 * Server-side search, filters, sort and pagination over the Master
 * projection (never Detail-only fields), plus sidebar facet counts.
 * Query: q, category, subcategory, brand (repeatable), dietary (repeatable),
 * minPrice/maxPrice (cents), minRating (1-5), snap, weeklyFinds, inStock, storeId,
 * sort, page, pageSize.
 */
export async function listProducts(req: Request, res: Response): Promise<void> {
  const parsed = parseProductQuery(req.query);
  if ("errors" in parsed) {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "Invalid product query", details: parsed.errors });
    return;
  }

  const payload = await getProductList(parsed.query);
  res.status(200).json(payload);
}

/**
 * GET /api/products/:id
 * Returns the fully-hydrated Detail aggregate for a single product,
 * or 404 when no product matches the requested id (including on the
 * fallback path, where the stale snapshot is also searched by id).
 * Supports optional ?storeId query.
 */
export async function getProduct(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const storeId = typeof req.query.storeId === "string" && req.query.storeId.trim() !== "" ? req.query.storeId.trim() : undefined;
  const payload = await getProductDetail(id as string, storeId);

  if (!payload.data) {
    res.status(404).json({
      error: "NOT_FOUND",
      message: `No product found with id "${id}"`,
      isFallback: payload.isFallback,
      source: payload.source,
    });
    return;
  }

  res.status(200).json(payload);
}

/** GET /api/products/:id/image.svg - generated product tile (see utils/productImage.ts). */
export function getProductImage(req: Request, res: Response): void {
  const spec = findProductImageSpec(req.params.id as string);
  if (!spec) {
    res.status(404).json({ error: "NOT_FOUND", message: `No product found with id "${req.params.id}"` });
    return;
  }
  res.status(200).type("image/svg+xml").set("Cache-Control", "public, max-age=86400").send(renderProductImage(spec));
}

/** GET /api/catalog/departments - department tree with counts. */
export function listDepartments(_req: Request, res: Response): void {
  res.status(200).json(getDepartments());
}
