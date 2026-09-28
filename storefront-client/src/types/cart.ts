/** Client-side mirror of the backend's src/types/cart.ts. Money is integer cents. */

export interface CartLineItem {
  lineItemId: string;
  productId: string;
  name: string;
  thumbnail: string;
  /** Unit price in cents; for weight items this is per lb and `quantity` is pounds. */
  priceMinor: number;
  currency: string;
  quantity: number;
  sizeLabel: string;
  soldBy: "each" | "weight";
  taxCode: string;
  selectedConfiguration?: Record<string, string>;
}

export interface Cart {
  cartId: string;
  items: CartLineItem[];
  subtotalMinor: number;
  currency: string;
  itemCount: number;
  updatedAt: string;
}
