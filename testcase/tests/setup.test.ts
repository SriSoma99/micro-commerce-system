import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { launchTestApp, RunningTestApp } from "../support/testApp";

const SETUP_TOKEN = "test-setup-token";

const VALID_INSTALL = {
  region: "US",
  payments: ["card-mock", "ebt-mock", "pay-at-pickup"],
  stores: [
    { id: "IL-01", name: "Batavia", taxJurisdiction: "IL" },
    { id: "OH-01", name: "Columbus", taxJurisdiction: "OH" },
    { id: "PA-01", name: "Pittsburgh", taxJurisdiction: "PA" },
  ],
};

describe("Store setup & region config", () => {
  let app: RunningTestApp;
  let tmpDir: string;

  beforeAll(async () => {
    // Isolated config file + known token, set BEFORE the app boots
    // (platform init reads both when createApp() runs).
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "store-setup-"));
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

  // TC-060
  it("reports not installed and 404s the store config before setup", async () => {
    const status = await request(app.baseUrl).get("/api/setup/status");
    expect(status.status).toBe(200);
    expect(status.body.data).toEqual({ installed: false });

    const config = await request(app.baseUrl).get("/api/store-config");
    expect(config.status).toBe(404);
    expect(config.body.error).toBe("NOT_INSTALLED");
  });

  // TC-061
  it("lists the US region pack with its modules and jurisdictions", async () => {
    const response = await request(app.baseUrl).get("/api/setup/options");
    expect(response.status).toBe(200);

    const us = response.body.data.find((r: { code: string }) => r.code === "US");
    expect(us).toBeDefined();
    expect(us.defaults).toMatchObject({ currency: "USD", priceMode: "tax-exclusive", units: "imperial" });
    expect(us.paymentMethods.map((p: { id: string }) => p.id)).toEqual(
      expect.arrayContaining(["card-mock", "ebt-mock", "pay-at-pickup"])
    );
    expect(us.jurisdictions.map((j: { id: string }) => j.id)).toEqual(expect.arrayContaining(["IL", "OH", "PA"]));
  });

  // TC-062
  it("rejects an install without the setup token", async () => {
    const missing = await request(app.baseUrl).post("/api/setup/install").send(VALID_INSTALL);
    expect(missing.status).toBe(401);
    expect(missing.body.error).toBe("INVALID_SETUP_TOKEN");

    const wrong = await request(app.baseUrl)
      .post("/api/setup/install")
      .set("x-setup-token", "not-the-token")
      .send(VALID_INSTALL);
    expect(wrong.status).toBe(401);
  });

  // TC-063
  it("rejects invalid install requests with field-level details", async () => {
    const response = await request(app.baseUrl)
      .post("/api/setup/install")
      .set("x-setup-token", SETUP_TOKEN)
      .send({
        region: "US",
        currency: "EUR",
        payments: ["stripe-live"],
        stores: [
          { id: "A", name: "Dup", taxJurisdiction: "IL" },
          { id: "A", name: "Dup again", taxJurisdiction: "ZZ" },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_FAILED");
    const details: string[] = response.body.details;
    expect(details.some((d) => d.includes("currency is fixed to USD"))).toBe(true);
    expect(details.some((d) => d.includes('unknown payment module "stripe-live"'))).toBe(true);
    expect(details.some((d) => d.includes("duplicated"))).toBe(true);
    expect(details.some((d) => d.includes("taxJurisdiction"))).toBe(true);
  });

  // TC-064
  it("rejects an unknown region", async () => {
    const response = await request(app.baseUrl)
      .post("/api/setup/install")
      .set("x-setup-token", SETUP_TOKEN)
      .send({ ...VALID_INSTALL, region: "ZZ" });
    expect(response.status).toBe(400);
  });

  // TC-065
  it("installs, then exposes a secret-free public config", async () => {
    const install = await request(app.baseUrl)
      .post("/api/setup/install")
      .set("x-setup-token", SETUP_TOKEN)
      .send(VALID_INSTALL);

    expect(install.status).toBe(201);
    expect(install.body.data).toMatchObject({
      region: "US",
      currency: "USD",
      priceMode: "tax-exclusive",
      units: "imperial",
      taxProvider: "demo-table",
    });
    expect(install.body.data.stores).toHaveLength(3);

    const config = await request(app.baseUrl).get("/api/store-config");
    expect(config.status).toBe(200);
    expect(config.body.data.paymentMethods.map((p: { id: string }) => p.id)).toEqual([
      "card-mock",
      "ebt-mock",
      "pay-at-pickup",
    ]);
    expect(config.body.data).not.toHaveProperty("payments");
    expect(config.body.data).not.toHaveProperty("tax");

    const status = await request(app.baseUrl).get("/api/setup/status");
    expect(status.body.data).toEqual({ installed: true });
  });

  // TC-066
  it("refuses a second install with 409", async () => {
    const response = await request(app.baseUrl)
      .post("/api/setup/install")
      .set("x-setup-token", SETUP_TOKEN)
      .send(VALID_INSTALL);
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("ALREADY_INSTALLED");
  });

  // TC-067
  it("persists the config: a re-launched app boots already installed", async () => {
    await app.close();
    app = await launchTestApp();

    const status = await request(app.baseUrl).get("/api/setup/status");
    expect(status.body.data).toEqual({ installed: true });

    const config = await request(app.baseUrl).get("/api/store-config");
    expect(config.status).toBe(200);
    expect(config.body.data.stores.map((s: { id: string }) => s.id)).toEqual(["IL-01", "OH-01", "PA-01"]);
  });

  // TC-069
  it("an empty SETUP_TOKEN env (as docker-compose passes it) never becomes the token", async () => {
    await app.close();
    process.env.STORE_CONFIG_PATH = path.join(tmpDir, "empty-token.config.json");
    process.env.SETUP_TOKEN = "";
    app = await launchTestApp();

    const response = await request(app.baseUrl)
      .post("/api/setup/install")
      .set("x-setup-token", "")
      .send(VALID_INSTALL);
    expect(response.status).toBe(401);
  });
});
