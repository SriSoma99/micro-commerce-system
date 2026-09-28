import { useEffect, useRef, useState } from "react";
import { apiRequest, apiText } from "../api/client";
import type { InvoiceSummary, ReceiptData } from "../types/order";
import { formatDateTime, formatMoney } from "../utils/format";

interface InvoiceViewProps {
  invoiceId: string;
  token: string;
}

interface Loaded {
  summary: InvoiceSummary;
  receipt: ReceiptData;
  html: string;
}

/**
 * One stored invoice. The receipt itself is rendered by the server (region template)
 * and shown in a script-less sandboxed frame, so it looks exactly like what prints.
 */
export function InvoiceView({ invoiceId, token }: InvoiceViewProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([apiRequest<{ summary: InvoiceSummary; receipt: ReceiptData }>(`/customers/me/invoices/${invoiceId}`, { token }), apiText(`/customers/me/invoices/${invoiceId}/html`, token)]).then(([meta, html]) => {
      if (cancelled) return;
      if (!meta.ok) setFailure(meta.status === 404 ? "We couldn't find that invoice." : meta.message);
      else if (html === null) setFailure("We couldn't load the printable invoice.");
      else setLoaded({ summary: meta.data.summary, receipt: meta.data.receipt, html });
    });
    return () => {
      cancelled = true;
    };
  }, [invoiceId, token]);

  function print() {
    try {
      const frame = frameRef.current?.contentWindow;
      if (frame) {
        frame.focus();
        frame.print();
        return;
      }
    } catch {
      // Fallback for sandboxed frames
    }
    if (loaded?.html) {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(loaded.html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 250);
      }
    }
  }

  function download() {
    if (!loaded) return;
    const url = URL.createObjectURL(new Blob([loaded.html], { type: "text/html" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoice-${loaded.summary.number}.html`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (failure) {
    return (
      <div className="page page--narrow">
        <div className="card">
          <div className="notice notice--error">{failure}</div>
          <a className="btn btn--secondary" href="#/invoices">
            Back to my invoices
          </a>
        </div>
      </div>
    );
  }
  if (!loaded) {
    return (
      <div className="page-state">
        <div className="spinner" />
        <p>Loading invoice&hellip;</p>
      </div>
    );
  }

  const { summary, receipt } = loaded;
  return (
    <div className="page page--medium">
      <p>
        <a href="#/invoices">‹ My invoices</a>
      </p>
      <div className="invoice-head">
        <div>
          <h1 className="page__title">Invoice {summary.number}</h1>
          <p>
            {formatDateTime(summary.issuedAt)} · {summary.storeName} · <strong>{formatMoney(summary.totalMinor, summary.currency)}</strong>
          </p>
        </div>
        <div className="invoice-head__actions">
          <button type="button" className="btn btn--primary" onClick={print}>
            Print / Save as PDF
          </button>
          <button type="button" className="btn btn--secondary" onClick={download}>
            Download
          </button>
        </div>
      </div>

      {receipt.payment.simulated && <div className="notice notice--warning">This invoice is for a simulated payment. No real money was charged.</div>}

      <iframe ref={frameRef} className="invoice-frame" title={`Invoice ${summary.number}`} srcDoc={loaded.html} sandbox="allow-same-origin allow-modals" />
    </div>
  );
}
