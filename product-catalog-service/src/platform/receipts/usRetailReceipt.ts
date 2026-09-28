import { formatMoney } from "../money";
import { ReceiptData, ReceiptTemplate } from "../types";

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const percent = (bps: number): string => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

const STATUS_LABEL: Record<string, string> = {
  captured: "PAID",
  authorized: "PAY AT PICKUP",
  refunded: "REFUNDED",
  declined: "DECLINED",
  requires_action: "PENDING",
};

function generateBarcodeSvg(code: string): string {
  // Deterministic Code-128 style visual barcode
  let seed = 0;
  for (let i = 0; i < code.length; i++) {
    seed = (seed * 31 + code.charCodeAt(i)) >>> 0;
  }
  const barWidths = [1, 2, 3, 1, 2, 1, 3, 2, 1, 1, 2, 3, 2, 1, 2, 1, 3, 1, 2, 2, 1, 3, 1, 2, 1, 1, 3, 2, 2, 1, 1, 3, 2, 1, 2, 1, 3, 2];
  let x = 12;
  const rects: string[] = [];
  for (let i = 0; i < barWidths.length; i++) {
    const w = barWidths[i]!;
    if (i % 2 === 0) {
      rects.push(`<rect x="${x}" y="0" width="${w * 2}" height="42" fill="#111827"/>`);
    }
    x += w * 2;
  }
  return `<svg width="${x + 12}" height="42" viewBox="0 0 ${x + 12} 42" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto">${rects.join("")}</svg>`;
}

/**
 * US retail receipt: store header, itemised lines with a T/F tax flag, subtotal,
 * tax by rate, total, payment, return barcode, and the return policy. Self-contained HTML (inline
 * CSS, no scripts) so it prints cleanly and can be shown in an iframe or saved.
 * Simulated payments get an unmissable banner.
 */
export const usRetailReceipt: ReceiptTemplate = {
  id: "us-retail",
  displayName: "US retail receipt",

  render(data: ReceiptData): string {
    const money = (minor: number): string => formatMoney({ amountMinor: minor, currency: data.currency }, data.locale);
    const issued = new Date(data.issuedAt).toLocaleString(data.locale, { dateStyle: "medium", timeStyle: "short" });

    const lines = data.lines
      .map((line) => {
        const qty = line.soldBy === "weight" ? `${line.quantity} lb` : `${line.quantity}`;
        const config = Object.entries(line.configuration)
          .map(([key, value]) => `${escapeHtml(key)}: ${escapeHtml(value)}`)
          .join(", ");
        return `<tr>
          <td class="item">${escapeHtml(line.name)}<small>${escapeHtml(line.sizeLabel)}${config ? ` · ${config}` : ""}<br>${qty} × ${money(line.unitPriceMinor)}</small></td>
          <td class="amt">${money(line.netMinor)}</td>
          <td class="flag" title="${line.taxRateBps > 0 ? "Taxable" : "Not taxed"}">${line.taxRateBps > 0 ? "T" : "F"}</td>
        </tr>`;
      })
      .join("");

    const taxRows = data.taxSummary
      .map(
        (row) =>
          `<tr><td>${data.store.jurisdiction} tax ${percent(row.rateBps)} on ${money(row.netMinor)}</td><td class="amt">${money(row.taxMinor)}</td></tr>`
      )
      .join("");

    const { payment } = data;
    const paymentLine = payment.card
      ? `${escapeHtml(payment.card.brand.toUpperCase())} ····${escapeHtml(payment.card.last4)}`
      : escapeHtml(payment.methodName);

    const barcodeSvg = generateBarcodeSvg(data.invoiceNumber);

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice ${escapeHtml(data.invoiceNumber)}</title>
<style>
  @page{margin:8mm}
  body{margin:0;background:#f3f4f6;font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#111827}
  .receipt{max-width:420px;margin:24px auto;background:#fff;padding:24px 22px;box-shadow:0 1px 6px rgba(0,0,0,.12)}
  h1{font-size:18px;margin:0;text-align:center;letter-spacing:.04em}
  .center{text-align:center}.muted{color:#6b7280}
  hr{border:0;border-top:1px dashed #9ca3af;margin:14px 0}
  table{width:100%;border-collapse:collapse}
  td{vertical-align:top;padding:3px 0}
  .item small{display:block;color:#6b7280;font-size:12px}
  .amt{text-align:right;white-space:nowrap;padding-left:10px}
  .flag{width:16px;text-align:right;color:#6b7280}
  .total td{font-weight:700;font-size:16px;padding-top:6px}
  .sim{background:#fef3c7;border:2px solid #d97706;color:#92400e;font-weight:700;text-align:center;padding:8px;margin:0 0 14px}
  .badge{display:inline-block;border:1px solid #111827;padding:0 6px;font-weight:700}
  .barcode-box{text-align:center;margin:14px 0 6px;padding:6px 0}
  .barcode-num{font-size:11px;letter-spacing:0.18em;margin-top:4px;color:#374151}
  @media print{
    body{background:#fff;padding:0}
    .receipt{box-shadow:none;margin:0 auto;max-width:100%;padding:0}
  }
</style></head><body><div class="receipt">
${payment.simulated ? '<div class="sim">SIMULATED PAYMENT — NO REAL CHARGE WAS MADE</div>' : ""}
<h1>${escapeHtml(data.store.name.toUpperCase())}</h1>
<div class="center muted">Store #${escapeHtml(data.store.id)} · ${escapeHtml(data.store.jurisdiction)}</div>
<hr>
<table>
  <tr><td>Invoice</td><td class="amt"><b>${escapeHtml(data.invoiceNumber)}</b></td></tr>
  <tr><td>Date</td><td class="amt">${escapeHtml(issued)}</td></tr>
  <tr><td>Order</td><td class="amt">${escapeHtml(data.orderId.slice(0, 8))}</td></tr>
  <tr><td>Customer</td><td class="amt">${escapeHtml(data.customer.name)}</td></tr>
  <tr><td></td><td class="amt muted">${escapeHtml(data.customer.email)}</td></tr>
</table>
<hr>
<table>${lines}</table>
<hr>
<table>
  <tr><td>Subtotal</td><td class="amt">${money(data.totals.subtotalMinor)}</td></tr>
  ${taxRows}
  <tr><td>Total tax</td><td class="amt">${money(data.totals.taxMinor)}</td></tr>
  <tr class="total"><td>TOTAL</td><td class="amt">${money(data.totals.totalMinor)}</td></tr>
</table>
<hr>
<table>
  <tr><td>Payment</td><td class="amt">${paymentLine}</td></tr>
  <tr><td>Status</td><td class="amt"><span class="badge">${escapeHtml(STATUS_LABEL[payment.status] ?? payment.status.toUpperCase())}</span></td></tr>
  <tr><td>Transaction</td><td class="amt muted">${escapeHtml(payment.reference.slice(-12))}</td></tr>
</table>
<hr>
<div class="barcode-box">
  ${barcodeSvg}
  <div class="barcode-num">* ${escapeHtml(data.invoiceNumber)} *</div>
</div>
<p class="center muted">T = taxable item · F = not taxed<br>Returns accepted within 30 days with this receipt barcode.<br>Thank you for shopping with us!</p>
</div></body></html>`;
  },
};
