import type { StoreLocation } from "../types/store";

interface StorePickerProps {
  stores: StoreLocation[];
  value: string | null;
  onChange: (storeId: string) => void;
}

/** Which store the shopper is buying from: it decides the sales tax (and, later, stock and pickup). */
export function StorePicker({ stores, value, onChange }: StorePickerProps) {
  if (stores.length === 0) return null;
  return (
    <label className="store-picker">
      <span className="store-picker__label">Pickup at</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} aria-label="Pickup store">
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </select>
    </label>
  );
}
