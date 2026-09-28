import dotenv from "dotenv";

dotenv.config();

export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 5001),
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  dbSimulatedFailureRate: Number(process.env.DB_SIMULATED_FAILURE_RATE ?? 0.25),
} as const;
