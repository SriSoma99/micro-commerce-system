import { apiRequest, type ApiResult } from "./client";
import type {
  AdjustmentReason,
  CreateGrnInput,
  GoodsReceipt,
  StockAdjustment,
  StockTransfer,
  StoreInventoryRecord,
} from "../types/receiving";

export async function createGoodsReceipt(
  input: CreateGrnInput,
  token: string
): Promise<ApiResult<{ grn: GoodsReceipt }>> {
  return apiRequest<{ grn: GoodsReceipt }>("/manager/grn", {
    method: "POST",
    body: input,
    token,
  });
}

export async function uploadGrnCsv(
  storeId: string,
  csvContent: string,
  token: string
): Promise<ApiResult<{ grn: GoodsReceipt; processedRows: number }>> {
  return apiRequest<{ grn: GoodsReceipt; processedRows: number }>("/manager/grn/upload-csv", {
    method: "POST",
    body: { storeId, csvContent },
    token,
  });
}

export async function listGoodsReceipts(
  storeId: string | undefined,
  token: string
): Promise<ApiResult<{ receipts: GoodsReceipt[] }>> {
  const query = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
  return apiRequest<{ receipts: GoodsReceipt[] }>(`/manager/grn${query}`, {
    method: "GET",
    token,
  });
}

export async function getGoodsReceipt(
  id: string,
  token: string
): Promise<ApiResult<{ grn: GoodsReceipt }>> {
  return apiRequest<{ grn: GoodsReceipt }>(`/manager/grn/${encodeURIComponent(id)}`, {
    method: "GET",
    token,
  });
}

export async function getStoreInventory(
  storeId: string,
  token: string
): Promise<ApiResult<{ inventory: StoreInventoryRecord[] }>> {
  return apiRequest<{ inventory: StoreInventoryRecord[] }>(
    `/manager/stores/${encodeURIComponent(storeId)}/inventory`,
    {
      method: "GET",
      token,
    }
  );
}

export async function transferStock(
  fromStoreId: string,
  toStoreId: string,
  productId: string,
  quantity: number,
  token: string
): Promise<ApiResult<{ transfer: StockTransfer }>> {
  return apiRequest<{ transfer: StockTransfer }>("/manager/transfers", {
    method: "POST",
    body: { fromStoreId, toStoreId, productId, quantity },
    token,
  });
}

export async function listStockTransfers(
  storeId: string | undefined,
  token: string
): Promise<ApiResult<{ transfers: StockTransfer[] }>> {
  const query = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
  return apiRequest<{ transfers: StockTransfer[] }>(`/manager/transfers${query}`, {
    method: "GET",
    token,
  });
}

export async function adjustStock(
  storeId: string,
  productId: string,
  quantityDelta: number,
  reason: AdjustmentReason,
  token: string
): Promise<ApiResult<{ adjustment: StockAdjustment }>> {
  return apiRequest<{ adjustment: StockAdjustment }>("/manager/adjustments", {
    method: "POST",
    body: { storeId, productId, quantityDelta, reason },
    token,
  });
}

export async function listStockAdjustments(
  storeId: string | undefined,
  token: string
): Promise<ApiResult<{ adjustments: StockAdjustment[] }>> {
  const query = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
  return apiRequest<{ adjustments: StockAdjustment[] }>(`/manager/adjustments${query}`, {
    method: "GET",
    token,
  });
}
