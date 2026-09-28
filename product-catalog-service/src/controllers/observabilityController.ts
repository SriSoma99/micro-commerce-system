import type { Request, Response } from "express";
import { getDb } from "../db/database";
import { getPlatform } from "../platform/platform";
import { chaosManager } from "../observability/chaosController";
import { domainEventBus, type DomainEventType } from "../observability/domainEventBus";
import { metricsRegistry } from "../observability/metricsEngine";
import { logger, type LogLevel } from "../utils/logger";

function makePayload<T>(data: T) {
  return {
    data,
    isFallback: false,
    source: "live-core",
    retrievedAt: new Date().toISOString(),
  };
}

export const observabilityController = {
  getPrometheusMetrics(_req: Request, res: Response): void {
    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(metricsRegistry.toPrometheusFormat());
  },

  getLiveness(_req: Request, res: Response): void {
    res.status(200).json({
      status: "ok",
      check: "liveness",
      service: "product-catalog-service",
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  },

  getReadiness(_req: Request, res: Response): void {
    try {
      const db = getDb();
      db.prepare("SELECT 1").get();
      const platform = getPlatform();

      res.status(200).json({
        status: "ok",
        check: "readiness",
        service: "product-catalog-service",
        database: "connected",
        platformInstalled: Boolean(platform),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(503).json({
        status: "error",
        check: "readiness",
        error: err instanceof Error ? err.message : "Database not ready",
      });
    }
  },

  getDbHealth(_req: Request, res: Response): void {
    try {
      const start = process.hrtime.bigint();
      const db = getDb();
      const { count } = db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table'").get() as { count: number };
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

      res.status(200).json({
        status: "ok",
        dialect: "sqlite3",
        journalMode: "wal",
        tableCount: count,
        queryLatencyMs: Number(durationMs.toFixed(3)),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(503).json({
        status: "error",
        error: err instanceof Error ? err.message : "Database query failure",
      });
    }
  },

  getCircuitBreakerHealth(_req: Request, res: Response): void {
    const summary = metricsRegistry.getSummary();
    res.status(200).json({
      status: "ok",
      circuitBreakers: summary.circuitBreakers,
      timestamp: new Date().toISOString(),
    });
  },

  getTelemetryStats(_req: Request, res: Response): void {
    const metrics = metricsRegistry.getSummary();
    const chaos = chaosManager.getSettings();
    const activeSseSubscribers = domainEventBus.getActiveSubscriberCount();

    res.json(
      makePayload({
        metrics,
        chaos,
        activeSseSubscribers,
      })
    );
  },

  getRecentEvents(req: Request, res: Response): void {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const type = req.query.type as DomainEventType | undefined;
    const events = domainEventBus.getRecentEvents(limit, type);
    res.json(makePayload({ events, count: events.length }));
  },

  streamEvents(_req: Request, res: Response): void {
    domainEventBus.registerSseClient(res);
  },

  getRecentLogs(req: Request, res: Response): void {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const level = req.query.level as LogLevel | undefined;
    const search = req.query.search as string | undefined;
    const logs = logger.getRecentLogs(limit, level, search);
    res.json(makePayload({ logs, count: logs.length }));
  },

  streamLogs(_req: Request, res: Response): void {
    logger.registerLogSseClient(res);
  },

  updateChaosSettings(req: Request, res: Response): void {
    if (process.env.ENABLE_CHAOS !== "true") {
      res.status(403).json({ error: "FORBIDDEN", message: "Chaos testing is disabled in this environment" });
      return;
    }
    const patch = (req.body && typeof req.body === "object") ? req.body : {};
    const updated = chaosManager.updateSettings(patch);
    res.json(makePayload({ ok: true, settings: updated }));
  },
};
