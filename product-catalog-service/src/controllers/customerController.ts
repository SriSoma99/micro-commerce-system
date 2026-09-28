import { Request, Response } from "express";
import { currentCustomer } from "../middleware/requireAuth";
import { ProfilePatch } from "../data/customerRepository";
import * as authService from "../services/authService";
import * as customerService from "../services/customerService";
import * as orderRepository from "../data/orderRepository";
import { NewAddress } from "../types/customer";
import { liveEnvelope } from "../utils/envelope";

const PHONE_PATTERN = /^[+\d][\d\s().-]{6,19}$/;

function fail(res: Response, details: string[]): void {
  res.status(400).json({ error: "VALIDATION_FAILED", message: "Invalid request", details });
}

function isObject(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

function parseProfilePatch(body: unknown): ProfilePatch | { errors: string[] } {
  if (!isObject(body)) return { errors: ["Request body must be a JSON object"] };
  const errors: string[] = [];
  const patch: ProfilePatch = {};

  if (body.name !== undefined) {
    if (text(body.name, 100)) patch.name = body.name.trim();
    else errors.push("name must be 1-100 characters");
  }
  if (body.phone !== undefined) {
    if (body.phone === null) patch.phone = null;
    else if (typeof body.phone === "string" && PHONE_PATTERN.test(body.phone.trim())) patch.phone = body.phone.trim();
    else errors.push("phone must be a valid phone number or null");
  }
  if (body.preferredStoreId !== undefined) {
    if (body.preferredStoreId === null) patch.preferredStoreId = null;
    else if (typeof body.preferredStoreId === "string" && customerService.isKnownStore(body.preferredStoreId)) {
      patch.preferredStoreId = body.preferredStoreId;
    } else errors.push("preferredStoreId must be the id of a configured store or null");
  }
  if (body.marketingOptIn !== undefined) {
    if (typeof body.marketingOptIn === "boolean") patch.marketingOptIn = body.marketingOptIn;
    else errors.push("marketingOptIn must be a boolean");
  }
  if (errors.length === 0 && Object.keys(patch).length === 0) errors.push("No updatable fields supplied");

  return errors.length > 0 ? { errors } : patch;
}

/** GET /api/customers/me */
export function getMe(_req: Request, res: Response): void {
  res.status(200).json(liveEnvelope(currentCustomer(res)));
}

/** GET /api/customers/me/export - full personal data export (CUS-04) */
export function exportMe(_req: Request, res: Response): void {
  const customer = currentCustomer(res);
  const addresses = customerService.listAddresses(customer.id);
  const orders = orderRepository.listOrders(customer.id);

  const exportData = {
    customer,
    addresses,
    orders,
    exportedAt: new Date().toISOString(),
  };

  res.setHeader("Content-Disposition", `attachment; filename="customer-data-${customer.id}.json"`);
  res.status(200).json(liveEnvelope(exportData));
}

/** PATCH /api/customers/me - name, phone, preferredStoreId, marketingOptIn. */
export function updateMe(req: Request, res: Response): void {
  const parsed = parseProfilePatch(req.body);
  if ("errors" in parsed) return fail(res, parsed.errors);

  const updated = customerService.updateProfile(currentCustomer(res).id, parsed);
  res.status(200).json(liveEnvelope(updated));
}

/** DELETE /api/customers/me - requires the current password; anonymizes the account. */
export async function deleteMe(req: Request, res: Response): Promise<void> {
  const password = isObject(req.body) ? req.body.password : undefined;
  if (typeof password !== "string" || password.length === 0) return fail(res, ["password is required to delete the account"]);

  const customer = currentCustomer(res);
  if (!(await authService.confirmPassword(customer.id, password))) {
    res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Incorrect password" });
    return;
  }
  customerService.deleteAccount(customer.id);
  res.status(204).end();
}

// ---- Addresses ------------------------------------------------------------------

type AddressBody = Omit<NewAddress, "isDefault"> & { isDefault?: boolean };

function parseAddressFields(body: Record<string, unknown>, requireAll: boolean): { errors: string[]; fields: Partial<AddressBody> } {
  const errors: string[] = [];
  const fields: Partial<AddressBody> = {};

  for (const key of ["recipient", "line1", "city", "region", "postalCode"] as const) {
    const value = body[key];
    if (value === undefined) {
      if (requireAll) errors.push(`${key} is required`);
    } else if (text(value, 100)) fields[key] = value.trim();
    else errors.push(`${key} must be 1-100 characters`);
  }
  if (body.line2 !== undefined) {
    if (body.line2 === null) fields.line2 = null;
    else if (text(body.line2, 100)) fields.line2 = body.line2.trim();
    else errors.push("line2 must be 1-100 characters or null");
  }
  if (body.isDefault !== undefined) {
    if (typeof body.isDefault === "boolean") fields.isDefault = body.isDefault;
    else errors.push("isDefault must be a boolean");
  }

  errors.push(...customerService.validateAddressFields(fields));
  return { errors, fields };
}

/** GET /api/customers/me/addresses */
export function listAddresses(_req: Request, res: Response): void {
  res.status(200).json(liveEnvelope(customerService.listAddresses(currentCustomer(res).id)));
}

/** POST /api/customers/me/addresses */
export function createAddress(req: Request, res: Response): void {
  if (!isObject(req.body)) return fail(res, ["Request body must be a JSON object"]);
  const kind = req.body.kind;
  const { errors, fields } = parseAddressFields(req.body, true);
  if (kind !== "shipping" && kind !== "billing") errors.push('kind must be "shipping" or "billing"');
  if (errors.length > 0) return fail(res, errors);

  const created = customerService.addAddress(currentCustomer(res).id, {
    kind: kind as NewAddress["kind"],
    recipient: fields.recipient as string,
    line1: fields.line1 as string,
    line2: fields.line2 ?? null,
    city: fields.city as string,
    region: fields.region as string,
    postalCode: fields.postalCode as string,
    isDefault: fields.isDefault ?? false,
  });

  if (created === "ADDRESS_LIMIT") {
    res.status(409).json({ error: "ADDRESS_LIMIT", message: "Address book is full (20 addresses)" });
    return;
  }
  res.status(201).json(liveEnvelope(created));
}

/** PATCH /api/customers/me/addresses/:addressId - `kind` is immutable. */
export function updateAddress(req: Request, res: Response): void {
  if (!isObject(req.body)) return fail(res, ["Request body must be a JSON object"]);
  const { errors, fields } = parseAddressFields(req.body, false);
  if (req.body.kind !== undefined) errors.push("kind cannot be changed");
  if (errors.length === 0 && Object.keys(fields).length === 0) errors.push("No updatable fields supplied");
  if (errors.length > 0) return fail(res, errors);

  const updated = customerService.updateAddress(currentCustomer(res).id, req.params.addressId as string, fields);
  if (!updated) return notFound(res, req.params.addressId as string);
  res.status(200).json(liveEnvelope(updated));
}

/** DELETE /api/customers/me/addresses/:addressId */
export function deleteAddress(req: Request, res: Response): void {
  const id = req.params.addressId as string;
  if (!customerService.removeAddress(currentCustomer(res).id, id)) return notFound(res, id);
  res.status(204).end();
}

function notFound(res: Response, id: string): void {
  res.status(404).json({ error: "ADDRESS_NOT_FOUND", message: `No address found with id "${id}"` });
}
