/** Domain models for Accounting & Financial Analytics (ACC-01..07 / WS H) */

export interface DailySalesSummary {
  date: string;
  orderCount: number;
  grossSalesMinor: number;
  netSalesMinor: number;
  taxMinor: number;
  discountsMinor: number;
  averageOrderValueMinor: number;
  paymentBreakdown: Record<string, { count: number; totalMinor: number }>;
}

export interface PipelineStageMetric {
  status: "placed" | "packed" | "ready" | "collected" | "refunded" | "cancelled";
  count: number;
  totalMinor: number;
}

export interface PipelineMetrics {
  stages: Record<string, PipelineStageMetric>;
  activeOrderCount: number;
  activeOrderValueMinor: number;
  completedCount: number;
  completedValueMinor: number;
  refundedCount: number;
  refundedValueMinor: number;
}

export interface MonthComparisonItem {
  yearMonth: string; // "2026-09"
  monthName: string; // "September 2026"
  orderCount: number;
  grossRevenueMinor: number;
  netRevenueMinor: number;
  taxMinor: number;
  averageOrderValueMinor: number;
  revenueGrowthPercent: number | null;
}

export interface MonthlyComparisonReport {
  months: MonthComparisonItem[];
  total12MonthRevenueMinor: number;
  averageMonthlyRevenueMinor: number;
}

export type VelocityClassification = "fast" | "moderate" | "slow" | "dead";

export interface ProductVelocityItem {
  productId: string;
  name: string;
  category: string;
  department: string;
  unitsSold30d: number;
  revenue30dMinor: number;
  currentStock: number;
  wacCostMinor: number;
  velocity: VelocityClassification;
  isNearExpiry: boolean;
  earliestExpiryDate?: string | null;
}

export interface VelocityReport {
  fastMoving: ProductVelocityItem[];
  slowMoving: ProductVelocityItem[];
  deadStock: ProductVelocityItem[];
  nearExpiryItems: ProductVelocityItem[];
  totalSkusTracked: number;
}

export interface CategoryMarginItem {
  category: string;
  revenueMinor: number;
  cogsMinor: number;
  grossProfitMinor: number;
  marginPercent: number;
}

export interface StoreMarginItem {
  storeId: string;
  storeName: string;
  state: string;
  revenueMinor: number;
  cogsMinor: number;
  grossProfitMinor: number;
  marginPercent: number;
}

export interface MarginReport {
  grossRevenueMinor: number;
  cogsMinor: number;
  grossProfitMinor: number;
  grossMarginPercent: number;
  categories: CategoryMarginItem[];
  stores: StoreMarginItem[];
}

export interface StoreRegionalItem {
  storeId: string;
  storeName: string;
  state: string;
  orderCount: number;
  revenueMinor: number;
  taxMinor: number;
  shareOfTotalPercent: number;
}

export interface StateRegionalItem {
  state: string;
  orderCount: number;
  revenueMinor: number;
  taxMinor: number;
  shareOfTotalPercent: number;
}

export interface StoreRegionalBreakdown {
  stores: StoreRegionalItem[];
  states: StateRegionalItem[];
  totalRevenueMinor: number;
  totalOrders: number;
}

export interface JurisdictionTaxItem {
  jurisdiction: string;
  state: string;
  orderCount: number;
  taxableSalesMinor: number;
  taxCollectedMinor: number;
  effectiveTaxRateBps: number;
}

export interface TaxLiabilityLedger {
  totalTaxCollectedMinor: number;
  totalTaxableSalesMinor: number;
  jurisdictions: JurisdictionTaxItem[];
}

export interface AccountingLedgerOverview {
  generatedAt: string;
  dailySales: DailySalesSummary[];
  pipeline: PipelineMetrics;
  monthlyTrends: MonthlyComparisonReport;
  margins: MarginReport;
  velocity: VelocityReport;
  regional: StoreRegionalBreakdown;
  taxLedger: TaxLiabilityLedger;
}

export interface TransactionAuditItem {
  orderId: string;
  placedAt: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  storeId: string;
  storeName: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  paymentReference: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
}

export interface TransactionAuditResponse {
  transactions: TransactionAuditItem[];
  totalCount: number;
  limit: number;
  offset: number;
}

