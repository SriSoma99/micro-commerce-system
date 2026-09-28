/**
 * A `Map`-backed store capped at `maxEntries`, evicting the least-recently
 * touched entry on overflow. `Map` preserves insertion order, so a
 * delete-then-set on write moves an entry to the "most recent" end and the
 * oldest entry is simply the first key in iteration order.
 *
 * Used for Cart/Order storage instead of an unbounded Map so a long-running
 * demo process doesn't accumulate memory forever from anonymous cart ids
 * that are never revisited. Deliberately has no TTL/timer-based sweep: a
 * live timer would need to be `unref()`'d or it risks keeping the process -
 * and this repo's in-process Jest `require()` of the compiled app - alive
 * past `server.close()`, which the test suite explicitly avoids elsewhere.
 * Cap-on-write eviction has no such lifecycle hazard.
 */
export interface BoundedMap<K, V> {
  get: (key: K) => V | undefined;
  has: (key: K) => boolean;
  set: (key: K, value: V) => void;
  delete: (key: K) => boolean;
}

export function createBoundedMap<K, V>(maxEntries: number): BoundedMap<K, V> {
  const store = new Map<K, V>();

  return {
    get: (key: K) => store.get(key),
    has: (key: K) => store.has(key),
    set(key: K, value: V): void {
      store.delete(key);
      store.set(key, value);
      if (store.size > maxEntries) {
        const oldestKey = store.keys().next().value as K;
        store.delete(oldestKey);
      }
    },
    delete: (key: K) => store.delete(key),
  };
}
