import { Request, Response } from "express";
import { currentCustomer } from "../middleware/requireAuth";
import { getInvoice, listInvoices, renderInvoiceHtml } from "../services/invoiceService";
import { liveEnvelope } from "../utils/envelope";

const notFound = (res: Response, id: string): void => {
  res.status(404).json({ error: "INVOICE_NOT_FOUND", message: `No invoice found with id "${id}"` });
};

const isStaffRole = (role?: string): boolean => ["admin", "finance", "store-manager"].includes(role ?? "");

/** GET /api/customers/me/invoices - stored under the customer's login, newest first. */
export function listMyInvoices(_req: Request, res: Response): void {
  const customer = currentCustomer(res);
  res.status(200).json(liveEnvelope(listInvoices(customer.id, isStaffRole(customer.role))));
}

/** GET /api/customers/me/invoices/:invoiceId - the stored, immutable invoice as JSON. */
export function getMyInvoice(req: Request, res: Response): void {
  const customer = currentCustomer(res);
  const invoice = getInvoice(customer.id, req.params.invoiceId as string, isStaffRole(customer.role));
  if (!invoice) return notFound(res, req.params.invoiceId as string);
  res.status(200).json(liveEnvelope(invoice));
}

/** GET /api/customers/me/invoices/:invoiceId/html - the printable receipt (region template). */
export function getMyInvoiceHtml(req: Request, res: Response): void {
  const customer = currentCustomer(res);
  const html = renderInvoiceHtml(customer.id, req.params.invoiceId as string, isStaffRole(customer.role));
  if (!html) return notFound(res, req.params.invoiceId as string);
  res.status(200).type("text/html").send(html);
}
