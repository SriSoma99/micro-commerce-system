import { useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import type { Order } from "../types/order";
import { formatDateTime, formatMoney } from "../utils/format";

interface OrderPageProps {
  orderId: string;
  token: string;
}

/** Shown right after a successful checkout: the confirmation, and the way to the invoice stored under the login. */
export function OrderPage({ orderId, token }: OrderPageProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void apiRequest<Order>(`/orders/${orderId}`, { token }).then((result) => {
      if (cancelled) return;
      if (result.ok) setOrder(result.data);
      else setFailure(result.status === 404 ? "We couldn't find that order." : result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId, token]);

  if (failure) {
    return (
      <div className="page page--narrow">
        <div className="card">
          <div className="notice notice--error">{failure}</div>
          <a className="btn btn--secondary" href="#/">
            Back to the shop
          </a>
        </div>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="page-state">
        <div className="spinner" />
        <p>Loading your order&hellip;</p>
      </div>
    );
  }

  const paidLater = order.payment.status === "authorized";
  return (
    <div className="page page--narrow">
      <div className="card order">
        <div className="order__badge" aria-hidden="true">
          ✓
        </div>
        <h1 className="page__title">Thank you for your order!</h1>
        <p>
          Order <strong>{order.orderId.slice(0, 8)}</strong> · {formatDateTime(order.placedAt)}
        </p>
        <p>Pickup at {order.storeName}</p>

        <ul className="summary__lines">
          {order.items.map((line) => (
            <li key={line.lineNo}>
              <span>
                {line.name}
                <small>{line.soldBy === "weight" ? `${line.quantity} lb` : `${line.quantity} ×`} {formatMoney(line.unitPriceMinor, order.currency)}</small>
              </span>
              <span>{formatMoney(line.netMinor, order.currency)}</span>
            </li>
          ))}
        </ul>

        <dl className="summary__totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatMoney(order.subtotalMinor, order.currency)}</dd>
          </div>
          <div>
            <dt>Sales tax ({order.taxJurisdiction})</dt>
            <dd>{formatMoney(order.taxMinor, order.currency)}</dd>
          </div>
          <div className="summary__grand">
            <dt>Total</dt>
            <dd>{formatMoney(order.totalMinor, order.currency)}</dd>
          </div>
        </dl>

        <div className={`notice ${paidLater ? "notice--warning" : "notice--success"}`}>
          {paidLater ? "Pay when you pick up your order at the store." : order.payment.card ? `Paid with ${order.payment.card.brand.toUpperCase()} ····${order.payment.card.last4}.` : "Paid."}
        </div>

        <div className="order__actions">
          {order.invoice && (
            <a className="btn btn--primary btn--lg" href={`#/invoices/${order.invoice.id}`}>
              View invoice {order.invoice.number}
            </a>
          )}
          <a className="btn btn--secondary btn--lg" href="#/">
            Continue shopping
          </a>
        </div>
      </div>
    </div>
  );
}
