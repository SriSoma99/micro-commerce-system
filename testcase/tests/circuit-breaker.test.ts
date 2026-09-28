import request from "supertest";
import { launchTestApp, RunningTestApp, setSimulatedFailureRate, shutdownBreakers } from "../support/testApp";

/**
 * Exercises the actual Opossum circuit breaker configured in
 * product-catalog-service/src/services/catalogService.ts — this is the
 * one part of the suite that talks to the *real* breaker timing
 * (timeout: 2000ms, errorThresholdPercentage: 50%, resetTimeout: 15000ms)
 * rather than mocking it out, because the timing behavior itself is what's
 * under test. TC-033 genuinely waits out the 15s resetTimeout; this file
 * is intentionally the slowest in the suite.
 */
describe("Circuit Breaker Resilience (product-catalog-service)", () => {
  let app: RunningTestApp;
  let logSpy: jest.SpiedFunction<typeof console.log>;
  let previousLatency: string | undefined;

  const capturedLogs = () => logSpy.mock.calls.map((args) => args.join(" ")).join("\n");

  beforeAll(async () => {
    logSpy = jest.spyOn(console, "log");
    setSimulatedFailureRate(1); // downstream always fails
    // This suite is about slow/failing downstreams, so it opts back in to the
    // real 100-1900ms injected latency the other suites switch off.
    previousLatency = process.env.DB_SIMULATED_LATENCY_MAX_MS;
    process.env.DB_SIMULATED_LATENCY_MAX_MS = "1900";
    app = await launchTestApp();
  });

  afterAll(async () => {
    logSpy.mockRestore();
    await app.close();
    shutdownBreakers();
    if (previousLatency === undefined) delete process.env.DB_SIMULATED_LATENCY_MAX_MS;
    else process.env.DB_SIMULATED_LATENCY_MAX_MS = previousLatency;
  });

  // TC-030
  it("serves a fallback payload tagged isFallback: true when the downstream always fails", async () => {
    const response = await request(app.baseUrl).get("/api/products");

    expect(response.status).toBe(200);
    expect(response.body.isFallback).toBe(true);
    expect(response.body.source).toBe("circuit-breaker-fallback");
    expect(Array.isArray(response.body.data.items)).toBe(true);
    expect(response.body.data.items.length).toBeGreaterThan(0);
    // Stale data can't produce trustworthy counts, so degraded mode has no facets.
    expect(response.body.data.facets).toBeNull();
  });

  // TC-031 — with errorThresholdPercentage: 50 and no volumeThreshold floor,
  // a 100% failure rate is expected to trip the breaker within a handful
  // of requests. This asserts the OPEN transition actually happened and
  // was logged, not just that responses look like fallbacks.
  it(
    "trips the breaker to OPEN and logs the state transition",
    async () => {
      for (let i = 0; i < 6; i++) {
        await request(app.baseUrl).get("/api/products");
      }

      expect(capturedLogs()).toContain("state transition -> OPEN");
    },
    20000
  );

  // TC-032 — once OPEN, requests must short-circuit rather than actually
  // hit the repository (whose own injected latency alone is 100-1900ms).
  it("short-circuits OPEN-state requests near-instantly instead of querying the repository", async () => {
    const startedAt = Date.now();
    const response = await request(app.baseUrl).get("/api/products");
    const elapsedMs = Date.now() - startedAt;

    expect(response.body.isFallback).toBe(true);
    expect(elapsedMs).toBeLessThan(500);
  });

  // TC-033 — the full recovery path: once the downstream heals and
  // resetTimeout (15000ms) elapses, the breaker must probe HALF-OPEN and
  // close, and live traffic must resume.
  it(
    "recovers to CLOSED and serves live-core data again once the downstream heals",
    async () => {
      setSimulatedFailureRate(0); // downstream "recovers"

      await new Promise((resolve) => setTimeout(resolve, 15500));

      const response = await request(app.baseUrl).get("/api/products");

      expect(response.body.isFallback).toBe(false);
      expect(response.body.source).toBe("live-core");

      const logs = capturedLogs();
      expect(logs).toContain("state transition -> HALF-OPEN");
      expect(logs).toContain("state transition -> CLOSED");
    },
    20000
  );
});
