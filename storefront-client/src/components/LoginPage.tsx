import { useState, type FormEvent } from "react";
import type { ApiError } from "../api/client";

export interface DemoAccountOption {
  label: string;
  role: string;
  email: string;
  password: string;
  badge?: string;
}

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<ApiError | null>;
  /** Called after a successful sign-in, passing the entered email so the router can direct roles accordingly. */
  onSuccess: (email?: string) => void;
  /** Shown as one-click fills so testing different roles is immediate. */
  demoAccounts?: DemoAccountOption[];
  demoAccount?: { email: string; password: string };
}

const FRIENDLY: Record<string, string> = {
  INVALID_CREDENTIALS: "That email and password don't match. Please try again.",
  ACCOUNT_LOCKED: "Too many failed attempts. Please wait 15 minutes and try again.",
  NETWORK_ERROR: "We can't reach the shop right now. Please check your connection.",
};

export function LoginPage({ onLogin, onSuccess, demoAccounts, demoAccount }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    const failure = await onLogin(email.trim(), password);
    setBusy(false);

    if (failure) {
      setError(FRIENDLY[failure.code] ?? failure.message);
    } else {
      onSuccess(email.trim());
    }
  }

  const effectiveDemoAccounts: DemoAccountOption[] = demoAccounts && demoAccounts.length > 0
    ? demoAccounts
    : demoAccount
    ? [{ label: "Demo Account", role: "customer", email: demoAccount.email, password: demoAccount.password }]
    : [];

  return (
    <div className="page page--narrow">
      <div className="card">
        <h1 className="page__title">Sign in</h1>
        <p className="page__subtitle">Sign in to access your account or back-office store operations.</p>

        <form className="form" onSubmit={submit} noValidate>
          {error && (
            <div className="notice notice--error" role="alert">
              {error}
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="login-email">
              Email
            </label>
            <input id="login-email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={error !== null && !email.trim()} />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="login-password">
              Password
            </label>
            <input id="login-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={error !== null && !password} />
          </div>

          <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div style={{ marginTop: "1rem", textAlign: "center", fontSize: "0.875rem" }}>
          Don&apos;t have an account? <a href="#/signup">Create an account</a>
        </div>

        {effectiveDemoAccounts.length > 0 && (
          <div className="demo-hint" style={{ marginTop: "1.5rem" }}>
            <strong style={{ display: "block", marginBottom: "0.5rem" }}>Quick-fill demo logins:</strong>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {effectiveDemoAccounts.map((demo) => (
                <div key={demo.email} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--color-bg-subtle, #f8fafc)", padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid var(--color-border, #e2e8f0)" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                      {demo.label} <span style={{ fontSize: "0.75rem", padding: "2px 6px", background: demo.role === "store-manager" ? "#e0f2fe" : demo.role === "admin" ? "#fef3c7" : "#f1f5f9", borderRadius: "4px", color: "#0f172a" }}>{demo.role}</span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted, #64748b)" }}>
                      <code>{demo.email}</code>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => {
                      setEmail(demo.email);
                      setPassword(demo.password);
                      setError(null);
                    }}
                  >
                    {demo.role === "store-manager" ? "Fill Manager" : demo.role === "admin" ? "Fill Admin" : "Fill in the demo account"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
