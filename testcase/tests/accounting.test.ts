import request from "supertest";
import { createApp } from "../../product-catalog-service/src/app";

describe("Accounting Ledger & Financial Analytics (WS H / ACC-01..08, DATA-03)", () => {
  let app: ReturnType<typeof createApp>;
  let financeToken: string;
  let managerToken: string;
  let customerToken: string;

  beforeAll(async () => {
    process.env.DATABASE_PATH = ":memory:";
    process.env.SEED_SYNTHETIC_DATA = "true";
    app = createApp();

    // Sign in Finance Officer (finance@example.com / Demo@1234)
    const finRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "finance@example.com", password: "Demo@1234" });
    financeToken = finRes.body.data.token;

    // Sign in Store Manager (manager@example.com / Demo@1234)
    const managerRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "manager@example.com", password: "Demo@1234" });
    managerToken = managerRes.body.data.token;

    // Sign in regular Customer (demo@example.com / Demo@1234)
    const custRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "demo@example.com", password: "Demo@1234" });
    customerToken = custRes.body.data.token;
  });

  it("TC-800: Finance officer retrieves daily sales ledger with payment method breakdown and AOV (ACC-01)", async () => {
    const res = await request(app)
      .get("/api/accounting/daily-sales?days=14")
      .set("Authorization", `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);

    const day = res.body.data[0];
    expect(day).toHaveProperty("date");
    expect(day).toHaveProperty("orderCount");
    expect(day).toHaveProperty("grossSalesMinor");
    expect(day).toHaveProperty("netSalesMinor");
    expect(day).toHaveProperty("taxMinor");
    expect(day).toHaveProperty("averageOrderValueMinor");
    expect(day).toHaveProperty("paymentBreakdown");
    expect(day.grossSalesMinor).toBe(day.netSalesMinor + day.taxMinor);
    expect(day.averageOrderValueMinor).toBe(Math.round(day.grossSalesMinor / day.orderCount));
  });

  it("TC-801: Finance officer retrieves fulfilment pipeline volume across all order states (ACC-02)", async () => {
    const res = await request(app)
      .get("/api/accounting/pipeline")
      .set("Authorization", `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    const pipeline = res.body.data;
    expect(pipeline).toHaveProperty("stages");
    expect(pipeline).toHaveProperty("activeOrderCount");
    expect(pipeline).toHaveProperty("activeOrderValueMinor");
    expect(pipeline).toHaveProperty("completedCount");
    expect(pipeline).toHaveProperty("completedValueMinor");
    expect(pipeline).toHaveProperty("refundedCount");

    expect(pipeline.stages).toHaveProperty("placed");
    expect(pipeline.stages).toHaveProperty("packed");
    expect(pipeline.stages).toHaveProperty("ready");
    expect(pipeline.stages).toHaveProperty("collected");
  });

  it("TC-802: Finance officer retrieves 12-month revenue trend comparison (ACC-03, DATA-03)", async () => {
    const res = await request(app)
      .get("/api/accounting/monthly-trends?months=12")
      .set("Authorization", `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    const trends = res.body.data;
    expect(trends.months).toBeInstanceOf(Array);
    expect(trends.months.length).toBeGreaterThanOrEqual(10);
    expect(trends.total12MonthRevenueMinor).toBeGreaterThan(0);
    expect(trends.averageMonthlyRevenueMinor).toBeGreaterThan(0);

    const month = trends.months[0];
    expect(month).toHaveProperty("yearMonth");
    expect(month).toHaveProperty("monthName");
    expect(month).toHaveProperty("orderCount");
    expect(month).toHaveProperty("grossRevenueMinor");
  });

  it("TC-803: Finance officer retrieves product velocity report for fast, slow, and dead stock (ACC-04)", async () => {
    const res = await request(app)
      .get("/api/accounting/velocity")
      .set("Authorization", `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    const velocity = res.body.data;
    expect(velocity).toHaveProperty("fastMoving");
    expect(velocity).toHaveProperty("slowMoving");
    expect(velocity).toHaveProperty("deadStock");
    expect(velocity).toHaveProperty("nearExpiryItems");
    expect(velocity.totalSkusTracked).toBeGreaterThan(0);

    if (velocity.fastMoving.length > 0) {
      const fast = velocity.fastMoving[0];
      expect(fast.velocity).toBe("fast");
      expect(fast.unitsSold30d).toBeGreaterThanOrEqual(10);
      expect(fast).toHaveProperty("wacCostMinor");
    }
  });

  it("TC-804: Finance officer retrieves gross margins by product category and retail store (ACC-05)", async () => {
    const res = await request(app)
      .get("/api/accounting/margins")
      .set("Authorization", `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    const margins = res.body.data;
    expect(margins.grossRevenueMinor).toBeGreaterThan(0);
    expect(margins.cogsMinor).toBeGreaterThan(0);
    expect(margins.grossProfitMinor).toBe(margins.grossRevenueMinor - margins.cogsMinor);
    expect(margins.grossMarginPercent).toBeGreaterThan(0);

    expect(margins.categories).toBeInstanceOf(Array);
    expect(margins.categories.length).toBeGreaterThan(0);
    const cat = margins.categories[0];
    expect(cat).toHaveProperty("category");
    expect(cat.grossProfitMinor).toBe(cat.revenueMinor - cat.cogsMinor);

    expect(margins.stores).toBeInstanceOf(Array);
    expect(margins.stores.length).toBeGreaterThan(0);
  });

  it("TC-805: Finance officer retrieves store and regional breakdown across IL, OH, PA (ACC-06)", async () => {
    const res = await request(app)
      .get("/api/accounting/regional")
      .set("Authorization", `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    const regional = res.body.data;
    expect(regional.stores).toBeInstanceOf(Array);
    expect(regional.stores.length).toBe(3); // IL-01, OH-01, PA-01
    expect(regional.states).toBeInstanceOf(Array);
    expect(regional.totalRevenueMinor).toBeGreaterThan(0);
    expect(regional.totalOrders).toBeGreaterThan(0);

    const storeIds = regional.stores.map((s: { storeId: string }) => s.storeId);
    expect(storeIds).toContain("IL-01");
    expect(storeIds).toContain("OH-01");
    expect(storeIds).toContain("PA-01");
  });

  it("TC-806: Finance officer retrieves sales tax liability ledger by jurisdiction (ACC-07)", async () => {
    const res = await request(app)
      .get("/api/accounting/tax-ledger")
      .set("Authorization", `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    const taxLedger = res.body.data;
    expect(taxLedger.totalTaxCollectedMinor).toBeGreaterThan(0);
    expect(taxLedger.totalTaxableSalesMinor).toBeGreaterThan(0);
    expect(taxLedger.jurisdictions).toBeInstanceOf(Array);

    const jurisdictions = taxLedger.jurisdictions.map((j: { jurisdiction: string }) => j.jurisdiction);
    expect(jurisdictions).toContain("IL");
    expect(jurisdictions).toContain("OH");
    expect(jurisdictions).toContain("PA");
  });

  it("TC-807: Finance officer queries customer transaction & credit card audit logs (ACC-08)", async () => {
    const res = await request(app)
      .get("/api/accounting/transactions?limit=20")
      .set("Authorization", `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("transactions");
    expect(res.body.data).toHaveProperty("totalCount");
    expect(res.body.data.transactions).toBeInstanceOf(Array);
    expect(res.body.data.transactions.length).toBeGreaterThan(0);

    const tx = res.body.data.transactions[0];
    expect(tx).toHaveProperty("orderId");
    expect(tx).toHaveProperty("placedAt");
    expect(tx).toHaveProperty("customerName");
    expect(tx).toHaveProperty("customerEmail");
    expect(tx).toHaveProperty("storeId");
    expect(tx).toHaveProperty("paymentMethod");
    expect(tx).toHaveProperty("subtotalMinor");
    expect(tx).toHaveProperty("taxMinor");
    expect(tx).toHaveProperty("totalMinor");
    expect(tx).toHaveProperty("status");
  });

  it("TC-808: Store Manager without finance role is forbidden from financial accounting endpoints", async () => {
    const res = await request(app)
      .get("/api/accounting/overview")
      .set("Authorization", `Bearer ${managerToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: "FORBIDDEN",
      message: "Insufficient permissions for this resource",
    });
  });

  it("TC-809: Regular customer is forbidden from financial accounting endpoints", async () => {
    const res = await request(app)
      .get("/api/accounting/overview")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: "FORBIDDEN",
      message: "Insufficient permissions for this resource",
    });
  });

  it("TC-810: Finance officer cannot perform operational store goods receipts", async () => {
    const res = await request(app)
      .post("/api/manager/grn")
      .set("Authorization", `Bearer ${financeToken}`)
      .send({
        storeId: "IL-01",
        supplier: "Test Vendor",
        poReference: "PO-9999",
        items: [{ productId: "p-00001", quantity: 10, unitCostMinor: 200, batchNumber: "B1", expiryDate: "2026-12-31" }],
      });

    expect(res.status).toBe(403);
  });
});

