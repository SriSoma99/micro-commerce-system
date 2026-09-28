import { Router } from "express";
import { observabilityController } from "../controllers/observabilityController";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

// 1. Prometheus Scraping & Health Probes (Public / Orchestrator friendly)
router.get("/metrics", observabilityController.getPrometheusMetrics);
router.get("/health/live", observabilityController.getLiveness);
router.get("/health/ready", observabilityController.getReadiness);
router.get("/health/db", observabilityController.getDbHealth);
router.get("/health/circuit-breaker", observabilityController.getCircuitBreakerHealth);

// 2. Observability & Telemetry API (Admin protected)
router.get("/api/observability/stats", requireAuth, requireRole("admin"), observabilityController.getTelemetryStats);
router.get("/api/observability/events", requireAuth, requireRole("admin"), observabilityController.getRecentEvents);
router.get("/api/observability/events/stream", requireAuth, requireRole("admin"), observabilityController.streamEvents);
router.get("/api/observability/logs", requireAuth, requireRole("admin"), observabilityController.getRecentLogs);
router.get("/api/observability/logs/stream", requireAuth, requireRole("admin"), observabilityController.streamLogs);
router.post("/api/observability/chaos", requireAuth, requireRole("admin"), observabilityController.updateChaosSettings);

export { router as observabilityRouter };
