import {
  ConfigurationOption,
  DietaryTag,
  ProductCategory,
  ProductSpecification,
  SoldBy,
} from "../../types/product";
import { BaseItem, CATALOG } from "./catalogData";
import { DEPARTMENTS, NATIONAL_BRANDS, slugify } from "./taxonomy";

/** One fully-expanded SKU, ready to insert. Deterministic: same input, same output, every boot. */
export interface SeedProduct {
  id: string;
  name: string;
  brand: string;
  isPrivateLabel: boolean;
  category: ProductCategory;
  subcategory: string;
  subcategoryName: string;
  sizeLabel: string;
  soldBy: SoldBy;
  priceMinor: number;
  unitMinor: number;
  unitLabel: string;
  ratingAvg: number;
  ratingCount: number;
  snapEligible: boolean;
  isWeeklyFind: boolean;
  description: string;
  stock: number;
  taxCode: string;
  ageRestricted: boolean;
  emoji: string;
  specs: ProductSpecification[];
  options: ConfigurationOption[];
  tags: DietaryTag[];
}

// ---- Deterministic randomness -----------------------------------------------------
// Values are derived from each product's own identity (not from generation
// order), so adding a base item later never reshuffles the ratings, stock or
// price jitter of the products that were already there.

function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Formatting helpers -----------------------------------------------------------

function formatQuantity(qty: number): string {
  if (qty === 0.5) return "½";
  return String(qty);
}

function sizeLabelFor(item: BaseItem, qty: number): string {
  if (item.weight) return "per lb";
  if (item.unit === "each") return "each";
  return `${formatQuantity(qty)} ${item.unit}`;
}

/** Retail price points end in 9 (…49, …99): round to the nearest 10 cents, then drop 1. */
function retailPrice(rawMinor: number): number {
  return Math.max(49, Math.round(rawMinor / 10) * 10 - 1);
}

const STORAGE: Record<ProductCategory, string> = {
  produce: "Keep refrigerated",
  "meat-seafood": "Keep refrigerated",
  "dairy-eggs": "Keep refrigerated",
  deli: "Keep refrigerated",
  bakery: "Store in a cool, dry place",
  pantry: "Store in a cool, dry place",
  frozen: "Keep frozen",
  beverages: "Store in a cool, dry place",
  snacks: "Store in a cool, dry place",
  household: "Store in a cool, dry place",
  "health-beauty": "Store at room temperature",
  baby: "Store in a cool, dry place",
  pet: "Store in a cool, dry place",
};

const BLURB: Record<ProductCategory, string> = {
  produce: "Sourced for freshness and delivered to our stores throughout the week.",
  "meat-seafood": "Carefully trimmed and packed fresh for everyday cooking.",
  "dairy-eggs": "A refrigerated staple, checked for freshness before it reaches the shelf.",
  deli: "Made fresh for a quick lunch or an easy dinner.",
  bakery: "Baked for everyday meals, from breakfast to dessert.",
  pantry: "A dependable pantry staple at an everyday low price.",
  frozen: "Flash-frozen to lock in flavor, ready when you are.",
  beverages: "A refreshing choice for the whole household.",
  snacks: "A crowd-pleasing snack for lunchboxes, road trips and movie nights.",
  household: "An everyday essential for keeping the home running smoothly.",
  "health-beauty": "Everyday care at a fraction of the name-brand price.",
  baby: "Gentle, dependable essentials for the little ones.",
  pet: "Complete, balanced nutrition and care for the four-legged family.",
};

function displayName(item: BaseItem, brand: string, variety: string | undefined): string {
  const core =
    variety === undefined
      ? item.name
      : item.vpos === "replace"
        ? variety
        : item.vpos === "suffix"
          ? `${item.name} ${variety}`
          : `${variety} ${item.name}`;
  return `${brand} ${core}`;
}

// ---- Generator --------------------------------------------------------------------

/** How many of the ~2,000 SKUs are featured as this week's "finds". */
const WEEKLY_FIND_EVERY = 45;

