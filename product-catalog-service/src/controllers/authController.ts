import { Request, Response } from "express";
import * as authService from "../services/authService";
import { mergeCarts } from "../services/cartService";
import { requestPasswordReset, resetPasswordWithToken } from "../services/passwordResetService";
import { liveEnvelope } from "../utils/envelope";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Hand-checked at the HTTP boundary, same approach as cartController. */
function parseRegisterBody(body: unknown): { email: string; password: string; name: string } | { errors: string[] } {
  if (typeof body !== "object" || body === null) return { errors: ["Request body must be a JSON object"] };
  const { email, password, name } = body as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof email !== "string" || email.length > 254 || !EMAIL_PATTERN.test(email.trim())) {
    errors.push("email must be a valid email address");
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    errors.push("password must be 8-128 characters");
  } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.push("password must contain at least one letter and one number");
  }
  if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 100) {
    errors.push("name must be 1-100 characters");
  }

  return errors.length > 0 ? { errors } : { email: email as string, password: password as string, name: name as string };
}

function sendSession(res: Response, status: number, result: Extract<authService.AuthResult, { ok: true }>): void {
  res.status(status).json(liveEnvelope({ customer: result.customer, token: result.token, expiresAt: result.expiresAt }));
}

/** POST /api/auth/register - creates the account and signs the customer in. */
export async function register(req: Request, res: Response): Promise<void> {
  const parsed = parseRegisterBody(req.body);
  if ("errors" in parsed) {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "Invalid registration", details: parsed.errors });
    return;
  }

  const result = await authService.register(parsed);
  if (!result.ok) {
    res.status(409).json({ error: "EMAIL_TAKEN", message: "An account with this email already exists" });
    return;
  }

  const anonymousCartId = (req.body as Record<string, unknown>)?.anonymousCartId;
  if (typeof anonymousCartId === "string" && anonymousCartId) {
    try {
      await mergeCarts(anonymousCartId, `customer_${result.customer.id}`);
    } catch {
      // ignore merge error
    }
  }

  sendSession(res, 201, result);
}

/** POST /api/auth/login */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password, anonymousCartId } = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<
    string,
    unknown
  >;
  if (typeof email !== "string" || typeof password !== "string" || email.length === 0 || password.length === 0) {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "email and password are required" });
    return;
  }

  const result = await authService.login(email, password);
  if (result.ok) {
    if (typeof anonymousCartId === "string" && anonymousCartId) {
      try {
        await mergeCarts(anonymousCartId, `customer_${result.customer.id}`);
      } catch {
        // ignore merge error
      }
    }
    sendSession(res, 200, result);
    return;
  }
  if (result.reason === "ACCOUNT_LOCKED") {
    res.status(429).json({ error: "ACCOUNT_LOCKED", message: "Too many failed attempts. Try again in 15 minutes." });
    return;
  }
  res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Incorrect email or password" });
}

/** POST /api/auth/logout - requires `requireAuth`. */
export function logout(_req: Request, res: Response): void {
  authService.logout(res.locals.token as string);
  res.status(204).end();
}

/** POST /api/auth/forgot-password */
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "Valid email address is required" });
    return;
  }

  const result = await requestPasswordReset(email.trim());
  res.status(200).json({
    message: "If the account exists, a password reset link has been sent",
    resetToken: process.env.NODE_ENV === "test" ? result.resetToken : undefined,
  });
}

/** POST /api/auth/reset-password */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, newPassword } = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
  if (typeof token !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "VALIDATION_FAILED", message: "token and newPassword are required" });
    return;
  }

  const outcome = await resetPasswordWithToken(token, newPassword);
  if (!outcome.ok) {
    res.status(400).json({ error: outcome.code ?? "RESET_FAILED", message: outcome.message });
    return;
  }

  res.status(200).json({ message: outcome.message });
}
