export type LogLevel = "INFO" | "WARN" | "ERROR" | "CIRCUIT";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  traceId?: string;
  spanId?: string;
  metadata?: Record<string, unknown>;
}

export type DomainEventType =
  | "ORDER_PLACED"
  | "PAYMENT_CAPTURED"
  | "INVOICE_ISSUED"
  | "GRN_RECORDED"
  | "STOCK_TRANSFERRED"
  | "STOCK_ADJUSTED"
  | "ORDER_REFUNDED"
  | "CIRCUIT_TRIPPED"
  | "CHAOS_INJECTED";

export interface DomainEvent {
  id: string;
  timestamp: string;
  type: DomainEventType;
  traceId?: string;
  actor?: {
    customerId?: string;
    role?: string;
    email?: string;
  };
  storeId?: string;
  summary: string;
  payload: Record<string, unknown>;
}

export interface CircuitBreakerStatus {
  name: string;
  state: "CLOSED" | "HALF_OPEN" | "OPEN";
  trips: number;
}

export interface TelemetryMetricsSummary {
  uptimeSeconds: number;
  totalRequests: number;
  totalErrors: number;
  requestsPerSecond: number;
  errorRatePercent: number;
  httpLatency: {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    sampleCount: number;
  };
  dbLatency: {
    p50Ms: number;
    p95Ms: number;
    sampleCount: number;
  };
  circuitBreakers: CircuitBreakerStatus[];
}

export interface ChaosSettings {
  simulatedLatencyMs: number;
  failureRatePercent: number;
  forceCircuitTrip: boolean;
}

export interface TelemetryStatsResponse {
  metrics: TelemetryMetricsSummary;
  chaos: ChaosSettings;
  activeSseSubscribers: number;
  timestamp: string;
}

export interface HealthProbeStatus {
  status: "ok" | "error";
  check?: string;
  service?: string;
  database?: string;
  tableCount?: number;
  queryLatencyMs?: number;
  uptimeSeconds?: number;
  timestamp: string;
  error?: string;
}
