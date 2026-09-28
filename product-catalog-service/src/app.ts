import express, { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import { config } from "./config/env";
import productRoutes from "./routes/productRoutes";
import cartRoutes from "./routes/cartRoutes";
import orderRoutes from "./routes/orderRoutes";
import setupRoutes from "./routes/setupRoutes";
import authRoutes from "./routes/authRoutes";
import customerRoutes from "./routes/customerRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import checkoutRoutes from "./routes/checkoutRoutes";
import fulfilmentRoutes from "./routes/fulfilmentRoutes";
import refundRoutes from "./routes/refundRoutes";
import savedPaymentRoutes from "./routes/savedPaymentRoutes";
import { receivingRouter } from "./routes/receivingRoutes";
import { accountingRouter } from "./routes/accountingRoutes";
import { observabilityRouter } from "./routes/observabilityRoutes";
import { aiRouter } from "./routes/aiRoutes";
import { traceMiddleware } from "./observability/traceContext";
import { metricsMiddleware } from "./observability/metricsEngine";
import { chaosMiddleware } from "./observability/chaosController";
import { initDatabase } from "./db/database";
import { warmCatalogSnapshot } from "./data/productRepository";
import { initPlatform } from "./platform/platform";
import { logger } from "./utils/logger";

export function createApp(): Application {
  initPlatform();
  initDatabase();
  warmCatalogSnapshot();
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());

  // MELT Telemetry Middleware: W3C Tracing, Prometheus Metrics & Chaos Controller
  app.use(traceMiddleware);
  app.use(metricsMiddleware);
  app.use(chaosMiddleware);

  // Observability endpoints (/metrics, /health/*, /api/observability/*)
  app.use(observabilityRouter);

  app.get("/", (_req: Request, res: Response) => {
    res.status(200).json({
      service: "product-catalog-service",
      version: "1.0.0",
      description: "Aperture Commerce Backend REST API",
      status: "online",
      storefrontUi: "http://localhost:5173",
      endpoints: {
        health: "/health",
        metrics: "/metrics",
        catalog: "/api/products",
        departments: "/api/catalog/departments",
        storeConfig: "/api/store-config",
        setupStatus: "/api/setup/status"
      }
    });
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", service: "product-catalog-service" });
  });

  app.use("/api", productRoutes);
  app.use("/api", cartRoutes);
  app.use("/api", orderRoutes);
  app.use("/api", setupRoutes);
  app.use("/api", authRoutes);
  app.use("/api", customerRoutes);
  app.use("/api", paymentRoutes);
  app.use("/api", checkoutRoutes);
  app.use("/api", fulfilmentRoutes);
  app.use("/api", refundRoutes);
  app.use("/api", savedPaymentRoutes);
  app.use("/api/manager", receivingRouter);
  app.use("/api/accounting", accountingRouter);
  app.use("/api/ai", aiRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "NOT_FOUND", message: "Route not found" });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("ExpressErrorHandler", err.message);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Unexpected server error" });
  });

  return app;
}
