import { apiRequest, type ApiResult } from "./client";
import type {
  AccountingLedgerOverview,
  DailySalesSummary,
  MarginReport,
  MonthlyComparisonReport,
  PipelineMetrics,
  StoreRegionalBreakdown,
  TaxLiabilityLedger,
  VelocityReport,
} from "../types/accounting";

export async function getAccountingOverview(
  token: string,
  storeId?: string,
  days?: number
): Promise<ApiResult<AccountingLedgerOverview>> {
  const params = new URLSearchParams();
  if (storeId) params.append("storeId", storeId);
  if (days) params.append("days", String(days));
  const qs = params.toString() ? `?${params.toString()}` : "";

  return apiRequest<AccountingLedgerOverview>(`/accounting/overview${qs}`, {
    method: "GET",
    token,
  });
}

export async function getDailySales(
  token: string,
  days: number = 30,
  storeId?: string
): Promise<ApiResult<{ days: number; storeId: string | null; summaries: DailySalesSummary[] }>> {
  const params = new URLSearchParams({ days: String(days) });
  if (storeId) params.append("storeId", storeId);

  return apiRequest<{ days: number; storeId: string | null; summaries: DailySalesSummary[] }>(
    `/accounting/daily-sales?${params.toString()}`,
    {
      method: "GET",
      token,
    }
  );
}

export async function getPipelineMetrics(
  token: string,
  storeId?: string
): Promise<ApiResult<PipelineMetrics>> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
  return apiRequest<PipelineMetrics>(`/accounting/pipeline${qs}`, {
    method: "GET",
    token,
  });
}

export async function getMonthlyTrends(
  token: string,
  storeId?: string
): Promise<ApiResult<MonthlyComparisonReport>> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
  return apiRequest<MonthlyComparisonReport>(`/accounting/monthly-trends${qs}`, {
    method: "GET",
    token,
  });
}

export async function getProductVelocity(
  token: string,
  storeId?: string
): Promise<ApiResult<VelocityReport>> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
  return apiRequest<VelocityReport>(`/accounting/velocity${qs}`, {
    method: "GET",
    token,
  });
}

export async function getGrossMargins(
  token: string,
  storeId?: string
): Promise<ApiResult<MarginReport>> {
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
  return apiRequest<MarginReport>(`/accounting/margins${qs}`, {
    method: "GET",
    token,
  });
}

export async function getRegionalBreakdown(
  token: string
): Promise<ApiResult<StoreRegionalBreakdown>> {
  return apiRequest<StoreRegionalBreakdown>("/accounting/regional", {
    method: "GET",
    token,
  });
}

export async function getTaxLedger(
  token: string
): Promise<ApiResult<TaxLiabilityLedger>> {
  return apiRequest<TaxLiabilityLedger>("/accounting/tax-ledger", {
    method: "GET",
    token,
  });
}

export async function getTransactionLogs(
  token: string,
  params?: {
    limit?: number;
    offset?: number;
    storeId?: string;
    paymentMethod?: string;
    status?: string;
    search?: string;
  }
): Promise<ApiResult<{ transactions: import("../types/accounting").TransactionAuditItem[]; totalCount: number; limit: number; offset: number }>> {
  const query = new URLSearchParams();
  if (params?.limit) query.append("limit", String(params.limit));
  if (params?.offset) query.append("offset", String(params.offset));
  if (params?.storeId) query.append("storeId", params.storeId);
  if (params?.paymentMethod) query.append("paymentMethod", params.paymentMethod);
  if (params?.status) query.append("status", params.status);
  if (params?.search) query.append("search", params.search);

  const qs = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<{ transactions: import("../types/accounting").TransactionAuditItem[]; totalCount: number; limit: number; offset: number }>(
    `/accounting/transactions${qs}`,
    {
      method: "GET",
      token,
    }
  );
}

