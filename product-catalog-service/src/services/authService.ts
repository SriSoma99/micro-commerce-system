import { Customer, CustomerRole } from "../types/customer";
import { getIdentityProvider, AuthResult, normalizeEmail } from "../platform/identity/identityProvider";

export { AuthResult, normalizeEmail };

export async function register(input: {
  email: string;
  password: string;
  name: string;
  role?: CustomerRole;
}): Promise<AuthResult> {
  return getIdentityProvider().register(input);
}

export async function login(email: string, password: string): Promise<AuthResult> {
  return getIdentityProvider().login(email, password);
}

export function logout(token: string): void {
  getIdentityProvider().logout(token);
}

/** Resolves a bearer token to its active customer, or `undefined` if unknown/expired/deleted. */
export function authenticate(token: string): Customer | undefined {
  return getIdentityProvider().authenticate(token);
}

/** Re-checks a password for sensitive actions (account deletion) without creating a session. */
export async function confirmPassword(customerId: string, password: string): Promise<boolean> {
  return getIdentityProvider().confirmPassword(customerId, password);
}
