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
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthSession {
  customer: Customer;
  token: string;
  expiresAt: string;
}

export type AddressKind = "shipping" | "billing";

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
  createdAt?: string;
}

export type NewAddress = Omit<Address, "id" | "customerId" | "createdAt" | "country">;

export interface ProfilePatch {
  name?: string;
  phone?: string | null;
  preferredStoreId?: string | null;
  marketingOptIn?: boolean;
}
