import type Database from "better-sqlite3";
import { DEPARTMENT_BY_ID } from "./taxonomy";
import { generateCatalog } from "./generateCatalog";

/** Seeds the generated grocery catalog into an EMPTY products table. Returns how many rows were inserted. */
export function seedCatalog(db: Database.Database): number {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM products").get() as { count: number };
  if (count > 0) return 0;

  const products = generateCatalog();

  const insertProduct = db.prepare(
    `INSERT INTO products (
       id, name, brand, is_private_label, category, subcategory, subcategory_name, size_label, sold_by,
       price_minor, currency, unit_minor, unit_label, rating_avg, rating_count, snap_eligible, is_weekly_find,
       description, stock, tax_code, age_restricted, emoji, specs_json, options_json
     ) VALUES (
       @id, @name, @brand, @isPrivateLabel, @category, @subcategory, @subcategoryName, @sizeLabel, @soldBy,
       @priceMinor, 'USD', @unitMinor, @unitLabel, @ratingAvg, @ratingCount, @snapEligible, @isWeeklyFind,
       @description, @stock, @taxCode, @ageRestricted, @emoji, @specsJson, @optionsJson
     )`
  );
  const insertTag = db.prepare("INSERT INTO product_tags (product_id, tag) VALUES (?, ?)");
  const insertFts = db.prepare(
    `INSERT INTO products_fts (id, name, brand, category_name, subcategory_name, description)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertStoreInventory = db.prepare(
    `INSERT INTO store_inventory (store_id, product_id, stock, reserved, unit_cost_minor, low_stock_threshold, updated_at)
     VALUES (?, ?, ?, 0, ?, 10, datetime('now'))`
  );

  const DEMO_STORE_IDS = ["IL-01", "IL-02", "OH-01", "OH-02", "PA-01"];

  db.transaction(() => {
    for (const product of products) {
      insertProduct.run({
        id: product.id,
        name: product.name,
        brand: product.brand,
        isPrivateLabel: product.isPrivateLabel ? 1 : 0,
        category: product.category,
        subcategory: product.subcategory,
        subcategoryName: product.subcategoryName,
        sizeLabel: product.sizeLabel,
        soldBy: product.soldBy,
        priceMinor: product.priceMinor,
        unitMinor: product.unitMinor,
        unitLabel: product.unitLabel,
        ratingAvg: product.ratingAvg,
        ratingCount: product.ratingCount,
        snapEligible: product.snapEligible ? 1 : 0,
        isWeeklyFind: product.isWeeklyFind ? 1 : 0,
        description: product.description,
        stock: product.stock,
        taxCode: product.taxCode,
        ageRestricted: product.ageRestricted ? 1 : 0,
        emoji: product.emoji,
        specsJson: JSON.stringify(product.specs),
        optionsJson: JSON.stringify(product.options),
      });
      for (const tag of product.tags) insertTag.run(product.id, tag);
      insertFts.run(
        product.id,
        product.name,
        product.brand,
        DEPARTMENT_BY_ID[product.category].name,
        product.subcategoryName,
        product.description
      );
      const unitCost = Math.round(product.priceMinor * 0.6);
      for (const storeId of DEMO_STORE_IDS) {
        insertStoreInventory.run(storeId, product.id, product.stock, unitCost);
      }
    }
  })();

  return products.length;
}
