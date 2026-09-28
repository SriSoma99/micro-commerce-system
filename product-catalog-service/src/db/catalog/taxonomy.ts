import { ProductCategory } from "../../types/product";

export interface Department {
  id: ProductCategory;
  name: string;
  emoji: string;
  /** Soft gradient used for generated product tiles (light, dark). */
  colors: [string, string];
  /** Fictional store-brand for this department (no real trademarks). */
  privateLabel: string;
}

export const DEPARTMENTS: Department[] = [
  { id: "produce", name: "Fresh Produce", emoji: "🥬", colors: ["#e6f4d9", "#bfe3a0"], privateLabel: "Green Acre" },
  { id: "meat-seafood", name: "Meat & Seafood", emoji: "🥩", colors: ["#fde4e1", "#f4b0a8"], privateLabel: "Northfield Farms" },
  { id: "dairy-eggs", name: "Dairy & Eggs", emoji: "🥛", colors: ["#e8f1fb", "#b9d3f2"], privateLabel: "Green Meadow" },
  { id: "deli", name: "Deli & Prepared", emoji: "🥪", colors: ["#fff0d6", "#f7cf8b"], privateLabel: "Corner Table" },
  { id: "bakery", name: "Bakery", emoji: "🥖", colors: ["#fbebd4", "#eec48c"], privateLabel: "Golden Oven" },
  { id: "pantry", name: "Pantry", emoji: "🥫", colors: ["#f5e9d8", "#dcc09a"], privateLabel: "Pantry Basics" },
  { id: "frozen", name: "Frozen", emoji: "🧊", colors: ["#e0f3fa", "#a6d9ee"], privateLabel: "Frost Valley" },
  { id: "beverages", name: "Beverages", emoji: "🥤", colors: ["#e3f6f3", "#a5ddd3"], privateLabel: "Pure Sip" },
  { id: "snacks", name: "Snacks & Candy", emoji: "🍿", colors: ["#fff3cf", "#f6d971"], privateLabel: "Sunny Fields" },
  { id: "household", name: "Household", emoji: "🧻", colors: ["#eaeaf8", "#c3c3ea"], privateLabel: "HomeStar" },
  { id: "health-beauty", name: "Health & Beauty", emoji: "🧴", colors: ["#fbe6f1", "#efb3d4"], privateLabel: "Fresh Day" },
  { id: "baby", name: "Baby", emoji: "🍼", colors: ["#e9f5ff", "#b6dcfa"], privateLabel: "Little Sprouts" },
  { id: "pet", name: "Pet", emoji: "🐶", colors: ["#f1eadf", "#d3bf9f"], privateLabel: "Paws & Co" },
];

export const DEPARTMENT_BY_ID: Record<ProductCategory, Department> = Object.fromEntries(
  DEPARTMENTS.map((department) => [department.id, department])
) as Record<ProductCategory, Department>;

/** Fictional national brands mixed in with each store brand. */
export const NATIONAL_BRANDS = ["Bright Table", "Kettle Ridge", "Summit Foods", "Old Mill", "Blue Harbor", "Casa Verde", "Oak & Vine"];

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
