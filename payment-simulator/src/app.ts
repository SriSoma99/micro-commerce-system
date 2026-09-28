import cors from "cors";
import express, { Application, NextFunction, Request, Response } from "express";
import { CARD_TEST_CARDS, CardInput, EBT_TEST_CARDS, SimulatorError, TokenMethod, createSimulator } from "./simulator";

/**
 * A local dummy payment gateway. Two API keys, like Stripe:
 *  - publishable (`pk_test_...`): safe in the browser, can only create tokens
 *  - secret (`sk_test_...`): server-side only, can charge, capture and refund
 * Card numbers are accepted ONLY by POST /v1/tokens, so a merchant backend that
 * integrates with this never sees or stores a card number.
 */
export function createApp(): Application {
  const publishableKey = () => process.env.PAYMENT_SIM_PUBLISHABLE_KEY ?? "pk_test_dummy";
  const secretKey = () => process.env.PAYMENT_SIM_SECRET_KEY ?? "sk_test_dummy";
  const simulator = createSimulator();
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*", allowedHeaders: ["Authorization", "Content-Type"] }));
  app.use(express.json());

  const bearer = (req: Request): string => (req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const requireKey = (kind: "publishable" | "secret") => (req: Request, res: Response, next: NextFunction) => {
    const expected = kind === "publishable" ? publishableKey() : secretKey();
    if (bearer(req) !== expected) {
      res.status(401).json({ error: "invalid_api_key", message: `A valid ${kind} API key is required` });
      return;
    }
    next();
  };

  /** Read fresh per call, like the other services' chaos knobs. */
  const latency = async () => {
    const ms = Number(process.env.PAYMENT_SIMULATION_LATENCY_MS ?? 0);
    if (Number.isFinite(ms) && ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
  };

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "payment-simulator" });
  });

  app.get("/v1/test-cards", (_req, res) => {
    res.status(200).json({ card: CARD_TEST_CARDS, ebt: EBT_TEST_CARDS });
  });

  app.post("/v1/tokens", requireKey("publishable"), async (req, res) => {
    const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const method = (body.method ?? "card") as TokenMethod;
    const number = body.number;
    const expMonth = Number(body.expMonth);
    const expYear = Number(body.expYear);
    const cvc = body.cvc;

    const problems: string[] = [];
    if (method !== "card" && method !== "ebt") problems.push('method must be "card" or "ebt"');
    if (typeof number !== "string" || !/^[\d\s-]{8,30}$/.test(number)) problems.push("number must be the card number");
    if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12) problems.push("expMonth must be 1-12");
    if (!Number.isInteger(expYear) || expYear < 0 || expYear > 9999) problems.push("expYear must be a year");
    if (typeof cvc !== "string" || !/^\d{0,4}$/.test(cvc)) problems.push("cvc must be digits");
    if (problems.length > 0) {
      res.status(400).json({ error: "invalid_request", message: "Invalid card details", details: problems });
      return;
    }

    await latency();
    res.status(201).json(simulator.createToken(method, { number, expMonth, expYear, cvc } as CardInput));
  });

  app.post("/v1/payments", requireKey("secret"), async (req, res) => {
    const { token, amountMinor, currency, orderRef } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof token !== "string" || !Number.isInteger(amountMinor) || (amountMinor as number) <= 0 || typeof currency !== "string" || typeof orderRef !== "string") {
      res.status(400).json({ error: "invalid_request", message: "token, amountMinor (positive integer), currency and orderRef are required" });
      return;
    }
    await latency();
    res.status(201).json(simulator.authorize({ token, amountMinor: amountMinor as number, currency, orderRef }));
  });

  app.get("/v1/payments/:id", requireKey("secret"), (req, res) => {
    res.status(200).json(simulator.get(req.params.id as string));
  });

  app.post("/v1/payments/:id/confirm", requireKey("secret"), async (req, res) => {
    await latency();
    res.status(200).json(simulator.confirmAction(req.params.id as string, req.body?.approved === true));
  });

  app.post("/v1/payments/:id/capture", requireKey("secret"), async (req, res) => {
    await latency();
    res.status(200).json(simulator.capture(req.params.id as string));
  });

  app.post("/v1/payments/:id/refund", requireKey("secret"), async (req, res) => {
    const amountMinor = req.body?.amountMinor;
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      res.status(400).json({ error: "invalid_request", message: "amountMinor must be a positive integer" });
      return;
    }
    await latency();
    res.status(200).json(simulator.refund(req.params.id as string, amountMinor));
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found", message: "Route not found" });
  });

  // Express 5 forwards rejected async handlers here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SimulatorError) {
      res.status(err.status).json({ error: err.code, message: err.message });
      return;
    }
    console.error("payment-simulator error:", err.message);
    res.status(500).json({ error: "internal_error", message: "Unexpected simulator error" });
  });

  return app;
}
