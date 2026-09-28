import type { ResilienceSource } from "../types/product";

export interface SystemStatus {
  source: ResilienceSource;
  retrievedAt: string;
}

interface StatusBadgeProps {
  status: SystemStatus | null;
}

/**
 * Header indicator proving the resiliency mechanism live in the UI: it
 * reflects whichever backend response (list or detail) was most recently
 * received, and switches appearance the instant the circuit breaker trips
 * or recovers — no page reload required.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  if (!status) {
    return (
      <div className="status-badge status-badge--pending" role="status">
        <span className="status-badge__dot" />
        Connecting to Catalog Service&hellip;
      </div>
    );
  }

  const isLive = status.source === "live-core";
  const label = isLive ? "Live Core Microservice" : "Circuit Breaker Fallback Node";
  const time = new Date(status.retrievedAt).toLocaleTimeString();

  return (
    <div
      className={`status-badge ${isLive ? "status-badge--live" : "status-badge--fallback"}`}
      role="status"
      title={`Last updated ${time}`}
    >
      <span className="status-badge__dot" />
      <span className="status-badge__label">{label}</span>
      <span className="status-badge__time">{time}</span>
    </div>
  );
}
