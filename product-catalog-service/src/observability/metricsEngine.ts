import type { NextFunction, Request, Response } from "express";

/**
 * Prometheus & OpenTelemetry Metrics Engine (OBS-01 / WS S)
 * In-memory high-performance metrics collector supporting Prometheus text format
 */

interface HistogramBucket {
  le: number;
  count: number;
}

const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

class MetricsRegistry {
  private requestCounts = new Map<string, number>(); // "GET /api/catalog 200" -> count
  private requestDurations: number[] = []; // recent samples in seconds for p50/p95/p99
  private dbQueryCounts = new Map<string, number>();
  private dbQueryDurations: number[] = [];
  private circuitStates = new Map<string, number>(); // 0=CLOSED, 1=HALF_OPEN, 2=OPEN
  private circuitTrips = new Map<string, number>();
  private checkoutCounts = new Map<string, number>(); // "success card" -> count
  private totalRequests = 0;
  private totalErrors = 0;
  private startTime = Date.now();

  recordHttpRequest(method: string, route: string, status: number, durationSeconds: number): void {
    const normRoute = this.normalizeRoute(route);
    const key = `${method.toUpperCase()}|${normRoute}|${status}`;
    this.requestCounts.set(key, (this.requestCounts.get(key) || 0) + 1);
    this.totalRequests++;
    if (status >= 400) this.totalErrors++;

    // Retain rolling window of 1,000 duration samples for percentile calculations
    this.requestDurations.push(durationSeconds);
    if (this.requestDurations.length > 1000) {
      this.requestDurations.shift();
    }
  }

  recordDbQuery(operation: string, table: string, durationSeconds: number): void {
    const key = `${operation.toUpperCase()}|${table}`;
    this.dbQueryCounts.set(key, (this.dbQueryCounts.get(key) || 0) + 1);
    this.dbQueryDurations.push(durationSeconds);
    if (this.dbQueryDurations.length > 1000) {
      this.dbQueryDurations.shift();
    }
  }

  setCircuitBreakerState(name: string, state: "CLOSED" | "HALF_OPEN" | "OPEN"): void {
    const val = state === "CLOSED" ? 0 : state === "HALF_OPEN" ? 1 : 2;
    this.circuitStates.set(name, val);
  }

  recordCircuitTrip(name: string): void {
    this.circuitTrips.set(name, (this.circuitTrips.get(name) || 0) + 1);
  }

  recordCheckout(status: "success" | "failure", paymentMethod: string): void {
    const key = `${status}|${paymentMethod}`;
    this.checkoutCounts.set(key, (this.checkoutCounts.get(key) || 0) + 1);
  }

  private normalizeRoute(url: string): string {
    return url
      .split("?")[0]!
      .replace(/\/orders\/[a-zA-Z0-9_-]+/g, "/orders/:id")
      .replace(/\/products\/[a-zA-Z0-9_-]+/g, "/products/:id")
      .replace(/\/invoices\/[a-zA-Z0-9_-]+/g, "/invoices/:id")
      .replace(/\/stores\/[a-zA-Z0-9_-]+/g, "/stores/:id") || "/";
  }

  private getPercentile(samples: number[], p: number): number {
    if (samples.length === 0) return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const index = Math.floor((p / 100) * sorted.length);
    return sorted[Math.min(index, sorted.length - 1)] || 0;
  }

  getSummary() {
    const uptimeSeconds = (Date.now() - this.startTime) / 1000;
    const rps = uptimeSeconds > 0 ? Number((this.totalRequests / uptimeSeconds).toFixed(2)) : 0;
    const errorRate = this.totalRequests > 0 ? Number(((this.totalErrors / this.totalRequests) * 100).toFixed(2)) : 0;

    return {
      uptimeSeconds: Math.floor(uptimeSeconds),
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      requestsPerSecond: rps,
      errorRatePercent: errorRate,
      httpLatency: {
        p50Ms: Math.round(this.getPercentile(this.requestDurations, 50) * 1000),
        p95Ms: Math.round(this.getPercentile(this.requestDurations, 95) * 1000),
        p99Ms: Math.round(this.getPercentile(this.requestDurations, 99) * 1000),
        sampleCount: this.requestDurations.length,
      },
      dbLatency: {
        p50Ms: Math.round(this.getPercentile(this.dbQueryDurations, 50) * 1000),
        p95Ms: Math.round(this.getPercentile(this.dbQueryDurations, 95) * 1000),
        sampleCount: this.dbQueryDurations.length,
      },
      circuitBreakers: Array.from(this.circuitStates.entries()).map(([name, stateVal]) => ({
        name,
        state: stateVal === 0 ? "CLOSED" : stateVal === 1 ? "HALF_OPEN" : "OPEN",
        trips: this.circuitTrips.get(name) || 0,
      })),
    };
  }

