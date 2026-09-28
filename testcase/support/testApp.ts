import type { AddressInfo } from "net";
import type { Server } from "http";

/** Just enough of Express's shape for this suite — avoids taking a direct
 * dependency on `express`'s own types purely to describe the return value
 * of a function we only ever call `.listen()` on. */
interface ListenableApp {
  listen: (port: number) => Server;
}

/**
 * This suite treats product-catalog-service as a black box: it consumes
 * the *compiled* app (dist/app.js), never the TypeScript source. That
 * keeps this project decoupled from the service's internal types/build
 * config, at the cost of one prerequisite: `npm run build` must have been
 * run in product-catalog-service first (the `pretest` script in this
 * package.json does that automatically).
 *
 * Requiring it in-process (rather than spawning a child OS process) means
 * this test process shares `process.env` with the running app, which is
 * what lets circuit-breaker.test.ts flip `DB_SIMULATED_FAILURE_RATE` at
 * runtime and observe the *same* breaker instance react — the repository
 * reads that env var fresh on every call rather than caching it at
 * startup, specifically to make this kind of test possible.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createApp } = require("../../product-catalog-service/dist/app") as {
  createApp: () => ListenableApp;
};

const { shutdownCatalogBreakers } = require("../../product-catalog-service/dist/services/catalogService") as {
  shutdownCatalogBreakers: () => void;
};

/**
 * Stops the catalog circuit breakers' timers. Call in `afterAll` of any file
 * that trips a breaker, or its 15s reset timer fires after the file's Jest
 * environment is gone ("Cannot log after tests are done").
 */
export function shutdownBreakers(): void {
  shutdownCatalogBreakers();
}

// The dummy payment gateway is a second service. Like the shop backend it is
// required in-process from its compiled output, on its own ephemeral port.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createApp: createPaymentSimulatorApp } = require("../../payment-simulator/dist/app") as {
  createApp: () => ListenableApp;
};

export interface RunningTestApp {
  baseUrl: string;
  /** Where the dummy payment gateway is listening (already wired into the shop backend via PAYMENT_GATEWAY_URL). */
  gatewayUrl: string;
  close: () => Promise<void>;
}

/** Starts the dummy payment gateway alone (for the gateway's own tests). */
export async function launchPaymentSimulator(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createPaymentSimulatorApp().listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

/**
 * Boots a fresh Express instance on an OS-assigned ephemeral port. Jest
 * gives each test *file* its own module registry, so each file that calls
 * this gets an independent circuit breaker, isolated from every other
 * file's failure-rate manipulation.
 */
export async function launchTestApp(): Promise<RunningTestApp> {
  // Isolated in-memory database unless a test file points DATABASE_PATH at a
  // temp file - keeps the suite from ever writing a data/app.db into the repo.
  process.env.DATABASE_PATH ??= ":memory:";
  // No injected datastore latency by default, so suites that make many catalog
  // calls stay fast. circuit-breaker.test.ts opts back in to the real 100-1900ms.
  process.env.DB_SIMULATED_LATENCY_MAX_MS ??= "0";
  // Gateway first, so the shop backend's env points at it from the first request.
  const gateway = await launchPaymentSimulator();
  process.env.PAYMENT_GATEWAY_URL = gateway.baseUrl;
  delete process.env.PAYMENT_GATEWAY_PUBLIC_URL;
  const app = createApp();
  const server = app.listen(0);

  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    gatewayUrl: gateway.baseUrl,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await gateway.close();
    },
  };
}

export function setSimulatedFailureRate(rate: number): void {
  process.env.DB_SIMULATED_FAILURE_RATE = String(rate);
}
