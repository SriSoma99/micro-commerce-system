import request from "supertest";
import { launchTestApp, RunningTestApp } from "../support/testApp";

const DEMO_PASSWORD = "Demo@1234"; // documented password for every synthetic customer

describe("Authentication against the customer database", () => {
  let app: RunningTestApp;

  beforeAll(async () => {
    app = await launchTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (email: string, password: string) =>
    request(app.baseUrl).post("/api/auth/login").send({ email, password });

  // TC-080
  it("signs in a seeded synthetic customer and returns a token + public profile", async () => {
    const response = await login("demo@example.com", DEMO_PASSWORD);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ isFallback: false, source: "live-core" });
    expect(response.body.data.customer).toMatchObject({
      id: "cust_demo",
      email: "demo@example.com",
      role: "customer",
      status: "active",
    });
    expect(typeof response.body.data.token).toBe("string");
    expect(response.body.data.token.length).toBeGreaterThan(30);
    expect(new Date(response.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  // TC-081
  it("never leaks the password hash or lockout fields in any auth response", async () => {
    const response = await login("demo@example.com", DEMO_PASSWORD);
    const body = JSON.stringify(response.body);

    expect(body).not.toMatch(/password/i);
    expect(body).not.toMatch(/scrypt/);
    expect(body).not.toMatch(/failed_?logins|locked_?until/i);
  });

  // TC-082
  it("matches email case-insensitively", async () => {
    const response = await login("  DEMO@Example.COM ", DEMO_PASSWORD);
    expect(response.status).toBe(200);
  });

  // TC-083
  it("returns an identical 401 for a wrong password and for an unknown email", async () => {
    const wrongPassword = await login("demo@example.com", "Wrong@1234");
    const unknownEmail = await login("nobody@example.com", "Wrong@1234");

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error).toBe("INVALID_CREDENTIALS");
  });

  // TC-084
  it("requires both email and password", async () => {
    const response = await request(app.baseUrl).post("/api/auth/login").send({ email: "demo@example.com" });
    expect(response.status).toBe(400);
  });

  // TC-085
  it("locks the account after 5 failed attempts, even for the right password", async () => {
    const email = "emma.wilson1@example.com"; // a generated synthetic customer (i = 0)
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await login(email, "Wrong@1234")).status).toBe(401);
    }

    const locked = await login(email, DEMO_PASSWORD);
    expect(locked.status).toBe(429);
    expect(locked.body.error).toBe("ACCOUNT_LOCKED");
  });

  // TC-086
  it("a successful login resets the failure counter", async () => {
    const email = "liam.clark2@example.com";
    for (let attempt = 0; attempt < 4; attempt++) await login(email, "Wrong@1234");
    expect((await login(email, DEMO_PASSWORD)).status).toBe(200);

    // Counter was cleared, so four more failures still don't lock the account.
    for (let attempt = 0; attempt < 4; attempt++) await login(email, "Wrong@1234");
    expect((await login(email, DEMO_PASSWORD)).status).toBe(200);
  });

  // TC-087
  it("seeds an admin and a store-manager role for later modules", async () => {
    const admin = await login("admin@example.com", DEMO_PASSWORD);
    const manager = await login("manager@example.com", DEMO_PASSWORD);

    expect(admin.body.data.customer.role).toBe("admin");
    expect(manager.body.data.customer.role).toBe("store-manager");
  });

  describe("registration", () => {
    // TC-088
    it("registers a new customer, signs them in, and they can log in again", async () => {
      const register = await request(app.baseUrl)
        .post("/api/auth/register")
        .send({ email: "New.Shopper@Example.com", password: "Fresh@2026", name: "New Shopper" });

      expect(register.status).toBe(201);
      expect(register.body.data.customer).toMatchObject({ email: "new.shopper@example.com", role: "customer" });
      expect(typeof register.body.data.token).toBe("string");

      expect((await login("new.shopper@example.com", "Fresh@2026")).status).toBe(200);
    });

    // TC-089
    it("rejects a duplicate email (case-insensitive) with 409", async () => {
      const response = await request(app.baseUrl)
        .post("/api/auth/register")
        .send({ email: "DEMO@example.com", password: "Fresh@2026", name: "Impostor" });
      expect(response.status).toBe(409);
      expect(response.body.error).toBe("EMAIL_TAKEN");
    });

    // TC-090
    it("rejects an invalid email and a weak password with field-level details", async () => {
      const response = await request(app.baseUrl)
        .post("/api/auth/register")
        .send({ email: "not-an-email", password: "short", name: " " });

      expect(response.status).toBe(400);
      const details: string[] = response.body.details;
      expect(details.some((d) => d.startsWith("email"))).toBe(true);
      expect(details.some((d) => d.startsWith("password"))).toBe(true);
      expect(details.some((d) => d.startsWith("name"))).toBe(true);

      const noNumber = await request(app.baseUrl)
        .post("/api/auth/register")
        .send({ email: "x@example.com", password: "onlyletters", name: "X" });
      expect(noNumber.status).toBe(400);
    });

    // TC-091
    it("can never register as an elevated role", async () => {
      const response = await request(app.baseUrl)
        .post("/api/auth/register")
        .send({ email: "sneaky@example.com", password: "Fresh@2026", name: "Sneaky", role: "admin" });
      expect(response.status).toBe(201);
      expect(response.body.data.customer.role).toBe("customer");
    });
  });

  describe("sessions", () => {
    // TC-092
    it("guards protected routes: no token, malformed header and bogus token are all 401", async () => {
      expect((await request(app.baseUrl).get("/api/customers/me")).status).toBe(401);
      expect(
        (await request(app.baseUrl).get("/api/customers/me").set("Authorization", "Basic abc")).status
      ).toBe(401);
      expect(
        (await request(app.baseUrl).get("/api/customers/me").set("Authorization", "Bearer not-a-real-token")).status
      ).toBe(401);
    });

    // TC-093
    it("logout invalidates the token", async () => {
      const { token } = (await login("demo@example.com", DEMO_PASSWORD)).body.data;
      const auth = { Authorization: `Bearer ${token}` };

      expect((await request(app.baseUrl).get("/api/customers/me").set(auth)).status).toBe(200);
      expect((await request(app.baseUrl).post("/api/auth/logout").set(auth)).status).toBe(204);
      expect((await request(app.baseUrl).get("/api/customers/me").set(auth)).status).toBe(401);
    });

    // TC-094
    it("two sign-ins give independent sessions", async () => {
      const first = (await login("demo@example.com", DEMO_PASSWORD)).body.data.token;
      const second = (await login("demo@example.com", DEMO_PASSWORD)).body.data.token;
      expect(first).not.toBe(second);

      await request(app.baseUrl).post("/api/auth/logout").set("Authorization", `Bearer ${first}`);
      expect(
        (await request(app.baseUrl).get("/api/customers/me").set("Authorization", `Bearer ${second}`)).status
      ).toBe(200);
    });
  });
});
