import { useEffect, useState, type FormEvent } from "react";
import { confirmPayment, getQuote, isChallenge, placeOrder } from "../api/checkout";
import { declineMessage, fetchTestCards, tokenizeCard, type TestCard } from "../api/payment";
import type { Cart } from "../types/cart";
import type { Order, Quote } from "../types/order";
import type { PublicStoreConfig } from "../types/store";
import { brandOf, formatCardNumber, formatExpiry, parseExpiry, validateCard, type CardErrors } from "../utils/card";
import { formatMoney } from "../utils/format";
import { ThreeDSecureDialog } from "./ThreeDSecureDialog";

interface CheckoutPageProps {
  token: string;
  cart: Cart | null;
  config: PublicStoreConfig;
  storeId: string | null;
  onSelectStore: (storeId: string) => void;
  onPlaced: (order: Order) => void;
}

const BRAND_LABEL: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", ebt: "EBT", card: "" };

export function CheckoutPage({ token, cart, config, storeId, onSelectStore: _onSelectStore, onPlaced }: CheckoutPageProps) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [methodId, setMethodId] = useState(config.paymentMethods[0]?.id ?? "");
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "" });
  const [cardErrors, setCardErrors] = useState<CardErrors>({});
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [challenge, setChallenge] = useState<{ order: Order; confirming: boolean } | null>(null);
  const [testCards, setTestCards] = useState<TestCard[]>([]);

  const method = config.paymentMethods.find((candidate) => candidate.id === methodId) ?? null;
  const clientConfig = method?.clientConfig;
  const store = config.stores.find((candidate) => candidate.id === storeId) ?? config.stores[0] ?? null;
  const hasItems = (cart?.items.length ?? 0) > 0;

  // Price the cart at the chosen store whenever it (or the store) changes: tax depends on the store's state.
  const cartVersion = cart?.updatedAt;
  useEffect(() => {
    if (!hasItems || !store || !cart) return;
    const controller = new AbortController();
    void getQuote(token, cart.cartId, store.id, controller.signal)
      .then((result) => {
        if (result.ok) {
          setQuote(result.data);
          setQuoteError(null);
        } else {
          setQuoteError(result.message);
        }
      })
      .catch(() => {
        // Superseded by a newer quote request.
      });
    return () => controller.abort();
  }, [token, cart, cartVersion, hasItems, store]);

  // The demo's test-card helper, loaded from the gateway itself.
  const testCardsUrl = clientConfig?.testCardsUrl;
  const tokenMethod = clientConfig?.tokenMethod;
  useEffect(() => {
    if (!testCardsUrl || !tokenMethod) return;
    let cancelled = false;
    void fetchTestCards(testCardsUrl, tokenMethod).then((cards) => {
      if (!cancelled) setTestCards(cards);
    });
    return () => {
      cancelled = true;
    };
  }, [testCardsUrl, tokenMethod]);

  function changeMethod(id: string) {
    setMethodId(id);
    setPayError(null);
    setCardErrors({});
    setTestCards([]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!method || !store || !cart) return;
    setPayError(null);

    let paymentToken: string | undefined;
    if (clientConfig) {
      const errors = validateCard(card);
      setCardErrors(errors);
      if (Object.keys(errors).length > 0) return;

      setPaying(true);
      const expiry = parseExpiry(card.expiry) as { month: number; year: number };
      // Card details go straight to the payment gateway; only the returned token reaches the shop.
      const tokenized = await tokenizeCard(clientConfig, { number: card.number, month: expiry.month, year: expiry.year, cvc: card.cvc });
      if (!tokenized.ok) {
        setPaying(false);
        setPayError(tokenized.message);
        return;
      }
      paymentToken = tokenized.token;
    } else {
      setPaying(true);
    }

    const idempotencyKey = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `key_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const result = await placeOrder(token, {
      cartId: cart.cartId,
      storeId: store.id,
      paymentMethod: method.id,
      paymentToken,
      idempotencyKey,
    });
    setPaying(false);

    if (!result.ok) {
      if (result.code === "PAYMENT_DECLINED") setPayError(declineMessage(result.declineCode));
      else if (result.code === "OUT_OF_STOCK") setPayError(result.message || "An item in your cart is out of stock at this store. Please select another store or update quantities.");
      else if (result.code === "PAYMENT_GATEWAY_UNAVAILABLE") setPayError(result.message);
      else setPayError(result.message);
      return;
    }
    if (isChallenge(result.data)) setChallenge({ order: result.data.order, confirming: false });
    else onPlaced(result.data);
  }

  async function answerChallenge(approved: boolean) {
    if (!challenge) return;
    setChallenge({ ...challenge, confirming: true });
    const result = await confirmPayment(token, challenge.order.orderId, approved);
    setChallenge(null);

    if (result.ok) onPlaced(result.data);
    else setPayError(result.code === "PAYMENT_DECLINED" ? declineMessage(result.declineCode) : result.message);
  }

  if (!hasItems) {
    return (
      <div className="page page--narrow">
        <div className="card page-state">
          <div className="empty-cart" aria-hidden="true">
            🛒
          </div>
          <h1>Your cart is empty</h1>
          <p>Add something to your cart before checking out.</p>
          <a className="btn btn--primary" href="#/">
            Back to the shop
          </a>
        </div>
      </div>
    );
  }

  const cardBrand = BRAND_LABEL[brandOf(card.number)];

  return (
    <div className="page checkout">
      <h1 className="page__title">Checkout</h1>
      <p className="page__subtitle">Review your order and pay securely.</p>

      <div className="checkout__grid">
        <form className="card form checkout__pay" onSubmit={submit} noValidate>
          <section className="field">
            <h2>1. Pickup location</h2>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                background: "#f8fafc",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>
                  🏬 {store?.name}
                </div>
                <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "2px" }}>
                  Store #{store?.id} · State Jurisdiction: <strong>{store?.taxJurisdiction}</strong>
                </div>
              </div>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: "4px",
                  background: "#e0f2fe",
                  color: "#0369a1",
                }}
              >
                Locked for Order
              </span>
            </div>
            <span className="field__hint">Orders are picked and fulfilled directly from this store's local inventory.</span>
          </section>

          <section className="field">
            <h2>2. Payment</h2>
            <div className="methods" role="radiogroup" aria-label="Payment method">
              {config.paymentMethods.map((candidate) => (
                <label key={candidate.id} className={`method${candidate.id === methodId ? " is-selected" : ""}`}>
                  <input type="radio" name="payment-method" value={candidate.id} checked={candidate.id === methodId} onChange={() => changeMethod(candidate.id)} />
                  <span>{candidate.displayName}</span>
                  {candidate.kind === "offline" && <span className="field__hint">Pay at the counter</span>}
                </label>
              ))}
            </div>

            {method?.simulated && (
              <div className="notice notice--warning" role="note">
                <strong>Simulated payment.</strong> No real money is charged. Card details go to a local dummy payment server.
              </div>
            )}

            {clientConfig && (
              <div className="card-form">
                <div className="field">
                  <label className="field__label" htmlFor="card-number">
                    Card number {cardBrand && <span className="brand-tag">{cardBrand}</span>}
                  </label>
                  <input id="card-number" className="input" inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456" value={card.number} onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value) })} aria-invalid={cardErrors.number ? true : undefined} />
                  {cardErrors.number && <span className="field__error">{cardErrors.number}</span>}
                </div>
                <div className="form-row">
                  <div className="field">
                    <label className="field__label" htmlFor="card-expiry">
                      Expiry (MM/YY)
                    </label>
                    <input id="card-expiry" className="input" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })} aria-invalid={cardErrors.expiry ? true : undefined} />
                    {cardErrors.expiry && <span className="field__error">{cardErrors.expiry}</span>}
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="card-cvc">
                      Security code
                    </label>
                    <input id="card-cvc" className="input" inputMode="numeric" autoComplete="cc-csc" placeholder="123" maxLength={4} value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "") })} aria-invalid={cardErrors.cvc ? true : undefined} />
                    {cardErrors.cvc && <span className="field__error">{cardErrors.cvc}</span>}
                  </div>
                </div>

                {testCards.length > 0 && (
                  <details className="test-cards">
                    <summary>Demo: test card numbers</summary>
                    <ul>
                      {testCards.map((testCard) => (
                        <li key={testCard.number}>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              const nextYear = String((new Date().getFullYear() + 2) % 100).padStart(2, "0");
                              setCard({ number: formatCardNumber(testCard.number), expiry: `12/${nextYear}`, cvc: "123" });
                              setCardErrors({});
                            }}
                            aria-label={`Use test card ${testCard.number}`}
                          >
                            <code>{testCard.number}</code>
                          </button>{" "}
                          <span>{testCard.outcome}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </section>

          {payError && (
            <div className="notice notice--error" role="alert">
              {payError}
            </div>
          )}

          <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={paying || !quote}>
            {paying ? "Processing payment…" : quote ? `${method?.kind === "offline" ? "Place order" : "Pay"} ${formatMoney(quote.totalMinor, quote.currency)}` : "Calculating…"}
          </button>
        </form>

        <aside className="card checkout__summary" aria-label="Order summary">
          <h2>Order summary</h2>
          {quoteError && (
            <div className="notice notice--error" role="alert">
              {quoteError}
            </div>
          )}
          <ul className="summary__lines">
            {(quote?.items ?? []).map((line) => (
              <li key={line.lineNo}>
                <span>
                  {line.name}
                  <small>
                    {line.soldBy === "weight" ? `${line.quantity} lb` : `${line.quantity} ×`} {formatMoney(line.unitPriceMinor, quote?.currency)}
                    {line.taxRateBps > 0 ? "" : " · no tax"}
                  </small>
                </span>
                <span>{formatMoney(line.netMinor, quote?.currency)}</span>
              </li>
            ))}
          </ul>
          {quote && (
            <dl className="summary__totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatMoney(quote.subtotalMinor, quote.currency)}</dd>
              </div>
              <div>
                <dt>Sales tax ({quote.jurisdiction})</dt>
                <dd>{formatMoney(quote.taxMinor, quote.currency)}</dd>
              </div>
              <div className="summary__grand">
                <dt>Total</dt>
                <dd>{formatMoney(quote.totalMinor, quote.currency)}</dd>
              </div>
            </dl>
          )}
        </aside>
      </div>

      {challenge && <ThreeDSecureDialog busy={challenge.confirming} onApprove={() => void answerChallenge(true)} onDecline={() => void answerChallenge(false)} />}
    </div>
  );
}
