import { NextFunction, Request, Response } from "express";
import { CustomerRole } from "../types/customer";
import { currentCustomer } from "./requireAuth";

/**
 * Role-based authorization middleware.
 * Must be mounted after `requireAuth`.
 * If customer's role is not within `allowedRoles`, returns 403 FORBIDDEN.
 */
export function requireRole(...allowedRoles: CustomerRole[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const customer = currentCustomer(res);
    if (!customer) {
      res.status(401).json({ error: "UNAUTHENTICATED", message: "Sign in required" });
      return;
    }

    if (!allowedRoles.includes(customer.role)) {
      res.status(403).json({ error: "FORBIDDEN", message: "Insufficient permissions for this resource" });
      return;
    }

    next();
  };
}
