import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as accountApi from "../api/account";
import type { Address, Customer, NewAddress } from "../types/account";
import type { StoreLocation } from "../types/store";

interface AccountPageProps {
  token: string;
  customer: Customer;
  stores?: StoreLocation[];
  onProfileUpdated?: () => void;
  onSignOut: () => void;
}

type Tab = "profile" | "addresses" | "privacy";

export function AccountPage({
  token,
  customer,
  stores = [],
  onProfileUpdated,
  onSignOut,
}: AccountPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  // Profile Form state
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [preferredStoreId, setPreferredStoreId] = useState<string>(customer.preferredStoreId ?? "");
  const [marketingOptIn, setMarketingOptIn] = useState(customer.marketingOptIn);
  const [profileMessage, setProfileMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Address Book state
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState<NewAddress>({
    kind: "shipping",
    recipient: "",
    line1: "",
    line2: "",
    city: "",
    region: "IL",
    postalCode: "",
    isDefault: false,
  });
  const [addressError, setAddressError] = useState<string | null>(null);
  const [savingAddress, setSavingAddress] = useState(false);

  // Privacy / Deletion state
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadAddressBook = useCallback(async () => {
    setLoadingAddresses(true);
    const res = await accountApi.listAddresses(token);
    setLoadingAddresses(false);
    if (res.ok) {
      setAddresses(res.data);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === "addresses") {
      void loadAddressBook();
    }
  }, [activeTab, loadAddressBook]);

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMessage(null);

    const res = await accountApi.updateProfile(token, {
      name: name.trim(),
      phone: phone.trim() ? phone.trim() : null,
      preferredStoreId: preferredStoreId || null,
      marketingOptIn,
    });

    setSavingProfile(false);
    if (res.ok) {
      setProfileMessage({ text: "Profile updated successfully.", type: "success" });
      onProfileUpdated?.();
    } else {
      setProfileMessage({ text: res.message || "Failed to update profile", type: "error" });
    }
  }

  function openAddAddress() {
    setEditingAddressId(null);
    setAddressForm({
      kind: "shipping",
      recipient: customer.name,
      line1: "",
      line2: "",
      city: "",
      region: "IL",
      postalCode: "",
      isDefault: addresses.length === 0,
    });
    setAddressError(null);
    setAddressModalOpen(true);
  }

  function openEditAddress(addr: Address) {
    setEditingAddressId(addr.id);
    setAddressForm({
      kind: addr.kind,
      recipient: addr.recipient,
      line1: addr.line1,
      line2: addr.line2 ?? "",
      city: addr.city,
      region: addr.region,
      postalCode: addr.postalCode,
      isDefault: addr.isDefault,
    });
    setAddressError(null);
    setAddressModalOpen(true);
  }

  async function handleAddressSubmit(e: FormEvent) {
    e.preventDefault();
    setSavingAddress(true);
    setAddressError(null);

    if (editingAddressId) {
      const res = await accountApi.updateAddress(token, editingAddressId, {
        recipient: addressForm.recipient.trim(),
        line1: addressForm.line1.trim(),
        line2: addressForm.line2?.trim() || null,
        city: addressForm.city.trim(),
        region: addressForm.region.trim(),
        postalCode: addressForm.postalCode.trim(),
        isDefault: addressForm.isDefault,
      });
      setSavingAddress(false);
      if (res.ok) {
        setAddressModalOpen(false);
        await loadAddressBook();
      } else {
        setAddressError(res.message);
      }
    } else {
      const res = await accountApi.createAddress(token, {
        ...addressForm,
        recipient: addressForm.recipient.trim(),
        line1: addressForm.line1.trim(),
        line2: addressForm.line2?.trim() || null,
        city: addressForm.city.trim(),
        region: addressForm.region.trim(),
        postalCode: addressForm.postalCode.trim(),
      });
      setSavingAddress(false);
      if (res.ok) {
        setAddressModalOpen(false);
        await loadAddressBook();
      } else {
        setAddressError(res.message);
      }
    }
  }

  async function handleDeleteAddress(addressId: string) {
    if (!window.confirm("Are you sure you want to delete this address?")) return;
    const res = await accountApi.deleteAddress(token, addressId);
    if (res.ok) {
      await loadAddressBook();
    } else {
      alert(res.message || "Failed to delete address");
    }
  }

  async function handleExportData() {
    setExporting(true);
    const res = await accountApi.exportAccountData(token);
    setExporting(false);
    if (res.ok) {
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fresh-basket-account-${customer.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      alert("Failed to export account data.");
    }
  }

  async function handleDeleteAccount(e: FormEvent) {
    e.preventDefault();
    if (!deletePassword) {
      setDeleteError("Password is required to close your account.");
      return;
    }
    if (!window.confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
      return;
    }

    setDeletingAccount(true);
    setDeleteError(null);
    const res = await accountApi.deleteAccount(token, deletePassword);
    setDeletingAccount(false);

    if (res.ok) {
      alert("Your account has been deleted. We have anonymized your personal details.");
      onSignOut();
    } else {
      setDeleteError(res.message || "Failed to delete account. Please verify your password.");
    }
  }

  return (
    <div className="page page--wide">
      <div className="account-header">
        <h1 className="page__title">My Account</h1>
        <p className="page__subtitle">Manage your profile, delivery addresses, and privacy settings.</p>

        <div className="tabs" role="tablist" style={{ display: "flex", gap: "1rem", borderBottom: "1px solid #e2e8f0", margin: "1.5rem 0" }}>
          <button
            type="button"
            className={`btn btn--tab ${activeTab === "profile" ? "btn--tab-active" : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            Profile
          </button>
          <button
            type="button"
            className={`btn btn--tab ${activeTab === "addresses" ? "btn--tab-active" : ""}`}
            onClick={() => setActiveTab("addresses")}
          >
            Address Book
          </button>
          <button
            type="button"
            className={`btn btn--tab ${activeTab === "privacy" ? "btn--tab-active" : ""}`}
            onClick={() => setActiveTab("privacy")}
          >
            Privacy & Settings
          </button>
        </div>
      </div>

      {activeTab === "profile" && (
        <div className="card card--padded" style={{ maxWidth: "600px" }}>
          <h2>Profile Details</h2>
          <form className="form" onSubmit={handleProfileSubmit}>
            {profileMessage && (
              <div
                className={`notice notice--${profileMessage.type === "success" ? "info" : "error"}`}
                role="status"
              >
                {profileMessage.text}
              </div>
            )}

            <div className="field">
              <label className="field__label" htmlFor="account-email">Email Address</label>
              <input id="account-email" className="input" type="email" value={customer.email} disabled />
              <small style={{ color: "#718096" }}>Role: <strong>{customer.role}</strong></small>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="account-name">Full Name</label>
              <input
                id="account-name"
                className="input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="account-phone">Phone Number</label>
              <input
                id="account-phone"
                className="input"
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            {stores.length > 0 && (
              <div className="field">
                <label className="field__label" htmlFor="account-store">Preferred Store</label>
                <select
                  id="account-store"
                  className="input select"
                  value={preferredStoreId}
                  onChange={(e) => setPreferredStoreId(e.target.value)}
                >
                  <option value="">No preference</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.taxJurisdiction})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="field field--checkbox" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                id="account-marketing"
                type="checkbox"
                checked={marketingOptIn}
                onChange={(e) => setMarketingOptIn(e.target.checked)}
              />
              <label htmlFor="account-marketing" style={{ margin: 0 }}>
                Receive weekly specials and discount alerts
              </label>
            </div>

            <button type="submit" className="btn btn--primary" disabled={savingProfile}>
              {savingProfile ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </div>
      )}

      {activeTab === "addresses" && (
        <div className="address-book-container">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2>Saved Addresses</h2>
            <button type="button" className="btn btn--primary" onClick={openAddAddress}>
              + Add New Address
            </button>
          </div>

          {loadingAddresses ? (
            <p>Loading addresses…</p>
          ) : addresses.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
              <p>You have no saved addresses yet.</p>
              <button type="button" className="btn btn--secondary" onClick={openAddAddress}>
                Add your first address
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
              {addresses.map((addr) => (
                <div key={addr.id} className="card card--address" style={{ position: "relative", padding: "1.25rem" }}>
                  {addr.isDefault && (
                    <span className="badge badge--primary" style={{ position: "absolute", top: "1rem", right: "1rem", fontSize: "0.75rem" }}>
                      Default {addr.kind}
                    </span>
                  )}
                  <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem" }}>{addr.recipient}</h3>
                  <p style={{ margin: "0.25rem 0", color: "#4a5568" }}>{addr.line1}</p>
                  {addr.line2 && <p style={{ margin: "0.25rem 0", color: "#4a5568" }}>{addr.line2}</p>}
                  <p style={{ margin: "0.25rem 0", color: "#4a5568" }}>
                    {addr.city}, {addr.region.toUpperCase()} {addr.postalCode}
                  </p>
                  <p style={{ margin: "0.25rem 0", color: "#718096", fontSize: "0.85rem" }}>
                    Kind: {addr.kind}
                  </p>
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                    <button type="button" className="btn btn--secondary btn--sm" onClick={() => openEditAddress(addr)}>
                      Edit
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => void handleDeleteAddress(addr.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {addressModalOpen && (
            <div className="modal-backdrop" role="dialog" aria-modal="true">
              <div className="modal-dialog card" style={{ maxWidth: "500px", margin: "auto" }}>
                <h2>{editingAddressId ? "Edit Address" : "Add Address"}</h2>
                <form className="form" onSubmit={handleAddressSubmit}>
                  {addressError && (
                    <div className="notice notice--error" role="alert">
                      {addressError}
                    </div>
                  )}

                  <div className="field">
                    <label className="field__label">Recipient Name</label>
                    <input
                      className="input"
                      type="text"
                      value={addressForm.recipient}
                      onChange={(e) => setAddressForm({ ...addressForm, recipient: e.target.value })}
                      required
                    />
                  </div>

                  <div className="field">
                    <label className="field__label">Address Line 1</label>
                    <input
                      className="input"
                      type="text"
                      value={addressForm.line1}
                      onChange={(e) => setAddressForm({ ...addressForm, line1: e.target.value })}
                      required
                    />
                  </div>

                  <div className="field">
                    <label className="field__label">Address Line 2 (Optional)</label>
                    <input
                      className="input"
                      type="text"
                      value={addressForm.line2 ?? ""}
                      onChange={(e) => setAddressForm({ ...addressForm, line2: e.target.value })}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "0.5rem" }}>
                    <div className="field">
                      <label className="field__label">City</label>
                      <input
                        className="input"
                        type="text"
                        value={addressForm.city}
                        onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                        required
                      />
                    </div>
                    <div className="field">
                      <label className="field__label">State</label>
                      <input
                        className="input"
                        type="text"
                        maxLength={2}
                        value={addressForm.region}
                        onChange={(e) => setAddressForm({ ...addressForm, region: e.target.value.toUpperCase() })}
                        required
                      />
                    </div>
                    <div className="field">
                      <label className="field__label">ZIP</label>
                      <input
                        className="input"
                        type="text"
                        maxLength={10}
                        value={addressForm.postalCode}
                        onChange={(e) => setAddressForm({ ...addressForm, postalCode: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="field field--checkbox" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                      id="addr-default"
                      type="checkbox"
                      checked={addressForm.isDefault}
                      onChange={(e) => setAddressForm({ ...addressForm, isDefault: e.target.checked })}
                    />
                    <label htmlFor="addr-default" style={{ margin: 0 }}>Set as default address</label>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                    <button type="button" className="btn btn--secondary" onClick={() => setAddressModalOpen(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn--primary" disabled={savingAddress}>
                      {savingAddress ? "Saving…" : "Save Address"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "privacy" && (
        <div style={{ display: "grid", gap: "1.5rem", maxWidth: "600px" }}>
          <div className="card card--padded">
            <h2>Download Personal Data</h2>
            <p style={{ color: "#4a5568" }}>
              Export a complete snapshot of your account profile, addresses, and order references in JSON format (CUS-04).
            </p>
            <button type="button" className="btn btn--secondary" onClick={() => void handleExportData()} disabled={exporting}>
              {exporting ? "Exporting…" : "Download My Data"}
            </button>
          </div>

          <div className="card card--padded" style={{ borderLeft: "4px solid #e53e3e" }}>
            <h2 style={{ color: "#c53030" }}>Close Account</h2>
            <p style={{ color: "#4a5568" }}>
              Deleting your account will anonymize your personal information and purge active sessions. Historical orders are retained for legal/tax records without personal identifying info.
            </p>

            <form className="form" onSubmit={handleDeleteAccount}>
              {deleteError && (
                <div className="notice notice--error" role="alert">
                  {deleteError}
                </div>
              )}
              <div className="field">
                <label className="field__label" htmlFor="delete-pwd">
                  Confirm your password to close account
                </label>
                <input
                  id="delete-pwd"
                  className="input"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Your current password"
                  required
                />
              </div>

              <button type="submit" className="btn btn--danger" disabled={deletingAccount}>
                {deletingAccount ? "Closing Account…" : "Permanently Close My Account"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
