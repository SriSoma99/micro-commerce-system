import request from "supertest";
import { launchTestApp, RunningTestApp } from "../support/testApp";
import { findDetail } from "../support/catalog";

describe("Store Manager Software: Material Receipts & Inventory (WS F / SM-01..07)", () => {
  let appInstance: RunningTestApp;
  let managerToken: string;
  let customerToken: string;
  let sampleProductId: string;

  beforeAll(async () => {
    process.env.DEMO_AUTO_INSTALL = "true";
    appInstance = await launchTestApp();

    // Sign in store manager (manager@example.com / Demo@1234)
    const mgrRes = await request(appInstance.baseUrl)
      .post("/api/auth/login")
      .send({ email: "manager@example.com", password: "Demo@1234" });
    expect(mgrRes.status).toBe(200);
    managerToken = mgrRes.body.data.token;

    // Sign in regular customer (testuser@mydomain.com / 123456)
    const cusRes = await request(appInstance.baseUrl)
      .post("/api/auth/login")
      .send({ email: "testuser@mydomain.com", password: "123456" });
    expect(cusRes.status).toBe(200);
    customerToken = cusRes.body.data.token;

    // Find a real product from catalog
    const prod = await findDetail(appInstance.baseUrl, {}, (d) => d.stock > 0);
    sampleProductId = prod.id;
  });

  afterAll(async () => {
    await appInstance.close();
  });

  test("TC-600: Store manager creates a manual Goods Receipt Note (GRN), stock increments and WAC updates", async () => {
    const storeId = "IL-01";
    // Check initial inventory
    const beforeRes = await request(appInstance.baseUrl)
      .get(`/api/manager/stores/${storeId}/inventory`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(beforeRes.status).toBe(200);
    const itemBefore = beforeRes.body.data.inventory.find((i: any) => i.productId === sampleProductId);
    const stockBefore = itemBefore?.stock ?? 0;

    // Submit GRN
    const grnRes = await request(appInstance.baseUrl)
      .post("/api/manager/grn")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        storeId,
        supplier: "Fresh Harvest Distributors",
        poReference: "PO-2026-9901",
        notes: "Morning delivery batch",
        items: [
          {
            productId: sampleProductId,
            quantity: 50,
            unitCostMinor: 220, // $2.20
            batchNumber: "B-2026-0920",
            expiryDate: "2026-12-31",
          },
        ],
      });

    expect(grnRes.status).toBe(201);
    expect(grnRes.body.data.grn.grnNumber).toMatch(/^GRN-IL01-\d{4}$/);
    expect(grnRes.body.data.grn.supplier).toBe("Fresh Harvest Distributors");
    expect(grnRes.body.data.grn.totalCostMinor).toBe(50 * 220);
    expect(grnRes.body.data.grn.items).toHaveLength(1);

    // Verify stock incremented
    const afterRes = await request(appInstance.baseUrl)
      .get(`/api/manager/stores/${storeId}/inventory`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(afterRes.status).toBe(200);
    const itemAfter = afterRes.body.data.inventory.find((i: any) => i.productId === sampleProductId);
    expect(itemAfter.stock).toBe(stockBefore + 50);
    expect(itemAfter.unitCostMinor).toBeGreaterThan(0);
  });

  test("TC-601: Store manager ingests bulk shipments via CSV upload with batch & expiry dates", async () => {
    const storeId = "OH-01";
    const csvData = `sku,supplier,po_reference,quantity,unit_cost,batch,expiry
${sampleProductId},Organic Valley Farms,PO-8821,30,1.85,BATCH-991,2026-11-15`;

    const csvRes = await request(appInstance.baseUrl)
      .post("/api/manager/grn/upload-csv")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        storeId,
        csvContent: csvData,
      });

    expect(csvRes.status).toBe(201);
    expect(csvRes.body.data.processedRows).toBe(1);
    expect(csvRes.body.data.grn.grnNumber).toMatch(/^GRN-OH01-\d{4}$/);
    expect(csvRes.body.data.grn.supplier).toBe("Organic Valley Farms");
  });

  test("TC-602: Rejects invalid CSV rows (missing SKU, non-positive quantity/cost)", async () => {
    const storeId = "PA-01";
    const invalidCsv = `sku,supplier,po_reference,quantity,unit_cost,batch,expiry
non_existent_sku,Bad Supplier,PO-000,-5,0,B1,2026-10-10`;

    const res = await request(appInstance.baseUrl)
      .post("/api/manager/grn/upload-csv")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        storeId,
        csvContent: invalidCsv,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("CSV_VALIDATION_FAILED");
  });

  test("TC-603: Inter-store stock transfer decrements source store and increments destination store", async () => {
    const fromStore = "IL-01";
    const toStore = "PA-01";

    // Ensure source store has at least 20 items
    await request(appInstance.baseUrl)
      .post("/api/manager/grn")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        storeId: fromStore,
        supplier: "Transfer Source Depot",
        poReference: "PO-TRF-01",
        items: [
          {
            productId: sampleProductId,
            quantity: 20,
            unitCostMinor: 150,
            batchNumber: "B-TRF",
            expiryDate: "2026-12-01",
          },
        ],
      });

    const fromBefore = await request(appInstance.baseUrl)
      .get(`/api/manager/stores/${fromStore}/inventory`)
      .set("Authorization", `Bearer ${managerToken}`);
    const toBefore = await request(appInstance.baseUrl)
      .get(`/api/manager/stores/${toStore}/inventory`)
      .set("Authorization", `Bearer ${managerToken}`);

    const fromStockBefore = fromBefore.body.data.inventory.find((i: any) => i.productId === sampleProductId).stock;
    const toStockBefore = toBefore.body.data.inventory.find((i: any) => i.productId === sampleProductId).stock;

    // Process transfer of 5 units
    const transferRes = await request(appInstance.baseUrl)
      .post("/api/manager/transfers")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        fromStoreId: fromStore,
        toStoreId: toStore,
        productId: sampleProductId,
        quantity: 5,
      });

    expect(transferRes.status).toBe(201);
    expect(transferRes.body.data.transfer.status).toBe("completed");

    // Check inventory update on both stores
    const fromAfter = await request(appInstance.baseUrl)
      .get(`/api/manager/stores/${fromStore}/inventory`)
      .set("Authorization", `Bearer ${managerToken}`);
    const toAfter = await request(appInstance.baseUrl)
      .get(`/api/manager/stores/${toStore}/inventory`)
      .set("Authorization", `Bearer ${managerToken}`);

    const fromStockAfter = fromAfter.body.data.inventory.find((i: any) => i.productId === sampleProductId).stock;
    const toStockAfter = toAfter.body.data.inventory.find((i: any) => i.productId === sampleProductId).stock;

    expect(fromStockAfter).toBe(fromStockBefore - 5);
    expect(toStockAfter).toBe(toStockBefore + 5);
  });

  test("TC-604: Shrinkage / wastage adjustment reduces on-hand stock with reason log", async () => {
    const storeId = "IL-01";
    const beforeRes = await request(appInstance.baseUrl)
      .get(`/api/manager/stores/${storeId}/inventory`)
      .set("Authorization", `Bearer ${managerToken}`);
    const stockBefore = beforeRes.body.data.inventory.find((i: any) => i.productId === sampleProductId).stock;

    const adjustRes = await request(appInstance.baseUrl)
      .post("/api/manager/adjustments")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        storeId,
        productId: sampleProductId,
        quantityDelta: -2,
        reason: "damage",
      });

    expect(adjustRes.status).toBe(201);
    expect(adjustRes.body.data.adjustment.quantityDelta).toBe(-2);
    expect(adjustRes.body.data.adjustment.reason).toBe("damage");

    const afterRes = await request(appInstance.baseUrl)
      .get(`/api/manager/stores/${storeId}/inventory`)
      .set("Authorization", `Bearer ${managerToken}`);
    const stockAfter = afterRes.body.data.inventory.find((i: any) => i.productId === sampleProductId).stock;
    expect(stockAfter).toBe(stockBefore - 2);
  });

  test("TC-605: Regular customer without elevated role is rejected with 403 FORBIDDEN", async () => {
    const res = await request(appInstance.baseUrl)
      .get("/api/manager/stores/IL-01/inventory")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("FORBIDDEN");

    const unauthRes = await request(appInstance.baseUrl).get("/api/manager/stores/IL-01/inventory");
    expect(unauthRes.status).toBe(401);
  });
});
