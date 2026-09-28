import { accountingRepository } from "../data/accountingRepository";
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

export const accountingService = {
  getDailySales(days = 30, storeId?: string): DailySalesSummary[] {
    return accountingRepository.getDailySales(days, storeId);
  },

  getPipelineMetrics(storeId?: string): PipelineMetrics {
    return accountingRepository.getPipelineMetrics(storeId);
  },

  getMonthlyTrends(months = 12, storeId?: string): MonthlyComparisonReport {
    return accountingRepository.getMonthlyTrends(months, storeId);
  },

  getProductVelocity(storeId?: string): VelocityReport {
    return accountingRepository.getProductVelocity(storeId);
  },

  getGrossMargins(storeId?: string): MarginReport {
    return accountingRepository.getGrossMargins(storeId);
  },

  getStoreRegionalBreakdown(): StoreRegionalBreakdown {
    return accountingRepository.getStoreRegionalBreakdown();
  },

  getTaxLiabilityLedger(): TaxLiabilityLedger {
    return accountingRepository.getTaxLiabilityLedger();
  },

  getTransactionAuditLogs(options?: {
    limit?: number;
    offset?: number;
    storeId?: string;
    paymentMethod?: string;
    status?: string;
    search?: string;
  }) {
    return accountingRepository.getTransactionAuditLogs(options);
  },

  getOverview(storeId?: string): AccountingLedgerOverview {
    return {
      generatedAt: new Date().toISOString(),
      dailySales: accountingRepository.getDailySales(14, storeId),
      pipeline: accountingRepository.getPipelineMetrics(storeId),
      monthlyTrends: accountingRepository.getMonthlyTrends(12, storeId),
      margins: accountingRepository.getGrossMargins(storeId),
      velocity: accountingRepository.getProductVelocity(storeId),
      regional: accountingRepository.getStoreRegionalBreakdown(),
      taxLedger: accountingRepository.getTaxLiabilityLedger(),
    };
  },
};
