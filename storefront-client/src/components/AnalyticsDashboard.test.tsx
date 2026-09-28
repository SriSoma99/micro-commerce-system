import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { envelope, mockNetwork } from "../test/network";
import type { AccountingLedgerOverview } from "../types/accounting";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

const mockOverviewData: AccountingLedgerOverview = {
  generatedAt: "2026-09-20T12:00:00.000Z",
  dailySales: [
    {
      date: "2026-09-20",
      orderCount: 5,
      grossSalesMinor: 25000,
      netSalesMinor: 23500,
      taxMinor: 1500,
      discountsMinor: 0,
      averageOrderValueMinor: 5000,
      paymentBreakdown: {
        "card-mock": { count: 3, totalMinor: 15000 },
        "ebt-mock": { count: 2, totalMinor: 10000 },
      },
    },
  ],
  pipeline: {
    stages: {
      placed: { status: "placed", count: 2, totalMinor: 10000 },
      packed: { status: "packed", count: 1, totalMinor: 5000 },
      ready: { status: "ready", count: 1, totalMinor: 4000 },
      collected: { status: "collected", count: 20, totalMinor: 120000 },
      refunded: { status: "refunded", count: 1, totalMinor: 3000 },
      cancelled: { status: "cancelled", count: 0, totalMinor: 0 },
    },
    activeOrderCount: 4,
    activeOrderValueMinor: 19000,
    completedCount: 20,
    completedValueMinor: 120000,
    refundedCount: 1,
    refundedValueMinor: 3000,
  },
  monthlyTrends: {
    months: [
      {
        yearMonth: "2026-09",
        monthName: "September 2026",
        orderCount: 40,
        grossRevenueMinor: 200000,
        netRevenueMinor: 190000,
        taxMinor: 10000,
        averageOrderValueMinor: 5000,
        revenueGrowthPercent: 12.5,
      },
      {
        yearMonth: "2026-08",
        monthName: "August 2026",
        orderCount: 36,
        grossRevenueMinor: 178000,
        netRevenueMinor: 169000,
        taxMinor: 9000,
        averageOrderValueMinor: 4944,
        revenueGrowthPercent: -2.1,
      },
    ],
    total12MonthRevenueMinor: 2150000,
    averageMonthlyRevenueMinor: 179166,
  },
  margins: {
    grossRevenueMinor: 2150000,
    cogsMinor: 1397500,
    grossProfitMinor: 752500,
    grossMarginPercent: 35.0,
    categories: [
      {
        category: "produce",
        revenueMinor: 800000,
        cogsMinor: 520000,
        grossProfitMinor: 280000,
        marginPercent: 35.0,
      },
      {
        category: "dairy",
        revenueMinor: 600000,
        cogsMinor: 400000,
        grossProfitMinor: 200000,
        marginPercent: 33.3,
      },
    ],
    stores: [
      {
        storeId: "IL-01",
        storeName: "Lincoln Park Flagship",
        state: "IL",
        revenueMinor: 1200000,
        cogsMinor: 780000,
        grossProfitMinor: 420000,
        marginPercent: 35.0,
      },
    ],
  },
  velocity: {
    fastMoving: [
      {
        productId: "p-001",
        name: "Organic Honeycrisp Apples",
        category: "produce",
        department: "fruit",
        unitsSold30d: 45,
        revenue30dMinor: 13500,
        currentStock: 30,
        wacCostMinor: 180,
        velocity: "fast",
        isNearExpiry: false,
      },
    ],
    slowMoving: [
      {
        productId: "p-002",
        name: "Truffle Olive Oil",
        category: "pantry",
        department: "oils",
        unitsSold30d: 4,
        revenue30dMinor: 6400,
        currentStock: 12,
        wacCostMinor: 950,
        velocity: "slow",
        isNearExpiry: true,
        earliestExpiryDate: "2026-10-15T00:00:00Z",
      },
    ],
    deadStock: [],
    nearExpiryItems: [
      {
        productId: "p-002",
        name: "Truffle Olive Oil",
        category: "pantry",
        department: "oils",
        unitsSold30d: 4,
        revenue30dMinor: 6400,
        currentStock: 12,
        wacCostMinor: 950,
        velocity: "slow",
        isNearExpiry: true,
        earliestExpiryDate: "2026-10-15T00:00:00Z",
      },
    ],
    totalSkusTracked: 2,
  },
  regional: {
    stores: [
      {
        storeId: "IL-01",
        storeName: "Lincoln Park Flagship",
        state: "IL",
        orderCount: 120,
        revenueMinor: 1200000,
        taxMinor: 75000,
        shareOfTotalPercent: 55.8,
      },
    ],
    states: [
      {
        state: "IL",
        orderCount: 120,
        revenueMinor: 1200000,
        taxMinor: 75000,
        shareOfTotalPercent: 55.8,
      },
    ],
    totalRevenueMinor: 2150000,
    totalOrders: 210,
  },
  taxLedger: {
    totalTaxCollectedMinor: 134375,
    totalTaxableSalesMinor: 2150000,
    jurisdictions: [
      {
        jurisdiction: "IL",
        state: "IL",
        orderCount: 120,
        taxableSalesMinor: 1200000,
        taxCollectedMinor: 75000,
        effectiveTaxRateBps: 625,
      },
      {
        jurisdiction: "OH",
        state: "OH",
        orderCount: 50,
        taxableSalesMinor: 550000,
        taxCollectedMinor: 31625,
        effectiveTaxRateBps: 575,
      },
      {
        jurisdiction: "PA",
        state: "PA",
        orderCount: 40,
        taxableSalesMinor: 400000,
        taxCollectedMinor: 27750,
        effectiveTaxRateBps: 693,
      },
    ],
  },
};

