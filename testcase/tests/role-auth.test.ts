import request from "supertest";
import { launchTestApp, RunningTestApp } from "../support/testApp";

const DEMO_PASSWORD = "Demo@1234";

describe("Role Authorization & Identity (WS G, CUS-07, CUS-08, CUS-04)", () => {
  let app: RunningTestApp;

  beforeAll(async () => {
    app = await launchTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function signIn(email: string, password = DEMO_PASSWORD): Promise<{ Authorization: string; role: string; id: string }> {
    const response = await request(app.baseUrl).post("/api/auth/login").send({ email, password });
    return {
      Authorization: `Bearer ${response.body.data.token}`,
      role: response.body.data.customer.role,
      id: response.body.data.customer.id,
    };
  }

  // TC-700
  it("TC-700: Seeded users have their expected roles (customer, store-manager, admin)", async () => {
    const customer = await signIn("demo@example.com");
    expect(customer.role).toBe("customer");

    const manager = await signIn("manager@example.com");
    expect(manager.role).toBe("store-manager");

    const admin = await signIn("admin@example.com");
    expect(admin.role).toBe("admin");
  });

  // TC-701
  it("TC-701: Public self-registration always defaults to customer role", async () => {
    const email = `shopper.${Date.now()}@example.com`;
    const res = await request(app.baseUrl)
      .post("/api/auth/register")
      .send({ email, password: "Password@123", name: "Shopper Role Test" });

    expect(res.status).toBe(201);
    expect(res.body.data.customer.role).toBe("customer");
  });

  // TC-702
  it("TC-702: GET /api/customers/me/export exports personal data snapshot (CUS-04)", async () => {
    const auth = await signIn("demo@example.com");
    const res = await request(app.baseUrl).get("/api/customers/me/export").set({ Authorization: auth.Authorization });

    expect(res.status).toBe(200);
    expect(res.header["content-disposition"]).toContain("customer-data-");
    expect(res.body.data).toHaveProperty("customer");
    expect(res.body.data.customer.id).toBe("cust_demo");
    expect(res.body.data).toHaveProperty("addresses");
    expect(res.body.data).toHaveProperty("orders");
    expect(res.body.data).toHaveProperty("exportedAt");
  });

  // TC-703
  it("TC-703: Unauthenticated request to /api/customers/me/export returns 401", async () => {
    const res = await request(app.baseUrl).get("/api/customers/me/export");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("UNAUTHENTICATED");
  });
});
