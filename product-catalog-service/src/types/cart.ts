/**
 * Domain model for the Cart & Checkout bounded context.
 *
 * A CartLineItem snapshots the product's name/thumbnail/price/currency/tax code at
 * add-time rather than re-joining against the catalog on every read: a
 * price change in the catalog should never retroactively change what's
 * already sitting in someone's cart, and it means cart reads never need to
 * re-run a (breaker-protected) product lookup. `lineItemId` is a derived,
 * stable identity for a product + selected configuration pairing - see
 * `services/cartService.ts` for how it's computed.
 */
export interface CartLineItem {
  lineItemId: string;
  productId: string;
  name: string;
  thumbnail: string;
  /** Unit price in minor units (cents). For `soldBy: "weight"` items this is per lb and `quantity` is pounds. */
  priceMinor: number;
  currency: string;
  quantity: number;
  sizeLabel: string;
  soldBy: "each" | "weight";
  /** Snapshotted so checkout can compute tax without re-reading the catalog. */
  taxCode: string;
  selectedConfiguration?: Record<string, string>;
}

export interface Cart {
  cartId: string;
  items: CartLineItem[];
  /** Sum of `priceMinor * quantity`, in minor units, before tax. */
  subtotalMinor: number;
  currency: string;
  itemCount: number;
  updatedAt: string;
}