describe("AnalyticsDashboard Component", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders financial KPIs and executive overview correctly", async () => {
    mockNetwork({
      "GET /accounting/overview": () => envelope(mockOverviewData),
    });

    render(<AnalyticsDashboard token="test-token" storeId="IL-01" />);

    expect(screen.getByText(/Loading Accounting Ledger/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Financial Analytics & Accounting Ledger/i)).toBeInTheDocument();
    });

    // Check KPI cards
    expect(screen.getByText("$21,500.00")).toBeInTheDocument(); // Gross Revenue
    expect(screen.getByText("35.0% Gross Margin")).toBeInTheDocument();
    expect(screen.getByText("$1,343.75")).toBeInTheDocument(); // Tax liability
    expect(screen.getByText("4 Orders")).toBeInTheDocument(); // Pipeline count

    // Check pipeline stage counts
    expect(screen.getByText("Placed")).toBeInTheDocument();
    expect(screen.getByText("Ready for Pickup")).toBeInTheDocument();
  });

  it("switches to 12-Month Trends sub-section and renders table", async () => {
    mockNetwork({
      "GET /accounting/overview": () => envelope(mockOverviewData),
    });

    render(<AnalyticsDashboard token="test-token" storeId="IL-01" />);

    await waitFor(() => {
      expect(screen.getByText(/Financial Analytics & Accounting Ledger/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/12-Month Trends/i));

    expect(screen.getByText(/12-Month Revenue & Growth Analysis/i)).toBeInTheDocument();
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.getByText("August 2026")).toBeInTheDocument();
  });

  it("switches to Margins sub-section and renders Category profitability", async () => {
    mockNetwork({
      "GET /accounting/overview": () => envelope(mockOverviewData),
    });

    render(<AnalyticsDashboard token="test-token" storeId="IL-01" />);

    await waitFor(() => {
      expect(screen.getByText(/Financial Analytics & Accounting Ledger/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Category & Store Margins/i));

    expect(screen.getByText(/Category Profitability & COGS Margins/i)).toBeInTheDocument();
    expect(screen.getByText("produce")).toBeInTheDocument();
    expect(screen.getByText("dairy")).toBeInTheDocument();
  });

  it("switches to Product Velocity and filters by near expiry", async () => {
    mockNetwork({
      "GET /accounting/overview": () => envelope(mockOverviewData),
    });

    render(<AnalyticsDashboard token="test-token" storeId="IL-01" />);

    await waitFor(() => {
      expect(screen.getByText(/Financial Analytics & Accounting Ledger/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Product Velocity & Aging/i));

    expect(screen.getByText(/Product Velocity & Expiry Risk/i)).toBeInTheDocument();
    expect(screen.getByText("Organic Honeycrisp Apples")).toBeInTheDocument();

    // Click near expiry filter
    fireEvent.click(screen.getByText(/Near Expiry \(1\)/i));
    expect(screen.getByText("Truffle Olive Oil")).toBeInTheDocument();
  });

  it("switches to Sales Tax Ledger and renders state liabilities", async () => {
    mockNetwork({
      "GET /accounting/overview": () => envelope(mockOverviewData),
    });

    render(<AnalyticsDashboard token="test-token" storeId="IL-01" />);

    await waitFor(() => {
      expect(screen.getByText(/Financial Analytics & Accounting Ledger/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Sales Tax Ledger/i));

    expect(screen.getByText(/Multi-State Sales Tax Liability Ledger/i)).toBeInTheDocument();
    expect(screen.getByText("Illinois (IL)")).toBeInTheDocument();
    expect(screen.getByText("Ohio (OH)")).toBeInTheDocument();
    expect(screen.getByText("Pennsylvania (PA)")).toBeInTheDocument();
  });
});
