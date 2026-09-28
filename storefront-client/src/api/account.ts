import { apiRequest, type ApiResult } from "./client";
import type { Address, Customer, NewAddress, ProfilePatch } from "../types/account";

export async function fetchProfile(token: string): Promise<ApiResult<Customer>> {
  return apiRequest<Customer>("/customers/me", { token });
}

export async function updateProfile(token: string, patch: ProfilePatch): Promise<ApiResult<Customer>> {
  return apiRequest<Customer>("/customers/me", {
    method: "PATCH",
    token,
    body: patch,
  });
}

export async function listAddresses(token: string): Promise<ApiResult<Address[]>> {
  return apiRequest<Address[]>("/customers/me/addresses", { token });
}

export async function createAddress(token: string, address: NewAddress): Promise<ApiResult<Address>> {
  return apiRequest<Address>("/customers/me/addresses", {
    method: "POST",
    token,
    body: address,
  });
}

export async function updateAddress(
  token: string,
  addressId: string,
  patch: Partial<Omit<NewAddress, "kind">>
): Promise<ApiResult<Address>> {
  return apiRequest<Address>(`/customers/me/addresses/${encodeURIComponent(addressId)}`, {
    method: "PATCH",
    token,
    body: patch,
  });
}

export async function deleteAddress(token: string, addressId: string): Promise<ApiResult<void>> {
  return apiRequest<void>(`/customers/me/addresses/${encodeURIComponent(addressId)}`, {
    method: "DELETE",
    token,
  });
}

export async function exportAccountData(token: string): Promise<ApiResult<unknown>> {
  return apiRequest<unknown>("/customers/me/export", { token });
}

export async function deleteAccount(token: string, password: string): Promise<ApiResult<void>> {
  return apiRequest<void>("/customers/me", {
    method: "DELETE",
    token,
    body: { password },
  });
}
