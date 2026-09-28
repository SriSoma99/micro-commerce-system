import { NextFunction, Request, Response } from "express";
import { authenticate } from "../services/authService";
import { Customer } from "../types/customer";

/** Bearer-token guard. On success the customer and raw token are on `res.locals`. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const [scheme, tokenFromHeader] = (req.header("authorization") ?? "").split(" ");
  // EventSource can't send an Authorization header, so only the SSE stream routes may take ?token=.
  // Match on the path alone: `originalUrl` includes the query string, so "?x=/stream" would slip through.
  const isStreamRoute = req.path.endsWith("/stream");
  const queryToken = (isStreamRoute && typeof req.query.token === "string") ? req.query.token : undefined;
  const token = (scheme === "Bearer" && tokenFromHeader) ? tokenFromHeader : queryToken;
  const customer = token ? authenticate(token) : undefined;

  if (!customer || !token) {
    res.status(401).json({ error: "UNAUTHENTICATED", message: "Sign in required" });
    return;
  }

  res.locals.customer = customer;
  res.locals.token = token;
  next();
}

export function currentCustomer(res: Response): Customer {
  return res.locals.customer as Customer;
}
