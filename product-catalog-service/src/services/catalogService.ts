import CircuitBreaker from "opossum";
import {
  findDepartmentTree,
  findProductById,
  findProductPage,
  getStaticSnapshot,
} from "../data/productRepository";
import { searchSnapshot } from "../data/snapshotSearch";
import { logger } from "../utils/logger";
import { metricsRegistry } from "../observability/metricsEngine";
import {
  ProductDetail,
  ProductListPage,
  ProductMaster,
  ProductQuery,
  ResilientPayload,
} from "../types/product";

/**
 * Production-tuned breaker options, shared by every breaker instance in
 * this service:
 *  - timeout: a single downstream call has 2s to resolve before it counts
 *    as a failure, protecting the event loop from slow-draining requests.
 *  - errorThresholdPercentage: once half of requests in the rolling window
 *    fail, the breaker trips OPEN and starts short-circuiting immediately.
 *  - resetTimeout: after 15s in the OPEN state, the breaker allows a single
 *    HALF-OPEN probe request through to test if the downstream recovered.
 */
const BREAKER_OPTIONS: CircuitBreaker.Options = {
  timeout: 2000,
  errorThresholdPercentage: 50,
  resetTimeout: 15000,
  rollingCountTimeout: 10000,
};

/** Explicit projection (not a rest-spread) so a new Detail-only field can never leak into list payloads. */
function toMaster(product: ProductDetail): ProductMaster {
  return {
    id: product.id,
    name: product.name,
    thumbnail: product.thumbnail,
    priceMinor: product.priceMinor,
    currency: product.currency,
    category: product.category,
    subcategory: product.subcategory,
    brand: product.brand,
    isPrivateLabel: product.isPrivateLabel,
    sizeLabel: product.sizeLabel,
    soldBy: product.soldBy,
    unitPrice: product.unitPrice,
    rating: product.rating,
    snapEligible: product.snapEligible,
    dietaryTags: product.dietaryTags,
    isWeeklyFind: product.isWeeklyFind,
  };
}

/**
 * Wires professional, timestamped state-transition logging onto a breaker.
 * These three events (open / halfOpen / close) are the full lifecycle of
 * the circuit breaker's state machine and are the primary signal an
 * operator watches in production to understand downstream health.
 */
function attachLifecycleLogging(breaker: CircuitBreaker<unknown[], unknown>): void {
  const scope = breaker.name;
  metricsRegistry.setCircuitBreakerState(scope, "CLOSED");

  breaker.on("open", () => {
    metricsRegistry.setCircuitBreakerState(scope, "OPEN");
    metricsRegistry.recordCircuitTrip(scope);
    logger.circuit(
      scope,
      "state transition -> OPEN | failure threshold breached, requests will short-circuit to fallback"
    );
  });

  breaker.on("halfOpen", () => {
    metricsRegistry.setCircuitBreakerState(scope, "HALF_OPEN");
    logger.circuit(
      scope,
      "state transition -> HALF-OPEN | probing downstream with a trial request"
    );
  });

  breaker.on("close", () => {
    metricsRegistry.setCircuitBreakerState(scope, "CLOSED");
    logger.circuit(
      scope,
      "state transition -> CLOSED | downstream healthy, normal routing resumed"
    );
  });

  breaker.on("timeout", () => {
    logger.warn(scope, `request exceeded ${BREAKER_OPTIONS.timeout}ms timeout budget`);
  });

  breaker.on("reject", () => {
    logger.warn(scope, "request short-circuited - breaker is currently OPEN");
  });

  breaker.on("failure", (error: Error) => {
    logger.error(scope, `downstream call failed: ${error.message}`);
  });
}

const listBreaker = new CircuitBreaker((query: ProductQuery) => findProductPage(query), {
  ...BREAKER_OPTIONS,
  name: "CatalogService.listProducts",
});
attachLifecycleLogging(listBreaker as CircuitBreaker<unknown[], unknown>);

const detailBreaker = new CircuitBreaker(
  (id: string, storeId?: string) => findProductById(id, storeId),
  { ...BREAKER_OPTIONS, name: "CatalogService.getProductDetail" }
);
attachLifecycleLogging(detailBreaker as CircuitBreaker<unknown[], unknown>);

/**
 * Deliberately does not use opossum's built-in `.fallback()` registration.
 * That API resolves `fire()` with the fallback value directly, which makes
 * it impossible for a single shared breaker instance to tell concurrent
 * callers apart when deciding whether *their* response was a fallback
 * (the 'fallback' event is emitted on a shared EventEmitter, so a listener
 * attached per-call can be triggered by a sibling call's failure). Catching
 * the rejection per-call instead gives each caller a deterministic,
 * race-free `isFallback` flag.
 */
/**
 * Stops both breakers, including any pending reset timer. Called on process
 * shutdown (see server.ts) so a timer can't fire into a dead process, and by
 * the test suite after a file that deliberately tripped a breaker.
 */
export function shutdownCatalogBreakers(): void {
  listBreaker.shutdown();
  detailBreaker.shutdown();
}

export async function getProductList(query: ProductQuery): Promise<ResilientPayload<ProductListPage>> {
  const retrievedAt = () => new Date().toISOString();

  try {
    const page = await listBreaker.fire(query);
    return {
      data: page,
      isFallback: false,
      source: "live-core",
      retrievedAt: retrievedAt(),
    };
  } catch (error) {
    logger.warn(
      "CatalogService.listProducts",
      `serving fallback payload - reason: ${(error as Error).message}`
    );
    return {
      data: searchSnapshot(getStaticSnapshot(), query, toMaster),
      isFallback: true,
      source: "circuit-breaker-fallback",
      retrievedAt: retrievedAt(),
    };
  }
}

/** Department tree with counts: reference data with nothing downstream to fail, so no breaker. */
export function getDepartments(): ResilientPayload<ReturnType<typeof findDepartmentTree>> {
  return { data: findDepartmentTree(), isFallback: false, source: "live-core", retrievedAt: new Date().toISOString() };
}

export async function getProductDetail(
  id: string,
  storeId?: string
): Promise<ResilientPayload<ProductDetail | undefined>> {
  const retrievedAt = () => new Date().toISOString();

  try {
    const product = await detailBreaker.fire(id, storeId);
    return {
      data: product,
      isFallback: false,
      source: "live-core",
      retrievedAt: retrievedAt(),
    };
  } catch (error) {
    logger.warn(
      "CatalogService.getProductDetail",
      `serving fallback payload for id="${id}" - reason: ${(error as Error).message}`
    );
    return {
      data: getStaticSnapshot().find((product) => product.id === id),
      isFallback: true,
      source: "circuit-breaker-fallback",
      retrievedAt: retrievedAt(),
    };
  }
}
