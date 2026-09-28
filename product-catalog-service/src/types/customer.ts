/**
 * Domain model for the Customer & Identity bounded context.
 *
 * `Customer` is the public projection - it never carries the password hash
 * or login-lockout bookkeeping, which stay inside `data/customerRepository.ts`
 * (see `CustomerAuthRecord` there) so they can't leak into a response.
 */
export type CustomerRole = "customer" | "store-manager" | "finance" | "admin";
export type CustomerStatus = "active" | "deleted";

export interface Customer {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  preferredStoreId: string | null;
  marketingOptIn: boolean;
  role: CustomerRole;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
}

export type AddressKind = "shipping" | "billing";

/** `region` / `postalCode` are the state/ZIP in the US; validation rules come from the region pack. */
export interface Address {
  id: string;
  customerId: string;
  kind: AddressKind;
  recipient: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: string;
}

export type NewAddress = Omit<Address, "id" | "customerId" | "createdAt" | "country">;
