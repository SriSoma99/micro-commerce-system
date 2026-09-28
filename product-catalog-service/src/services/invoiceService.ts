import * as invoiceRepository from "../data/invoiceRepository";
import { getPlatform } from "../platform/platform";
import { ReceiptData } from "../platform/types";
import { InvoiceSummary } from "../types/order";

export const listInvoices = (customerId: string, isStaff = false): InvoiceSummary[] => invoiceRepository.listInvoices(customerId, isStaff);

export const getInvoice = (customerId: string, invoiceId: string, isStaff = false): { summary: InvoiceSummary; receipt: ReceiptData } | undefined => {
  const found = invoiceRepository.findInvoice(customerId, invoiceId, isStaff);
  return found ? { summary: found.summary, receipt: found.snapshot } : undefined;
};

/** Renders a stored invoice snapshot with the installed region's receipt template. */
export function renderInvoiceHtml(customerId: string, invoiceId: string, isStaff = false): string | undefined {
  const found = invoiceRepository.findInvoice(customerId, invoiceId, isStaff);
  const template = getPlatform()?.receipt;
  return found && template ? template.render(found.snapshot) : undefined;
}
