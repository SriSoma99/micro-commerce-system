import * as addressRepository from "../data/addressRepository";
import * as customerRepository from "../data/customerRepository";
import { ProfilePatch } from "../data/customerRepository";
import { getAddressRules, getPlatform } from "../platform/platform";
import { Address, Customer, NewAddress } from "../types/customer";

const MAX_ADDRESSES = 20;

export function getProfile(customerId: string): Customer | undefined {
  return customerRepository.findCustomerById(customerId);
}

/** Before install there are no stores to check against, so any id is accepted. */
export function isKnownStore(storeId: string): boolean {
  const platform = getPlatform();
  return platform ? platform.config.stores.some((store) => store.id === storeId) : true;
}

export function updateProfile(customerId: string, patch: ProfilePatch): Customer | undefined {
  return customerRepository.updateProfile(customerId, patch);
}

/** Anonymizes the account and ends every session (see `anonymizeCustomer`). */
export function deleteAccount(customerId: string): void {
  customerRepository.anonymizeCustomer(customerId);
}

// ---- Addresses ----------------------------------------------------------------

export type AddressFieldErrors = string[];

/** Region-specific checks (state / ZIP format) come from the installed region pack, not from here. */
export function validateAddressFields(input: { region?: string; postalCode?: string }): AddressFieldErrors {
  const rules = getAddressRules();
  const errors: string[] = [];

  if (input.region !== undefined && !new RegExp(rules.regionPattern).test(input.region)) {
    errors.push(`region must look like "${rules.regionExample}"`);
  }
  if (input.postalCode !== undefined && !new RegExp(rules.postalCodePattern).test(input.postalCode)) {
    errors.push(`postalCode must look like "${rules.postalCodeExample}"`);
  }
  return errors;
}

export function listAddresses(customerId: string): Address[] {
  return addressRepository.listAddresses(customerId);
}

export function getAddress(customerId: string, addressId: string): Address | undefined {
  return addressRepository.findAddress(customerId, addressId);
}

export function addAddress(customerId: string, input: NewAddress): Address | "ADDRESS_LIMIT" {
  if (addressRepository.countAddresses(customerId) >= MAX_ADDRESSES) return "ADDRESS_LIMIT";
  const rules = getAddressRules();
  return addressRepository.insertAddress(customerId, rules.country, {
    ...input,
    region: input.region.toUpperCase(),
  });
}

/**
 * A default address can't be un-defaulted by patching it (that would leave the
 * kind with no default) - make another address the default instead.
 */
export function updateAddress(
  customerId: string,
  addressId: string,
  patch: Partial<Omit<NewAddress, "kind">>
): Address | undefined {
  const current = addressRepository.findAddress(customerId, addressId);
  if (!current) return undefined;

  return addressRepository.updateAddress(customerId, addressId, {
    recipient: patch.recipient ?? current.recipient,
    line1: patch.line1 ?? current.line1,
    line2: patch.line2 === undefined ? current.line2 : patch.line2,
    city: patch.city ?? current.city,
    region: (patch.region ?? current.region).toUpperCase(),
    postalCode: patch.postalCode ?? current.postalCode,
    isDefault: current.isDefault || patch.isDefault === true,
  });
}

export function removeAddress(customerId: string, addressId: string): boolean {
  return addressRepository.deleteAddress(customerId, addressId);
}
