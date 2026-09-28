import { Customer, CustomerRole } from "../../types/customer";
import * as customerRepository from "../../data/customerRepository";
import * as sessionRepository from "../../data/sessionRepository";
import { hashPassword, hashPasswordSync, verifyPassword } from "../../utils/passwordHasher";
import { createHash, randomBytes } from "node:crypto";

export type AuthResult =
  | { ok: true; customer: Customer; token: string; expiresAt: string }
  | { ok: false; reason: "INVALID_CREDENTIALS" | "ACCOUNT_LOCKED" | "EMAIL_TAKEN" };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function startSession(customer: Customer): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  sessionRepository.createSession(hashToken(token), customer.id, expiresAt);
  return { token, expiresAt };
}

let dummyHash: string | undefined;
function getDummyHash(): string {
  dummyHash ??= hashPasswordSync("timing-equalisation-only");
  return dummyHash;
}

/**
 * IdentityProvider port interface allowing external identity providers
 * (e.g. Auth0, AWS Cognito, Keycloak, OIDC) to replace local SQLite identity.
 */
export interface IdentityProvider {
  readonly id: string;
  readonly displayName: string;
  register(input: { email: string; password: string; name: string; role?: CustomerRole }): Promise<AuthResult>;
  login(email: string, password: string): Promise<AuthResult>;
  logout(token: string): void;
  authenticate(token: string): Customer | undefined;
  confirmPassword(customerId: string, password: string): Promise<boolean>;
}

export class SqliteIdentityProvider implements IdentityProvider {
  readonly id = "sqlite";
  readonly displayName = "Local SQLite Database";

  async register(input: { email: string; password: string; name: string; role?: CustomerRole }): Promise<AuthResult> {
    const passwordHash = await hashPassword(input.password);
    const created = customerRepository.insertCustomer({
      email: normalizeEmail(input.email),
      passwordHash,
      name: input.name.trim(),
      role: input.role,
    });
    if (created === "EMAIL_TAKEN") return { ok: false, reason: "EMAIL_TAKEN" };

    return { ok: true, customer: created, ...startSession(created) };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const record = customerRepository.findAuthByEmail(normalizeEmail(email));

    if (!record || record.customer.status !== "active") {
      await verifyPassword(password, getDummyHash());
      return { ok: false, reason: "INVALID_CREDENTIALS" };
    }

    const now = new Date();
    if (record.lockedUntil && record.lockedUntil > now.toISOString()) {
      return { ok: false, reason: "ACCOUNT_LOCKED" };
    }

    if (!(await verifyPassword(password, record.passwordHash))) {
      customerRepository.recordFailedLogin(
        record.customer.id,
        MAX_FAILED_LOGINS,
        new Date(now.getTime() + LOCKOUT_MS).toISOString()
      );
      return { ok: false, reason: "INVALID_CREDENTIALS" };
    }

    customerRepository.clearLoginState(record.customer.id);
    sessionRepository.purgeExpiredSessions(now.toISOString());
    return { ok: true, customer: record.customer, ...startSession(record.customer) };
  }

  logout(token: string): void {
    sessionRepository.deleteSession(hashToken(token));
  }

  authenticate(token: string): Customer | undefined {
    const customerId = sessionRepository.findSessionCustomerId(hashToken(token), new Date().toISOString());
    return customerId ? customerRepository.findCustomerById(customerId) : undefined;
  }

  async confirmPassword(customerId: string, password: string): Promise<boolean> {
    const record = customerRepository.findAuthById(customerId);
    if (!record || record.customer.status !== "active") return false;
    return verifyPassword(password, record.passwordHash);
  }
}

let activeIdentityProvider: IdentityProvider = new SqliteIdentityProvider();

export function getIdentityProvider(): IdentityProvider {
  return activeIdentityProvider;
}

export function setIdentityProvider(provider: IdentityProvider): void {
  activeIdentityProvider = provider;
}
