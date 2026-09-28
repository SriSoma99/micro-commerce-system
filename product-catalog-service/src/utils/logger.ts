import crypto from "node:crypto";
import type { Response } from "express";

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

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
} as const;

const LEVEL_COLOR: Record<LogLevel, string> = {
  INFO: ANSI.cyan,
  WARN: ANSI.yellow,
  ERROR: ANSI.red,
  CIRCUIT: ANSI.magenta,
};

const LOG_BUFFER: LogEntry[] = [];
const MAX_LOGS = 300;
const LOG_SSE_CLIENTS = new Set<Response>();

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").replace("Z", " UTC");
}

function write(level: LogLevel, scope: string, message: string, traceId?: string, metadata?: Record<string, unknown>): LogEntry {
  const color = LEVEL_COLOR[level];
  const tracePart = traceId ? ` ${ANSI.dim}[trace:${traceId.slice(0, 8)}]${ANSI.reset}` : "";

  // Console output
  // eslint-disable-next-line no-console
  console.log(
    `${ANSI.dim}[${timestamp()}]${ANSI.reset} ${color}${level.padEnd(7)}${ANSI.reset} ${ANSI.dim}(${scope})${ANSI.reset}${tracePart} ${message}`
  );

  const entry: LogEntry = {
    id: `log_${crypto.randomBytes(6).toString("hex")}`,
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    traceId,
    metadata,
  };

  LOG_BUFFER.unshift(entry);
  if (LOG_BUFFER.length > MAX_LOGS) {
    LOG_BUFFER.pop();
  }

  // Broadcast to active log SSE subscribers
  const data = JSON.stringify(entry);
  for (const client of LOG_SSE_CLIENTS) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {
      LOG_SSE_CLIENTS.delete(client);
    }
  }

  return entry;
}

export const logger = {
  info: (scope: string, message: string, traceId?: string, metadata?: Record<string, unknown>) =>
    write("INFO", scope, message, traceId, metadata),
  warn: (scope: string, message: string, traceId?: string, metadata?: Record<string, unknown>) =>
    write("WARN", scope, message, traceId, metadata),
  error: (scope: string, message: string, traceId?: string, metadata?: Record<string, unknown>) =>
    write("ERROR", scope, message, traceId, metadata),
  circuit: (scope: string, message: string, traceId?: string, metadata?: Record<string, unknown>) =>
    write("CIRCUIT", scope, message, traceId, metadata),

  getRecentLogs(limit = 100, level?: LogLevel, search?: string): LogEntry[] {
    let list = LOG_BUFFER;
    if (level) {
      list = list.filter((l) => l.level === level);
    }
    if (search) {
      const term = search.toLowerCase();
      list = list.filter((l) => l.message.toLowerCase().includes(term) || l.scope.toLowerCase().includes(term) || l.traceId?.includes(term));
    }
    return list.slice(0, Math.min(limit, MAX_LOGS));
  },

  registerLogSseClient(res: Response): () => void {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const initialMsg = JSON.stringify({ type: "INIT", recent: LOG_BUFFER.slice(0, 15) });
    res.write(`data: ${initialMsg}\n\n`);

    LOG_SSE_CLIENTS.add(res);

    const cleanup = () => {
      LOG_SSE_CLIENTS.delete(res);
    };

    res.on("close", cleanup);
    res.on("error", cleanup);

    return cleanup;
  },
};