export function generateCatalog(): SeedProduct[] {
  const products: SeedProduct[] = [];
  let counter = 0;

  for (const department of DEPARTMENTS) {
    const items = CATALOG[department.id];

    items.forEach((item, itemIndex) => {
      const nationalCount = item.nb ?? 1;
      const nationalStart = hash32(item.name) % NATIONAL_BRANDS.length;
      const brands = [
        department.privateLabel,
        ...Array.from({ length: nationalCount }, (_, k) => NATIONAL_BRANDS[(nationalStart + k + itemIndex) % NATIONAL_BRANDS.length] as string),
      ];
      const varieties: (string | undefined)[] = item.varieties && item.varieties.length > 0 ? item.varieties : [undefined];
      const allSizes = item.weight ? ([[1, 1]] as [number, number][]) : item.sizes;

      for (const brand of brands) {
        const isPrivateLabel = brand === department.privateLabel;
        // A discounter stocks one size of each national brand but the full range
        // of its own label - that is what keeps private label the clear majority.
        const sizes = isPrivateLabel ? allSizes : allSizes.slice(0, 1);
        for (const variety of varieties) {
          const seenSizeLabels = new Set<string>();
          for (const [qty, multiplier] of sizes) {
            const sizeLabel = sizeLabelFor(item, qty);
            if (seenSizeLabels.has(sizeLabel)) continue;
            seenSizeLabels.add(sizeLabel);

            const name = displayName(item, brand, variety);
            const rand = mulberry32(hash32(`${name}|${sizeLabel}`));
            const identityHash = hash32(`${name}|${sizeLabel}|weekly`);

            // Store brands undercut national brands by roughly a third.
            const brandFactor = isPrivateLabel ? 1 : 1.3 + rand() * 0.15;
            const priceMinor = retailPrice(item.price * multiplier * brandFactor * (0.96 + rand() * 0.1));
            const unitQty = item.weight || item.unit === "each" ? 1 : qty;

            const tags = new Set<DietaryTag>(item.tags ?? []);
            if (variety === "Organic") tags.add("organic");

            const ratingAvg = Math.min(4.9, Math.round((3.4 + rand() * 1.5) * 10) / 10);
            const ratingCount = Math.floor(5 + rand() ** 3 * 900);
            const stockRoll = rand();
            const stock = stockRoll < 0.04 ? 0 : stockRoll < 0.12 ? 1 + Math.floor(rand() * 8) : 20 + Math.floor(rand() * 240);

            counter += 1;
            products.push({
              id: `p-${String(counter).padStart(5, "0")}`,
              name: name,
              brand,
              isPrivateLabel,
              category: department.id,
              subcategory: slugify(item.sub),
              subcategoryName: item.sub,
              sizeLabel,
              soldBy: item.weight ? "weight" : "each",
              priceMinor,
              unitMinor: priceMinor / unitQty,
              unitLabel: item.weight ? "lb" : item.unit,
              ratingAvg,
              ratingCount,
              snapEligible: !item.noSnap,
              isWeeklyFind: identityHash % WEEKLY_FIND_EVERY === 0,
              description:
                `${name}${sizeLabel === "each" || sizeLabel === "per lb" ? "" : `, ${sizeLabel}`}. ` +
                `${BLURB[department.id]}${isPrivateLabel ? " A store-brand favorite: the same everyday quality at a lower price." : ""}` +
                `${tags.size > 0 ? ` ${[...tags].map((t) => t.replace("-", " ")).join(", ")}.` : ""}`,
              stock,
              taxCode: item.tax,
              ageRestricted: false,
              emoji: item.emoji,
              specs: [
                { label: "Size", value: sizeLabel === "per lb" ? "Sold by the pound" : sizeLabel },
                { label: "Brand", value: brand },
                { label: "Department", value: department.name },
                { label: "Storage", value: STORAGE[department.id] },
                { label: "Country of origin", value: "United States" },
              ],
              options: item.options ?? [],
              tags: [...tags],
            });
          }
        }
      }
    });
  }

  return products;
}
