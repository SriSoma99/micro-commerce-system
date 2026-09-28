import crypto from "node:crypto";
import type { Response } from "express";

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

class DomainEventBus {
  private events: DomainEvent[] = [];
  private readonly MAX_EVENTS = 200;
  private sseClients = new Set<Response>();

  publish(event: Omit<DomainEvent, "id" | "timestamp">): DomainEvent {
    const fullEvent: DomainEvent = {
      ...event,
      id: `evt_${crypto.randomBytes(8).toString("hex")}`,
      timestamp: new Date().toISOString(),
    };

    this.events.unshift(fullEvent);
    if (this.events.length > this.MAX_EVENTS) {
      this.events.pop();
    }

    // Broadcast to active SSE listeners
    this.broadcastToSse(fullEvent);

    return fullEvent;
  }

  getRecentEvents(limit = 50, type?: DomainEventType): DomainEvent[] {
    let filtered = this.events;
    if (type) {
      filtered = filtered.filter((e) => e.type === type);
    }
    return filtered.slice(0, Math.min(limit, this.MAX_EVENTS));
  }

  registerSseClient(res: Response): () => void {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // Send initial handshake with recent events
    const initialMsg = JSON.stringify({ type: "INIT", recent: this.getRecentEvents(10) });
    res.write(`data: ${initialMsg}\n\n`);

    this.sseClients.add(res);

    const cleanup = () => {
      this.sseClients.delete(res);
    };

    res.on("close", cleanup);
    res.on("error", cleanup);

    return cleanup;
  }

  private broadcastToSse(event: DomainEvent): void {
    const data = JSON.stringify(event);
    for (const client of this.sseClients) {
      try {
        client.write(`data: ${data}\n\n`);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  getActiveSubscriberCount(): number {
    return this.sseClients.size;
  }
}

export const domainEventBus = new DomainEventBus();
