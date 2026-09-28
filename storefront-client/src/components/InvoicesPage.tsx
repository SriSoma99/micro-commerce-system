import { useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import type { InvoiceSummary } from "../types/order";
import { formatDateTime, formatMoney } from "../utils/format";

interface InvoicesPageProps {
  token: string;
}

/** "My invoices": every invoice stored under this login, newest first. */
export function InvoicesPage({ token }: InvoicesPageProps) {
  const [invoices, setInvoices] = useState<InvoiceSummary[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<InvoiceSummary[]>("/customers/me/invoices", { token }).then((result) => {
      if (cancelled) return;
      if (result.ok) setInvoices(result.data);
      else setFailure(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="page page--medium">
      <h1 className="page__title">My invoices</h1>
      <p className="page__subtitle">Every purchase you've made, kept safe under your account.</p>

      {failure && <div className="notice notice--error">{failure}</div>}
      {!invoices && !failure && (
        <div className="page-state">
          <div className="spinner" />
        </div>
      )}

      {invoices && invoices.length === 0 && (
        <div className="card page-state">
          <h2>No invoices yet</h2>
          <p>When you place an order, its invoice will appear here.</p>
          <a className="btn btn--primary" href="#/">
            Start shopping
          </a>
        </div>
      )}

      {invoices && invoices.length > 0 && (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Store</th>
                <th className="num">Total</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <strong>{invoice.number}</strong>
                  </td>
                  <td>{formatDateTime(invoice.issuedAt)}</td>
                  <td>{invoice.storeName}</td>
                  <td className="num">{formatMoney(invoice.totalMinor, invoice.currency)}</td>
                  <td>
                    <a className="btn btn--secondary btn--sm" href={`#/invoices/${invoice.id}`} aria-label={`View invoice ${invoice.number}`}>
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