  toPrometheusFormat(): string {
    const lines: string[] = [
      "# HELP http_requests_total Total number of HTTP requests processed.",
      "# TYPE http_requests_total counter",
    ];

    for (const [key, count] of this.requestCounts.entries()) {
      const [method, route, status] = key.split("|");
      lines.push(`http_requests_total{method="${method}",route="${route}",status="${status}"} ${count}`);
    }

    lines.push(
      "",
      "# HELP http_request_duration_seconds HTTP response latency histogram in seconds.",
      "# TYPE http_request_duration_seconds histogram"
    );

    const buckets: HistogramBucket[] = DURATION_BUCKETS.map((le) => ({
      le,
      count: this.requestDurations.filter((d) => d <= le).length,
    }));
    const totalDuration = this.requestDurations.reduce((sum, d) => sum + d, 0);

    for (const b of buckets) {
      lines.push(`http_request_duration_seconds_bucket{le="${b.le}"} ${b.count}`);
    }
    lines.push(`http_request_duration_seconds_bucket{le="+Inf"} ${this.requestDurations.length}`);
    lines.push(`http_request_duration_seconds_sum ${totalDuration.toFixed(4)}`);
    lines.push(`http_request_duration_seconds_count ${this.requestDurations.length}`);

    lines.push(
      "",
      "# HELP sqlite_query_duration_seconds SQLite query latency histogram in seconds.",
      "# TYPE sqlite_query_duration_seconds histogram"
    );
    const dbBuckets: HistogramBucket[] = DURATION_BUCKETS.map((le) => ({
      le,
      count: this.dbQueryDurations.filter((d) => d <= le).length,
    }));
    const totalDbDuration = this.dbQueryDurations.reduce((sum, d) => sum + d, 0);
    for (const b of dbBuckets) {
      lines.push(`sqlite_query_duration_seconds_bucket{le="${b.le}"} ${b.count}`);
    }
    lines.push(`sqlite_query_duration_seconds_bucket{le="+Inf"} ${this.dbQueryDurations.length}`);
    lines.push(`sqlite_query_duration_seconds_sum ${totalDbDuration.toFixed(4)}`);
    lines.push(`sqlite_query_duration_seconds_count ${this.dbQueryDurations.length}`);

    lines.push(
      "",
      "# HELP circuit_breaker_state Circuit breaker status (0=CLOSED, 1=HALF_OPEN, 2=OPEN).",
      "# TYPE circuit_breaker_state gauge"
    );
    for (const [name, state] of this.circuitStates.entries()) {
      lines.push(`circuit_breaker_state{name="${name}"} ${state}`);
    }

    lines.push(
      "",
      "# HELP checkout_conversions_total Total checkout attempts by outcome and payment method.",
      "# TYPE checkout_conversions_total counter"
    );
    for (const [key, count] of this.checkoutCounts.entries()) {
      const [status, paymentMethod] = key.split("|");
      lines.push(`checkout_conversions_total{status="${status}",payment_method="${paymentMethod}"} ${count}`);
    }

    return lines.join("\n") + "\n";
  }
}

export const metricsRegistry = new MetricsRegistry();

// Initialize default circuit breaker states
metricsRegistry.setCircuitBreakerState("sqlite_database", "CLOSED");
metricsRegistry.setCircuitBreakerState("payment_simulator", "CLOSED");

/** Express middleware recording request counts and latency histograms */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationSeconds = Number(end - start) / 1_000_000_000;
    metricsRegistry.recordHttpRequest(req.method, req.route?.path || req.path, res.statusCode, durationSeconds);
  });

  next();
}
