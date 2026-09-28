import { createApp } from "./app";
import { config } from "./config/env";
import { shutdownCatalogBreakers } from "./services/catalogService";
import { logger } from "./utils/logger";

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  logger.info(
    "Bootstrap",
    `product-catalog-service listening on http://${config.host}:${config.port} [env: ${config.nodeEnv}]`
  );
  logger.info("Bootstrap", `API URL: http://localhost:${config.port}/api/products`);
  logger.info("Bootstrap", `Health probe: http://localhost:${config.port}/health`);
});

// `docker stop` sends SIGTERM: stop accepting connections and clear the
// breakers' timers so the process exits promptly instead of being killed.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info("Bootstrap", `${signal} received, shutting down`);
    shutdownCatalogBreakers();
    server.close(() => process.exit(0));
  });
}
