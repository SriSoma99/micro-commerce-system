import type Database from "better-sqlite3";
import {
  ConfigurationOption,
  DietaryTag,
  ProductCategory,
  ProductDetail,
  ProductMaster,
  ProductSpecification,
  SoldBy,
} from "../types/product";

/** A `products` table row exactly as SQLite returns it. */
export interface ProductRow {
  id: string;
  name: string;
  brand: string;
  is_private_label: number;
  category: ProductCategory;
  subcategory: string;
  subcategory_name: string;
  size_label: string;
  sold_by: SoldBy;
  price_minor: number;
  currency: string;
  unit_minor: number;
  unit_label: string;
  rating_avg: number;
  rating_count: number;
  snap_eligible: number;
  is_weekly_find: number;
  description: string;
  stock: number;
  tax_code: string;
  age_restricted: number;
  emoji: string;
  specs_json: string;
  options_json: string;
  store_id?: string;
  store_stock?: number;
  store_reserved?: number;
}

const imagePath = (id: string): string => `/api/products/${id}/image.svg`;

export function rowToMaster(row: ProductRow, tags: DietaryTag[]): ProductMaster {
  return {
    id: row.id,
    name: row.name,
    thumbnail: imagePath(row.id),
    priceMinor: row.price_minor,
    currency: row.currency,
    category: row.category,
    subcategory: row.subcategory,
    brand: row.brand,
    isPrivateLabel: row.is_private_label === 1,
    sizeLabel: row.size_label,
    soldBy: row.sold_by,
    unitPrice: { minorPerUnit: row.unit_minor, unit: row.unit_label },
    rating: { average: row.rating_avg, reviewCount: row.rating_count },
    snapEligible: row.snap_eligible === 1,
    dietaryTags: tags,
    isWeeklyFind: row.is_weekly_find === 1,
    ...(row.store_id !== undefined ? { storeId: row.store_id } : {}),
    ...(row.store_stock !== undefined ? { storeStock: row.store_stock } : {}),
    ...(row.store_reserved !== undefined ? { storeReserved: row.store_reserved } : {}),
  };
}

export function rowToDetail(row: ProductRow, tags: DietaryTag[]): ProductDetail {
  return {
    ...rowToMaster(row, tags),
    description: row.description,
    stock: row.store_stock !== undefined ? row.store_stock : row.stock,
    specifications: JSON.parse(row.specs_json) as ProductSpecification[],
    configurationOptions: JSON.parse(row.options_json) as ConfigurationOption[],
    gallery: [imagePath(row.id)],
    taxCode: row.tax_code,
    ageRestricted: row.age_restricted === 1,
  };
}

/** Dietary tags for the given products in one query (or for every product when `ids` is omitted). */
export function loadTags(db: Database.Database, ids?: string[]): Map<string, DietaryTag[]> {
  const rows = (
    ids === undefined
      ? db.prepare("SELECT product_id, tag FROM product_tags ORDER BY tag").all()
      : ids.length === 0
        ? []
        : db
            .prepare(`SELECT product_id, tag FROM product_tags WHERE product_id IN (${ids.map(() => "?").join(",")}) ORDER BY tag`)
            .all(...ids)
  ) as { product_id: string; tag: DietaryTag }[];

  const byProduct = new Map<string, DietaryTag[]>();
  for (const { product_id, tag } of rows) {
    const list = byProduct.get(product_id);
    if (list) list.push(tag);
    else byProduct.set(product_id, [tag]);
  }
  return byProduct;
}
