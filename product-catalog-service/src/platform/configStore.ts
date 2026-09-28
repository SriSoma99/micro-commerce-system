import fs from "node:fs";
import path from "node:path";
import { StoreConfig } from "./types";

/**
 * Read fresh on every call (not cached at import) for the same reason
 * `DB_SIMULATED_FAILURE_RATE` is: the in-process test suite points it at a
 * temp file per test file.
 */
function configPath(): string {
  return process.env.STORE_CONFIG_PATH ?? path.resolve(process.cwd(), "data", "store.config.json");
}

export function readStoreConfig(): unknown | undefined {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

/** Write-then-rename so a crash mid-write can never leave a half-written config. */
export function writeStoreConfig(config: StoreConfig): void {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), "utf8");
  fs.renameSync(tmp, file);
}
