import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * W3C TraceContext Specification (OBS-04 / WS S)
 * Format: `version-traceId-parentSpanId-traceFlags` (e.g. `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`)
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
  requestId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      trace?: TraceContext;
    }
  }
}

export function generateTraceId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function generateSpanId(): string {
  return crypto.randomBytes(8).toString("hex");
}

export function parseTraceparent(header?: string): { traceId: string; parentSpanId?: string; sampled: boolean } | null {
  if (!header) return null;
  const parts = header.trim().split("-");
  if (parts.length < 4) return null;

  const [version, traceId, parentSpanId, flags] = parts;
  if (version !== "00") return null;
  if (!/^[0-9a-f]{32}$/i.test(traceId || "")) return null;
  if (!/^[0-9a-f]{16}$/i.test(parentSpanId || "")) return null;

  const sampled = (parseInt(flags || "0", 16) & 1) === 1;
  return { traceId: traceId!, parentSpanId, sampled };
}

export function formatTraceparent(ctx: TraceContext): string {
  const flags = ctx.sampled ? "01" : "00";
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

/** Express middleware injecting W3C TraceContext into every request */
export function traceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingTrace = parseTraceparent(req.header("traceparent"));
  const requestId = (req.header("x-request-id") || `req_${crypto.randomBytes(8).toString("hex")}`).trim();

  const traceId = incomingTrace?.traceId || generateTraceId();
  const parentSpanId = incomingTrace?.parentSpanId;
  const spanId = generateSpanId();
  const sampled = incomingTrace ? incomingTrace.sampled : true;

  req.trace = {
    traceId,
    spanId,
    parentSpanId,
    sampled,
    requestId,
  };

  // Populate standard response headers
  res.setHeader("x-request-id", requestId);
  res.setHeader("traceparent", formatTraceparent(req.trace));
  res.setHeader("traceresponse", `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`);

  next();
}
