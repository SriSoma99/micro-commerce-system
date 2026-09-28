import type { NextFunction, Request, Response } from "express";
import { domainEventBus } from "./domainEventBus";
import { metricsRegistry } from "./metricsEngine";
import { logger } from "../utils/logger";

export interface ChaosSettings {
  simulatedLatencyMs: number;
  failureRatePercent: number;
  forceCircuitTrip: boolean;
  activeChaosName?: string;
}

class ChaosManager {
  private settings: ChaosSettings = {
    simulatedLatencyMs: 0,
    failureRatePercent: 0,
    forceCircuitTrip: false,
  };

  getSettings(): ChaosSettings {
    return { ...this.settings };
  }

  updateSettings(patch: Partial<ChaosSettings>): ChaosSettings {
    this.settings = {
      ...this.settings,
      ...patch,
      simulatedLatencyMs: Math.max(0, Math.min(patch.simulatedLatencyMs ?? this.settings.simulatedLatencyMs, 5000)),
      failureRatePercent: Math.max(0, Math.min(patch.failureRatePercent ?? this.settings.failureRatePercent, 100)),
    };

    if (this.settings.forceCircuitTrip) {
      metricsRegistry.setCircuitBreakerState("sqlite_database", "OPEN");
      metricsRegistry.recordCircuitTrip("sqlite_database");
      logger.circuit("ChaosManager", "⚠️ Force-tripped SQLite database circuit breaker to OPEN state");
    } else {
      metricsRegistry.setCircuitBreakerState("sqlite_database", "CLOSED");
    }

    domainEventBus.publish({
      type: "CHAOS_INJECTED",
      summary: `Chaos parameters updated: latency=${this.settings.simulatedLatencyMs}ms, failureRate=${this.settings.failureRatePercent}%, forceTrip=${this.settings.forceCircuitTrip}`,
      payload: { ...this.settings },
    });

    return this.getSettings();
  }
}

export const chaosManager = new ChaosManager();

/** Express middleware for injecting chaos (latency and simulated failure) */
export async function chaosMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Exclude observability & metrics endpoints from chaos to preserve dashboard functionality
  if (req.path.startsWith("/api/observability") || req.path === "/metrics" || req.path.startsWith("/health")) {
    return next();
  }

  const settings = chaosManager.getSettings();

  // 1. Force Circuit Breaker Trip
  if (settings.forceCircuitTrip) {
    logger.circuit("CircuitBreaker", "Fast-failing request due to OPEN circuit breaker state", req.trace?.traceId);
    res.status(503).json({
      error: "CIRCUIT_BREAKER_OPEN",
      message: "Downstream data service is currently unavailable (circuit breaker OPEN). Self-healing in progress.",
      isFallback: true,
    });
    return;
  }

  // 2. Simulated Latency
  if (settings.simulatedLatencyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, settings.simulatedLatencyMs));
  }

  // 3. Simulated Failure Rate
  if (settings.failureRatePercent > 0) {
    const roll = Math.random() * 100;
    if (roll < settings.failureRatePercent) {
      logger.error("ChaosInjection", `Simulated random failure triggered (${roll.toFixed(1)} < ${settings.failureRatePercent}%)`, req.trace?.traceId);
      res.status(500).json({
        error: "SIMULATED_FAULT",
        message: "Fault injected by Observability Chaos Engineering controller.",
      });
      return;
    }
  }

  next();
}
