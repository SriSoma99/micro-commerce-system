export type GrnStatus = "draft" | "received" | "cancelled";
export type TransferStatus = "pending" | "completed" | "cancelled";
export type AdjustmentReason = "shrinkage" | "damage" | "expired" | "audit";

export interface GoodsReceiptItem {
  id: string;
  grnId: string;
  productId: string;
  productName?: string;
  quantity: number;
  unitCostMinor: number;
  batchNumber: string;
  expiryDate: string;
  createdAt: string;
}

export interface GoodsReceipt {
  id: string;
  grnNumber: string;
  storeId: string;
  supplier: string;
  poReference: string;
  status: GrnStatus;
  totalCostMinor: number;
  receivedBy: string;
  receivedAt: string;
  notes?: string | null;
  items: GoodsReceiptItem[];
}

export interface StoreInventoryRecord {
  storeId: string;
  productId: string;
  productName: string;
  brand: string;
  department: string;
  stock: number;
  reserved: number;
  available: number;
  unitCostMinor: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  updatedAt: string;
}

export interface StockTransfer {
  id: string;
  transferNumber: string;
  fromStoreId: string;
  toStoreId: string;
  productId: string;
  productName?: string;
  quantity: number;
  status: TransferStatus;
  createdAt: string;
  completedAt?: string | null;
}

export interface StockAdjustment {
  id: string;
  storeId: string;
  productId: string;
  productName?: string;
  quantityDelta: number;
  reason: AdjustmentReason;
  adjustedBy: string;
  createdAt: string;
}

export interface GrnItemInput {
  productId: string;
  quantity: number;
  unitCostMinor: number;
  batchNumber: string;
  expiryDate: string;
}

export interface CreateGrnInput {
  storeId: string;
  supplier: string;
  poReference: string;
  notes?: string;
  items: GrnItemInput[];
}

export interface CsvGrnRow {
  sku: string;
  supplier: string;
  po_reference: string;
  quantity: number;
  unit_cost: number;
  batch: string;
  expiry: string;
}
