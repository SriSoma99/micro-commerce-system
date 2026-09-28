import { vi } from "vitest";

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Handler = (call: RecordedCall) => Response | Promise<Response>;

/** Scripts `fetch` by "METHOD url-fragment" and records every call, so a test can assert exactly what was sent where. */
export function mockNetwork(routes: Record<string, Handler>): { calls: RecordedCall[]; callsTo: (fragment: string) => RecordedCall[] } {
  const calls: RecordedCall[] = [];

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const call: RecordedCall = { url, method, headers: (init?.headers ?? {}) as Record<string, string>, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined };
    calls.push(call);

    const key = Object.keys(routes).find((route) => {
      const [routeMethod, fragment] = route.split(" ") as [string, string];
      return routeMethod === method && url.includes(fragment);
    });
    if (!key) return new Response(JSON.stringify({ error: "NO_ROUTE", message: `Unscripted request: ${method} ${url}` }), { status: 500 });
    return (routes[key] as Handler)(call);
  });

  return { calls, callsTo: (fragment) => calls.filter((call) => call.url.includes(fragment)) };
}

export const envelope = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify({ data, isFallback: false, source: "live-core", retrievedAt: "2026-01-01T00:00:00Z" }), { status });

export const failure = (status: number, body: Record<string, unknown>): Response => new Response(JSON.stringify(body), { status });
