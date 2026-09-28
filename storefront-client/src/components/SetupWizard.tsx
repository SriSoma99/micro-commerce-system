import { useEffect, useState, type FormEvent } from "react";
import * as setupApi from "../api/setup";
import type { RegionOption } from "../api/setup";
import type { StoreConfig } from "../types/store";

interface SetupWizardProps {
  onInstalled: (config: StoreConfig) => void;
}

export function SetupWizard({ onInstalled }: SetupWizardProps) {
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<RegionOption[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>("US");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Store configuration
  const [stores, setStores] = useState([
    { id: "store_1", name: "Batavia Central", taxJurisdiction: "IL" },
    { id: "store_2", name: "Columbus East", taxJurisdiction: "OH" },
    { id: "store_3", name: "Pittsburgh North", taxJurisdiction: "PA" },
  ]);

  // Admin user
  const [adminName, setAdminName] = useState("Store Administrator");
  const [adminEmail, setAdminEmail] = useState("admin@example.com");
  const [adminPassword, setAdminPassword] = useState("Demo@1234");

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      const res = await setupApi.fetchSetupOptions();
      if (cancelled) return;
      setLoading(false);
      if (res.ok && res.data.length > 0) {
        setOptions(res.data);
        setSelectedRegion(res.data[0].code);
      } else {
        setError("Failed to load setup configuration options from server.");
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeOption = options.find((o) => o.code === selectedRegion) || options[0];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!setupToken.trim()) {
      setError("One-time setup token is required.");
      return;
    }

    setBusy(true);
    setError(null);

    const payload: setupApi.InstallPayload = {
      region: selectedRegion,
      stores,
      adminUser: adminEmail.trim()
        ? {
            name: adminName.trim(),
            email: adminEmail.trim(),
            password: adminPassword,
          }
        : undefined,
    };

    const res = await setupApi.installStore(setupToken.trim(), payload);
    setBusy(false);

    if (res.ok) {
      onInstalled(res.data);
    } else {
      setError(res.message || "Failed to complete store installation.");
    }
  }

  if (loading) {
    return (
      <div className="page page--narrow">
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          <h2>Loading Setup Wizard…</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <div className="card card--padded">
        <h1 className="page__title">Store Setup Wizard</h1>
        <p className="page__subtitle">
          Configure initial region pack, tax jurisdiction rules, demo stores, and initial administrator account.
        </p>

        {error && (
          <div className="notice notice--error" role="alert">
            {error}
          </div>
        )}

        <div className="banner banner--info" style={{ marginBottom: "1.5rem" }}>
          <strong>Demo Notice:</strong> Enabled payment methods include simulated test providers. No real financial charges occur.
        </div>

        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field__label" htmlFor="setup-token">
              One-Time Setup Token (found in server console logs or <code>SETUP_TOKEN</code> env)
            </label>
            <input
              id="setup-token"
              className="input"
              type="password"
              placeholder="e.g. 9efcdb20ae5c..."
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="setup-region">
              Region & Currency Pack
            </label>
            <select
              id="setup-region"
              className="input select"
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
            >
              {options.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.displayName} ({opt.defaults.currency} - {opt.defaults.priceMode})
                </option>
              ))}
            </select>
          </div>

          {activeOption && (
            <div className="field" style={{ background: "#f7fafc", padding: "0.75rem", borderRadius: "6px" }}>
              <p style={{ margin: "0.25rem 0", fontSize: "0.9rem" }}>
                <strong>Currency:</strong> {activeOption.defaults.currency} | <strong>Price Mode:</strong> {activeOption.defaults.priceMode}
              </p>
              <p style={{ margin: "0.25rem 0", fontSize: "0.9rem" }}>
                <strong>Tax Provider:</strong> {activeOption.defaults.taxProvider}
              </p>
              <p style={{ margin: "0.25rem 0", fontSize: "0.9rem" }}>
                <strong>Payment Methods:</strong> {activeOption.defaults.payments.join(", ")}
              </p>
            </div>
          )}

          <fieldset style={{ border: "1px solid #e2e8f0", padding: "1rem", borderRadius: "6px", margin: "1rem 0" }}>
            <legend style={{ fontWeight: 600, padding: "0 0.5rem" }}>Demo Store Locations (5 stores / 3 states)</legend>
            {stores.map((s, idx) => (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <input className="input" value={s.id} disabled />
                <input
                  className="input"
                  value={s.name}
                  onChange={(e) => {
                    const next = [...stores];
                    next[idx].name = e.target.value;
                    setStores(next);
                  }}
                  required
                />
                <input
                  className="input"
                  value={s.taxJurisdiction}
                  onChange={(e) => {
                    const next = [...stores];
                    next[idx].taxJurisdiction = e.target.value.toUpperCase();
                    setStores(next);
                  }}
                  maxLength={2}
                  required
                />
              </div>
            ))}
          </fieldset>

          <fieldset style={{ border: "1px solid #e2e8f0", padding: "1rem", borderRadius: "6px", margin: "1rem 0" }}>
            <legend style={{ fontWeight: 600, padding: "0 0.5rem" }}>Create First Administrator Account (CUS-08)</legend>
            <div className="field">
              <label className="field__label">Admin Full Name</label>
              <input className="input" value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
            </div>
            <div className="field">
              <label className="field__label">Admin Email</label>
              <input className="input" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label className="field__label">Admin Password</label>
              <input className="input" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required />
            </div>
          </fieldset>

          <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy}>
            {busy ? "Installing Store…" : "Complete Store Setup"}
          </button>
        </form>
      </div>
    </div>
  );
}
