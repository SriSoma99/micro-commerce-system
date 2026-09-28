/** The `ResilientPayload` wrapper for endpoints with no breaker in front of them (always a live read). */
export function liveEnvelope<T>(data: T) {
  return { data, isFallback: false, source: "live-core" as const, retrievedAt: new Date().toISOString() };
}
