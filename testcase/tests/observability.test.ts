import http from "node:http";
import request from "supertest";
import { launchTestApp, RunningTestApp, setSimulatedFailureRate } from "../support/testApp";

describe("MELT Telemetry & Observability Engine (OBS-01..06)", () => {
  let app: RunningTestApp;
  let adminToken: string;
  let customerToken: string;

  beforeAll(async () => {
    process.env.ENABLE_CHAOS = "true";
    setSimulatedFailureRate(0);
    app = await launchTestApp();

    // Login as Admin
    const adminRes = await request(app.baseUrl)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "Demo@1234" });
    adminToken = adminRes.body.data.token;

    // Login as Customer
    const custRes = await request(app.baseUrl)
      .post("/api/auth/login")
      .send({ email: "demo@example.com", password: "Demo@1234" });
    customerToken = custRes.body.data.token;
  });

  afterAll(async () => {
    delete process.env.ENABLE_CHAOS;
    await app.close();
  });

  // TC-850: Prometheus & OpenTelemetry Metrics Exposition (OBS-01)
  describe("Prometheus Exposition Endpoint (/metrics)", () => {
    it("returns Prometheus text format metrics with histograms and gauges publicly", async () => {
      // Trigger a request to populate metrics
      await request(app.baseUrl).get("/health");

      const response = await request(app.baseUrl).get("/metrics");
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/plain");

      const text = response.text;
      expect(text).toContain("# HELP http_requests_total");
      expect(text).toContain("# TYPE http_requests_total counter");
      expect(text).toContain("http_requests_total");
      expect(text).toContain("http_request_duration_seconds_bucket");
      expect(text).toContain("sqlite_query_duration_seconds_bucket");
      expect(text).toContain("circuit_breaker_state");
      expect(text).toContain("checkout_conversions_total");
    });

    it("rejects unauthenticated / non-admin access to /api/observability/stats", async () => {
      const unauth = await request(app.baseUrl).get("/api/observability/stats");
      expect(unauth.status).toBe(401);

      // Query parameter token must NOT be accepted on REST routes (only SSE stream routes)
      const queryTokenRest = await request(app.baseUrl).get(`/api/observability/stats?token=${adminToken}`);
      expect(queryTokenRest.status).toBe(401);

      const forbidden = await request(app.baseUrl)
        .get("/api/observability/stats")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(forbidden.status).toBe(403);
    });

    it("returns parsed JSON stats at /api/observability/stats with admin token", async () => {
      const response = await request(app.baseUrl)
        .get("/api/observability/stats")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("metrics");
      expect(response.body.data.metrics).toHaveProperty("totalRequests");
      expect(response.body.data.metrics).toHaveProperty("httpLatency");
      expect(response.body.data.metrics.httpLatency).toHaveProperty("p50Ms");
      expect(response.body.data.metrics.httpLatency).toHaveProperty("p95Ms");
      expect(response.body.data.metrics).toHaveProperty("circuitBreakers");
      expect(Array.isArray(response.body.data.metrics.circuitBreakers)).toBe(true);
    });
  });

  // TC-851: Real-time Domain Event Bus (OBS-02)
  describe("Domain Event Bus (/api/observability/events)", () => {
    it("buffers domain events and returns them chronologically to admin", async () => {
      const response = await request(app.baseUrl)
        .get("/api/observability/events")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(Array.isArray(response.body.data.events)).toBe(true);
      expect(typeof response.body.data.count).toBe("number");
    });

    it("supports filtering domain events by type for admin", async () => {
      const response = await request(app.baseUrl)
        .get("/api/observability/events?type=ORDER_PLACED")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(Array.isArray(response.body.data.events)).toBe(true);
    });
  });

  // TC-852: Structured JSON Logging Envelope (OBS-03)
  describe("Structured JSON Logs (/api/observability/logs)", () => {
    it("returns structured JSON logs with level, scope, timestamp, and trace correlation to admin", async () => {
      const response = await request(app.baseUrl)
        .get("/api/observability/logs")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(Array.isArray(response.body.data.logs)).toBe(true);
      expect(typeof response.body.data.count).toBe("number");

      if (response.body.data.logs.length > 0) {
        const log = response.body.data.logs[0];
        expect(log).toHaveProperty("id");
        expect(log).toHaveProperty("timestamp");
        expect(log).toHaveProperty("level");
        expect(log).toHaveProperty("scope");
        expect(log).toHaveProperty("message");
      }
    });

    it("supports filtering logs by level and text search for admin", async () => {
      const response = await request(app.baseUrl)
        .get("/api/observability/logs?level=INFO")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(Array.isArray(response.body.data.logs)).toBe(true);
    });
  });

  // TC-853: Distributed W3C Trace Propagation (OBS-04)
  describe("W3C Distributed Trace Propagation", () => {
    it("propagates W3C traceparent header and echoes trace ID in response headers", async () => {
      const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
      const parentId = "00f067aa0ba902b7";
      const incomingTraceparent = `00-${traceId}-${parentId}-01`;

      const response = await request(app.baseUrl)
        .get("/health/live")
        .set("traceparent", incomingTraceparent);

      expect(response.status).toBe(200);
      expect(response.headers["traceresponse"]).toBeDefined();
      expect(response.headers["traceresponse"]).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
      expect(response.headers["x-request-id"]).toBeDefined();
      expect(response.headers["traceresponse"]).toContain(traceId);
    });

    it("propagates an existing incoming W3C traceparent header across middleware", async () => {
      const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
      const spanId = "00f067aa0ba902b7";
      const incomingTraceparent = `00-${traceId}-${spanId}-01`;

      const response = await request(app.baseUrl)
        .get("/health/live")
        .set("traceparent", incomingTraceparent);

      expect(response.status).toBe(200);
      expect(response.headers["traceresponse"]).toContain(traceId);
    });
  });

  // TC-854: Orchestrator Health Probes (OBS-05)
  describe("Orchestrator Probes (/health/live, /health/ready, /health/db)", () => {
    it("GET /health/live returns 200 with service heartbeat", async () => {
      const response = await request(app.baseUrl).get("/health/live");
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ok");
      expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it("GET /health/ready returns 200 ready probe", async () => {
      const response = await request(app.baseUrl).get("/health/ready");
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ok");
      expect(response.body.check).toBe("readiness");
      expect(response.body.database).toBe("connected");
    });

    it("GET /health/db returns 200 with table statistics", async () => {
      const response = await request(app.baseUrl).get("/health/db");
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ok");
      expect(response.body.tableCount).toBeGreaterThan(0);
      expect(response.body.journalMode.toLowerCase()).toBe("wal");
    });
  });

  // TC-855: Chaos Engineering & Resilience Controller (OBS-06)
  describe("Chaos Engineering Controller (/api/observability/chaos)", () => {
    it("rejects unauthenticated or non-admin attempts to update chaos settings", async () => {
      const unauth = await request(app.baseUrl)
        .post("/api/observability/chaos")
        .send({ simulatedLatencyMs: 50 });
      expect(unauth.status).toBe(401);

      const forbidden = await request(app.baseUrl)
        .post("/api/observability/chaos")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ simulatedLatencyMs: 50 });
      expect(forbidden.status).toBe(403);
    });

    it("safely handles missing request body without throwing 500 error", async () => {
      const res = await request(app.baseUrl)
        .post("/api/observability/chaos")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });

    it("updates simulated chaos parameters and records CHAOS_INJECTED domain event for admin", async () => {
      const chaosPayload = {
        simulatedLatencyMs: 25,
        failureRatePercent: 0,
        forceCircuitTrip: false,
      };

      const patchRes = await request(app.baseUrl)
        .post("/api/observability/chaos")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(chaosPayload);

      expect(patchRes.status).toBe(200);
      expect(patchRes.body).toHaveProperty("data");
      expect(patchRes.body.data.settings.simulatedLatencyMs).toBe(25);

      // Verify stats reflect updated chaos parameters
      const statsRes = await request(app.baseUrl)
        .get("/api/observability/stats")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.data.chaos.simulatedLatencyMs).toBe(25);

      // Reset chaos back to 0
      await request(app.baseUrl)
        .post("/api/observability/chaos")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ simulatedLatencyMs: 0, failureRatePercent: 0, forceCircuitTrip: false });
    });
  });

  // TC-856: a session token in the query string is honoured on the SSE stream routes only
  // (EventSource can't send an Authorization header); every REST route needs the Bearer header.
  describe("Query-string session token scope", () => {
    /** Opens an SSE URL, reports the response head, then hangs up (a stream never ends on its own). */
    const openStream = (path: string): Promise<{ status: number; contentType: string }> =>
      new Promise((resolve, reject) => {
        const req = http.get(`${app.baseUrl}${path}`, (res) => {
          resolve({ status: res.statusCode ?? 0, contentType: String(res.headers["content-type"] ?? "") });
          req.destroy();
        });
        req.on("error", (err) => {
          if ((err as NodeJS.ErrnoException).code !== "ECONNRESET") reject(err);
        });
      });

    it("accepts ?token= on the events and logs stream routes for an admin", async () => {
      for (const path of ["/api/observability/events/stream", "/api/observability/logs/stream"]) {
        const head = await openStream(`${path}?token=${adminToken}`);
        expect(head.status).toBe(200);
        expect(head.contentType).toContain("text/event-stream");
      }
    });

    it("rejects stream routes with no token (401) or a non-admin token (403)", async () => {
      expect((await openStream("/api/observability/events/stream")).status).toBe(401);
      expect((await openStream(`/api/observability/events/stream?token=${customerToken}`)).status).toBe(403);
    });

    it("rejects ?token= on REST routes, including when '/stream' is smuggled into the query string", async () => {
      const urls = [
        `/api/customers/me?token=${customerToken}`,
        `/api/customers/me?token=${customerToken}&x=/stream`,
        `/api/customers/me?x=/stream&token=${customerToken}`,
        `/api/observability/stats?token=${adminToken}&x=/stream`,
      ];
      for (const url of urls) {
        const response = await request(app.baseUrl).get(url);
        expect({ url, status: response.status }).toEqual({ url, status: 401 });
      }
    });

    it("still accepts the Authorization header on REST routes", async () => {
      const response = await request(app.baseUrl).get("/api/customers/me").set("Authorization", `Bearer ${customerToken}`);
      expect(response.status).toBe(200);
    });
  });
});
