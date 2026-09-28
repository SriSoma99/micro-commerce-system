import request from "supertest";
import { launchTestApp, RunningTestApp } from "../support/testApp";

const DEMO_PASSWORD = "Demo@1234";

describe("Customer profile & address book", () => {
  let app: RunningTestApp;

  beforeAll(async () => {
    app = await launchTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  /** Fresh account per describe-block so tests don't trample the shared seeded ones. */
  async function registerFresh(label: string): Promise<{ auth: { Authorization: string }; email: string }> {
    const email = `${label}.${Date.now()}@example.com`;
    const response = await request(app.baseUrl)
      .post("/api/auth/register")
      .send({ email, password: "Fresh@2026", name: `Test ${label}` });
    return { auth: { Authorization: `Bearer ${response.body.data.token}` }, email };
  }

  async function signInSeeded(email: string): Promise<{ Authorization: string }> {
    const response = await request(app.baseUrl).post("/api/auth/login").send({ email, password: DEMO_PASSWORD });
    return { Authorization: `Bearer ${response.body.data.token}` };
  }

  const validAddress = {
    kind: "shipping",
    recipient: "Pat Shopper",
    line1: "12 Test Street",
    city: "Batavia",
    region: "il",
    postalCode: "60510",
  };

  describe("profile", () => {
    // TC-100
    it("GET /customers/me returns the signed-in customer's profile", async () => {
      const auth = await signInSeeded("demo@example.com");
      const response = await request(app.baseUrl).get("/api/customers/me").set(auth);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ id: "cust_demo", name: "Demo Shopper", marketingOptIn: true });
    });

    // TC-101
    it("PATCH updates only the supplied fields", async () => {
      const { auth } = await registerFresh("patch");
      const response = await request(app.baseUrl)
        .patch("/api/customers/me")
        .set(auth)
        .send({ phone: "+1 (630) 555-0142", marketingOptIn: true });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ phone: "+1 (630) 555-0142", marketingOptIn: true });
      expect(response.body.data.name).toMatch(/^Test patch/);

      const reread = await request(app.baseUrl).get("/api/customers/me").set(auth);
      expect(reread.body.data.phone).toBe("+1 (630) 555-0142");
    });

    // TC-102
    it("PATCH rejects invalid values and empty bodies", async () => {
      const { auth } = await registerFresh("badpatch");
      const bad = await request(app.baseUrl)
        .patch("/api/customers/me")
        .set(auth)
        .send({ phone: "abc", marketingOptIn: "yes" });
      expect(bad.status).toBe(400);
      expect(bad.body.details).toHaveLength(2);

      expect((await request(app.baseUrl).patch("/api/customers/me").set(auth).send({})).status).toBe(400);
    });

    // TC-103
    it("PATCH cannot change email, role or status", async () => {
      const { auth, email } = await registerFresh("immutable");
      const response = await request(app.baseUrl)
        .patch("/api/customers/me")
        .set(auth)
        .send({ name: "Renamed", email: "hijack@example.com", role: "admin", status: "deleted" });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ name: "Renamed", email, role: "customer", status: "active" });
    });

    // TC-104
    it("DELETE anonymizes the account: needs the password, ends sessions, blocks re-login", async () => {
      const { auth, email } = await registerFresh("delete");

      const noPassword = await request(app.baseUrl).delete("/api/customers/me").set(auth).send({});
      expect(noPassword.status).toBe(400);
      const wrongPassword = await request(app.baseUrl).delete("/api/customers/me").set(auth).send({ password: "Wrong@1234" });
      expect(wrongPassword.status).toBe(401);

      const deleted = await request(app.baseUrl).delete("/api/customers/me").set(auth).send({ password: "Fresh@2026" });
      expect(deleted.status).toBe(204);

      expect((await request(app.baseUrl).get("/api/customers/me").set(auth)).status).toBe(401);
      const relogin = await request(app.baseUrl).post("/api/auth/login").send({ email, password: "Fresh@2026" });
      expect(relogin.status).toBe(401);

      // The email is free to register again - it was scrubbed, not just flagged.
      const again = await request(app.baseUrl)
        .post("/api/auth/register")
        .send({ email, password: "Fresh@2026", name: "Back Again" });
      expect(again.status).toBe(201);
    });
  });

  describe("addresses", () => {
    // TC-110
    it("lists a seeded customer's synthetic addresses, one default per kind", async () => {
      const auth = await signInSeeded("demo@example.com");
      const response = await request(app.baseUrl).get("/api/customers/me/addresses").set(auth);

      expect(response.status).toBe(200);
      const addresses = response.body.data as { kind: string; isDefault: boolean; country: string }[];
      expect(addresses.length).toBeGreaterThanOrEqual(2); // demo has shipping + billing on file
      for (const kind of ["shipping", "billing"]) {
        expect(addresses.filter((a) => a.kind === kind && a.isDefault)).toHaveLength(1);
      }
      expect(addresses.every((a) => a.country === "US")).toBe(true);
    });

    // TC-111
    it("creates an address; the first of a kind becomes the default; region is normalised to upper case", async () => {
      const { auth } = await registerFresh("addr");
      const created = await request(app.baseUrl).post("/api/customers/me/addresses").set(auth).send(validAddress);

      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ region: "IL", postalCode: "60510", country: "US", isDefault: true });
      expect(created.body.data.id).toMatch(/^addr_/);
    });

    // TC-112
    it("validates US state and ZIP format from the region pack", async () => {
      const { auth } = await registerFresh("addrbad");
      const response = await request(app.baseUrl)
        .post("/api/customers/me/addresses")
        .set(auth)
        .send({ ...validAddress, region: "Illinois", postalCode: "6051" });

      expect(response.status).toBe(400);
      const details: string[] = response.body.details;
      expect(details.some((d) => d.startsWith("region"))).toBe(true);
      expect(details.some((d) => d.startsWith("postalCode"))).toBe(true);

      const missing = await request(app.baseUrl).post("/api/customers/me/addresses").set(auth).send({ kind: "shipping" });
      expect(missing.status).toBe(400);
    });

    // TC-113
    it("marking a new address as default demotes the previous default of that kind only", async () => {
      const { auth } = await registerFresh("default");
      const first = (await request(app.baseUrl).post("/api/customers/me/addresses").set(auth).send(validAddress)).body.data;
      const second = (
        await request(app.baseUrl)
          .post("/api/customers/me/addresses")
          .set(auth)
          .send({ ...validAddress, line1: "99 Other Rd", isDefault: true })
      ).body.data;
      const billing = (
        await request(app.baseUrl).post("/api/customers/me/addresses").set(auth).send({ ...validAddress, kind: "billing" })
      ).body.data;

      const list = (await request(app.baseUrl).get("/api/customers/me/addresses").set(auth)).body.data as {
        id: string;
        isDefault: boolean;
      }[];
      const byId = Object.fromEntries(list.map((a) => [a.id, a.isDefault]));
      expect(byId[first.id]).toBe(false);
      expect(byId[second.id]).toBe(true);
      expect(byId[billing.id]).toBe(true); // billing has its own default, untouched
    });

    // TC-114
    it("PATCH updates fields, keeps kind immutable, and can't un-default the default", async () => {
      const { auth } = await registerFresh("addrpatch");
      const created = (await request(app.baseUrl).post("/api/customers/me/addresses").set(auth).send(validAddress)).body.data;
      const url = `/api/customers/me/addresses/${created.id}`;

      const updated = await request(app.baseUrl).patch(url).set(auth).send({ city: "Aurora", isDefault: false });
      expect(updated.status).toBe(200);
      expect(updated.body.data).toMatchObject({ city: "Aurora", line1: "12 Test Street", isDefault: true });

      const kindChange = await request(app.baseUrl).patch(url).set(auth).send({ kind: "billing" });
      expect(kindChange.status).toBe(400);
    });

    // TC-115
    it("DELETE removes an address and promotes another of the same kind to default", async () => {
      const { auth } = await registerFresh("addrdel");
      const first = (await request(app.baseUrl).post("/api/customers/me/addresses").set(auth).send(validAddress)).body.data;
      const second = (
        await request(app.baseUrl).post("/api/customers/me/addresses").set(auth).send({ ...validAddress, line1: "2 Second St" })
      ).body.data;

      expect((await request(app.baseUrl).delete(`/api/customers/me/addresses/${first.id}`).set(auth)).status).toBe(204);

      const list = (await request(app.baseUrl).get("/api/customers/me/addresses").set(auth)).body.data;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: second.id, isDefault: true });
    });

    // TC-116
    it("unknown address id returns 404 ADDRESS_NOT_FOUND on patch and delete", async () => {
      const { auth } = await registerFresh("addr404");
      const patch = await request(app.baseUrl).patch("/api/customers/me/addresses/addr_nope").set(auth).send({ city: "X" });
      const del = await request(app.baseUrl).delete("/api/customers/me/addresses/addr_nope").set(auth);

      expect(patch.status).toBe(404);
      expect(patch.body.error).toBe("ADDRESS_NOT_FOUND");
      expect(del.status).toBe(404);
    });

    // TC-117
    it("one customer cannot read, edit or delete another customer's address", async () => {
      const alice = (await registerFresh("alice")).auth;
      const mallory = (await registerFresh("mallory")).auth;
      const aliceAddress = (await request(app.baseUrl).post("/api/customers/me/addresses").set(alice).send(validAddress)).body.data;
      const url = `/api/customers/me/addresses/${aliceAddress.id}`;

      expect((await request(app.baseUrl).patch(url).set(mallory).send({ city: "Hacked" })).status).toBe(404);
      expect((await request(app.baseUrl).delete(url).set(mallory)).status).toBe(404);
      expect((await request(app.baseUrl).get("/api/customers/me/addresses").set(mallory)).body.data).toEqual([]);

      const intact = (await request(app.baseUrl).get("/api/customers/me/addresses").set(alice)).body.data;
      expect(intact[0]).toMatchObject({ id: aliceAddress.id, city: "Batavia" });
    });

    // TC-118
    it("caps the address book at 20 with 409 ADDRESS_LIMIT", async () => {
      const { auth } = await registerFresh("limit");
      for (let i = 0; i < 20; i++) {
        const ok = await request(app.baseUrl)
          .post("/api/customers/me/addresses")
          .set(auth)
          .send({ ...validAddress, line1: `${i} Loop Rd` });
        expect(ok.status).toBe(201);
      }
      const over = await request(app.baseUrl).post("/api/customers/me/addresses").set(auth).send(validAddress);
      expect(over.status).toBe(409);
      expect(over.body.error).toBe("ADDRESS_LIMIT");
    });
  });
});
