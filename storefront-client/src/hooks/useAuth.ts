import { useCallback, useEffect, useState } from "react";
import { apiRequest, type ApiError } from "../api/client";
import type { AuthSession, Customer } from "../types/account";

const TOKEN_KEY = "fresh-basket-token";

export type AuthStatus = "loading" | "anonymous" | "signedIn";

export interface UseAuthResult {
  status: AuthStatus;
  customer: Customer | null;
  token: string | null;
  login: (email: string, password: string) => Promise<ApiError | null>;
  register: (email: string, password: string, name: string) => Promise<ApiError | null>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be blocked (private mode); the session then lasts until the page is closed.
  }
}

/**
 * Owns the signed-in customer. The bearer token is kept in localStorage so a
 * reload stays signed in; on load it is validated against the server (a
 * revoked or expired token drops the user back to "anonymous").
 */
export function useAuth(): UseAuthResult {
  const [token, setToken] = useState<string | null>(readToken);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() => (readToken() ? "loading" : "anonymous"));

  useEffect(() => {
    if (!token || customer) return;
    let cancelled = false;

    void apiRequest<Customer>("/customers/me", { token }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setCustomer(result.data);
        setStatus("signedIn");
      } else if (result.status === 401) {
        writeToken(null);
        setToken(null);
        setStatus("anonymous");
      } else {
        // The server is unreachable: keep the token, show as signed out until it is back.
        setStatus("anonymous");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, customer]);

  const login = useCallback(async (email: string, password: string): Promise<ApiError | null> => {
    const result = await apiRequest<AuthSession>("/auth/login", { method: "POST", body: { email, password } });
    if (!result.ok) return result;

    writeToken(result.data.token);
    setToken(result.data.token);
    setCustomer(result.data.customer);
    setStatus("signedIn");
    return null;
  }, []);

  const register = useCallback(async (email: string, password: string, name: string): Promise<ApiError | null> => {
    const result = await apiRequest<AuthSession>("/auth/register", {
      method: "POST",
      body: { email, password, name },
    });
    if (!result.ok) return result;

    writeToken(result.data.token);
    setToken(result.data.token);
    setCustomer(result.data.customer);
    setStatus("signedIn");
    return null;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    const res = await apiRequest<Customer>("/customers/me", { token });
    if (res.ok) {
      setCustomer(res.data);
    }
  }, [token]);

  const logout = useCallback(async () => {
    const current = token;
    writeToken(null);
    setToken(null);
    setCustomer(null);
    setStatus("anonymous");
    if (current) await apiRequest("/auth/logout", { method: "POST", token: current });
  }, [token]);

  return { status, customer, token, login, register, logout, refreshProfile };
}
