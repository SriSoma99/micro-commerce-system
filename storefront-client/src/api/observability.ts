import { API_BASE_URL } from "../config";
import { apiRequest, type ApiResult } from "./client";
import type {
  ChaosSettings,
  DomainEvent,
  DomainEventType,
  HealthProbeStatus,
  LogEntry,
  LogLevel,
  TelemetryStatsResponse,
} from "../types/observability";

export async function getTelemetryStats(token?: string | null): Promise<ApiResult<TelemetryStatsResponse>> {
  return apiRequest<TelemetryStatsResponse>("/observability/stats", {
    method: "GET",
    token,
  });
}

export async function getRecentEvents(
  token?: string | null,
  limit = 50,
  type?: DomainEventType
): Promise<ApiResult<{ events: DomainEvent[]; count: number }>> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (type) params.append("type", type);
  return apiRequest<{ events: DomainEvent[]; count: number }>(`/observability/events?${params.toString()}`, {
    method: "GET",
    token,
  });
}

export async function getRecentLogs(
  token?: string | null,
  limit = 100,
  level?: LogLevel,
  search?: string
): Promise<ApiResult<{ logs: LogEntry[]; count: number }>> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (level) params.append("level", level);
  if (search) params.append("search", search);
  return apiRequest<{ logs: LogEntry[]; count: number }>(`/observability/logs?${params.toString()}`, {
    method: "GET",
    token,
  });
}

export async function updateChaosSettings(
  token: string | null | undefined,
  patch: Partial<ChaosSettings>
): Promise<ApiResult<{ ok: boolean; settings: ChaosSettings }>> {
  return apiRequest<{ ok: boolean; settings: ChaosSettings }>("/observability/chaos", {
    method: "POST",
    body: patch,
    token,
  });
}

export async function getDbHealth(): Promise<ApiResult<HealthProbeStatus>> {
  try {
    const origin = API_BASE_URL.replace(/\/api$/, "");
    const res = await fetch(`${origin}/health/db`);
    const data = await res.json();
    return {
      ok: true,
      status: res.status,
      data,
      isFallback: false,
      source: "live-core",
      retrievedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      code: "NETWORK_ERROR",
      message: err instanceof Error ? err.message : "Health check failed",
    };
  }
}

export async function getReadinessHealth(): Promise<ApiResult<HealthProbeStatus>> {
  try {
    const origin = API_BASE_URL.replace(/\/api$/, "");
    const res = await fetch(`${origin}/health/ready`);
    const data = await res.json();
    return {
      ok: true,
      status: res.status,
      data,
      isFallback: false,
      source: "live-core",
      retrievedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      code: "NETWORK_ERROR",
      message: err instanceof Error ? err.message : "Readiness check failed",
    };
  }
}

export function subscribeToEventStream(
  token: string | null | undefined,
  onEvent: (event: DomainEvent) => void,
  onError?: (err: Event) => void
): () => void {
  const url = token
    ? `${API_BASE_URL}/observability/events/stream?token=${encodeURIComponent(token)}`
    : `${API_BASE_URL}/observability/events/stream`;
  const sse = new EventSource(url);

  sse.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data);
      if (parsed.type === "INIT") {
        // Initial batch
        if (Array.isArray(parsed.recent)) {
          parsed.recent.forEach((e: DomainEvent) => onEvent(e));
        }
      } else if (parsed.id) {
        onEvent(parsed as DomainEvent);
      }
    } catch {
      // ignore JSON parse error
    }
  };

  if (onError) {
    sse.onerror = onError;
  }

  return () => {
    sse.close();
  };
}
