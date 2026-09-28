import request from "supertest";
import { launchTestApp, RunningTestApp, setSimulatedFailureRate } from "../support/testApp";

describe("GET /health", () => {
  let app: RunningTestApp;

  beforeAll(async () => {
    setSimulatedFailureRate(0);
    app = await launchTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // TC-001
  it("returns 200 with the liveness payload", async () => {
    const response = await request(app.baseUrl).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "product-catalog-service" });
  });

  // TC-002
  it("returns a JSON content type", async () => {
    const response = await request(app.baseUrl).get("/health");

    expect(response.headers["content-type"]).toMatch(/application\/json/);
  });
});

describe("Unmatched routes", () => {
  let app: RunningTestApp;

  beforeAll(async () => {
    setSimulatedFailureRate(0);
    app = await launchTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // TC-003
  it("returns a structured 404 for an unknown route", async () => {
    const response = await request(app.baseUrl).get("/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "NOT_FOUND", message: "Route not found" });
  });
});
