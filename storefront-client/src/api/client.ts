import { API_BASE_URL } from "../config";
import type { ResilienceSource } from "../types/product";

export interface ApiOk<T> {
  ok: true;
  status: number;
  data: T;
  isFallback: boolean;
  source: ResilienceSource;
  retrievedAt: string;
}

export interface ApiError {
  ok: false;
  /** HTTP status, or 0 when the service could not be reached at all. */
  status: number;
  code: string;
  message: string;
  details?: string[];
  declineCode?: string;
}

export type ApiResult<T> = ApiOk<T> | ApiError;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

/**
 * The one place the UI talks to the shop API. Success and failure are both
 * plain return values (never thrown), so callers handle them explicitly - and a
 * network failure looks like any other error (`status: 0`), not a crash.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.headers ?? {}),
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

    const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        code: body.error ?? "REQUEST_FAILED",
        message: body.message ?? `Request failed (${response.status})`,
        details: body.details,
        declineCode: body.declineCode,
      };
    }
    return {
      ok: true,
      status: response.status,
      data: body.data as T,
      isFallback: body.isFallback ?? false,
      source: body.source ?? "live-core",
      retrievedAt: body.retrievedAt ?? new Date().toISOString(),
    };
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") throw caught;
    return { ok: false, status: 0, code: "NETWORK_ERROR", message: "Cannot reach the shop service. Please check your connection." };
  }
}

/** Fetches a text document (the printable invoice HTML) with the customer's token. */
export async function apiText(path: string, token: string): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}
