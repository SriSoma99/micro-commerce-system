import { useState, type FormEvent } from "react";
import type { ApiError } from "../api/client";

interface SignUpPageProps {
  onRegister: (email: string, password: string, name: string) => Promise<ApiError | null>;
  onSuccess: () => void;
}

const FRIENDLY: Record<string, string> = {
  EMAIL_TAKEN: "An account with this email address already exists.",
  VALIDATION_FAILED: "Please fill in all required fields properly.",
  NETWORK_ERROR: "We can't reach the shop right now. Please check your connection.",
};

export function SignUpPage({ onRegister, onSuccess }: SignUpPageProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      setError("Please fill in your name, email, and password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    setError(null);
    const failure = await onRegister(email.trim(), password, name.trim());
    setBusy(false);

    if (failure) {
      setError(FRIENDLY[failure.code] ?? failure.message);
    } else {
      onSuccess();
    }
  }

  return (
    <div className="page page--narrow">
      <div className="card">
        <h1 className="page__title">Create an account</h1>
        <p className="page__subtitle">Sign up to manage your orders, addresses, and fast checkout.</p>

        <form className="form" onSubmit={submit} noValidate>
          {error && (
            <div className="notice notice--error" role="alert">
              {error}
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="signup-name">
              Full Name
            </label>
            <input
              id="signup-name"
              className="input"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="signup-email">
              Email Address
            </label>
            <input
              id="signup-email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="signup-password">
              Password
            </label>
            <input
              id="signup-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="signup-confirm-password">
              Confirm Password
            </label>
            <input
              id="signup-confirm-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>

        <div style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "0.875rem" }}>
          Already have an account? <a href="#/login">Sign in</a>
        </div>
      </div>
    </div>
  );
}
