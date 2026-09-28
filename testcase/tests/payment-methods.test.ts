import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { launchTestApp, RunningTestApp } from "../support/testApp";

const SETUP_TOKEN = "payments-test-token";

describe("GET /api/payments/methods (gateway config + simulation visibility)", () => {
  let app: RunningTestApp;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "store-payments-"));
    process.env.STORE_CONFIG_PATH = path.join(tmpDir, "store.config.json");
    process.env.SETUP_TOKEN = SETUP_TOKEN;
    app = await launchTestApp();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.STORE_CONFIG_PATH;
    delete process.env.SETUP_TOKEN;
  });

  // TC-140
  it("returns 404 NOT_INSTALLED before setup", async () => {
    const response = await request(app.baseUrl).get("/api/payments/methods");
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("NOT_INSTALLED");
  });

  // TC-141
  it("after install lists only the enabled methods, each marked simulated, with browser tokenization config", async () => {
    const install = await request(app.baseUrl)
      .post("/api/setup/install")
      .set("x-setup-token", SETUP_TOKEN)
      .send({
        region: "US",
        payments: ["card-mock", "pay-at-pickup"], // ebt-mock deliberately NOT enabled
        stores: [{ id: "IL-01", name: "Batavia", taxJurisdiction: "IL" }],
      });
    expect(install.status).toBe(201);

    const response = await request(app.baseUrl).get("/api/payments/methods");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ isFallback: false, source: "live-core" });

    const methods = response.body.data as {
      id: string;
      simulated: boolean;
      clientConfig?: { tokenizationUrl: string; publishableKey: string; testCardsUrl?: string; tokenMethod: string };
    }[];
    expect(methods.map((m) => m.id)).toEqual(["card-mock", "pay-at-pickup"]);
    expect(methods.every((m) => m.simulated === true)).toBe(true);

    const card = methods.find((m) => m.id === "card-mock");
    expect(card?.clientConfig).toEqual({
      tokenizationUrl: `${app.gatewayUrl}/v1/tokens`,
      publishableKey: "pk_test_dummy",
      testCardsUrl: `${app.gatewayUrl}/v1/test-cards`,
      tokenMethod: "card",
    });
    expect(methods.find((m) => m.id === "pay-at-pickup")).not.toHaveProperty("clientConfig"); // nothing to tokenize
  });

  // TC-142
  it("flags paymentSimulation in the public store config so the UI can show a notice", async () => {
    const response = await request(app.baseUrl).get("/api/store-config");
    expect(response.status).toBe(200);
    expect(response.body.data.paymentSimulation).toBe(true);
    expect(response.body.data.paymentMethods.every((m: { simulated: boolean }) => m.simulated)).toBe(true);
  });

  // TC-143
  it("does not expose authorize / capture / refund over public HTTP, and never leaks the secret key", async () => {
    for (const [method, url] of [
      ["post", "/api/payments/authorize"],
      ["post", "/api/payments/sim_x/capture"],
      ["post", "/api/payments/sim_x/refund"],
    ] as const) {
      expect((await request(app.baseUrl)[method](url).send({})).status).toBe(404);
    }

    const bodies = JSON.stringify([
      (await request(app.baseUrl).get("/api/payments/methods")).body,
      (await request(app.baseUrl).get("/api/store-config")).body,
      (await request(app.baseUrl).get("/api/setup/options")).body,
    ]);
    expect(bodies).not.toContain("sk_test");
  });
});
