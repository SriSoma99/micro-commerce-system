import { useEffect, useRef } from "react";
import type { Cart } from "../types/cart";
import { assetUrl, formatMoney } from "../utils/format";

interface CartDrawerProps {
  isOpen: boolean;
  cart: Cart | null;
  /** Latest cart error (e.g. "Only 3 available"), shown inline. */
  error: string | null;
  onClose: () => void;
  onUpdateQuantity: (lineItemId: string, quantity: number) => Promise<string | null>;
  onRemoveItem: (lineItemId: string) => Promise<string | null>;
  onCheckout: () => void;
}

export function CartDrawer({ isOpen, cart, error, onClose, onUpdateQuantity, onRemoveItem, onCheckout }: CartDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const items = cart?.items ?? [];
  const currency = cart?.currency ?? "USD";

  return (
    <div className="overlay overlay--drawer" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Shopping cart" onClick={(e) => e.stopPropagation()}>
        <header className="drawer__head">
          <h2>Your cart {cart && cart.itemCount > 0 && <span className="drawer__count">({cart.itemCount})</span>}</h2>
          <button ref={closeRef} type="button" className="modal__close modal__close--inline" onClick={onClose} aria-label="Close cart">
            ×
          </button>
        </header>

        {items.length === 0 ? (
          <div className="page-state">
            <div className="empty-cart" aria-hidden="true">
              🛒
            </div>
            <h3>Your cart is empty</h3>
            <p>Add a few things you love and they'll show up here.</p>
            <button type="button" className="btn btn--primary" onClick={onClose}>
              Start shopping
            </button>
          </div>
        ) : (
          <>
            <ul className="drawer__items">
              {items.map((item) => {
                const isWeight = item.soldBy === "weight";
                const options = Object.entries(item.selectedConfiguration ?? {});
                return (
                  <li key={item.lineItemId} className="cart-line">
                    <img src={assetUrl(item.thumbnail)} alt="" width={64} height={64} />
                    <div className="cart-line__body">
                      <p className="cart-line__name">{item.name}</p>
                      <p className="cart-line__meta">
                        {item.sizeLabel}
                        {options.length > 0 && ` · ${options.map(([key, value]) => `${key}: ${value}`).join(", ")}`}
                      </p>
                      <p className="cart-line__meta">
                        {formatMoney(item.priceMinor, item.currency)}
                        {isWeight ? " / lb" : " each"}
                      </p>
                      <div className="cart-line__controls">
                        <div className="stepper stepper--sm" role="group" aria-label={`Quantity of ${item.name}`}>
                          <button type="button" onClick={() => void onUpdateQuantity(item.lineItemId, item.quantity - 1)} disabled={item.quantity <= 1} aria-label={`Decrease quantity of ${item.name}`}>
                            −
                          </button>
                          <span aria-live="polite">
                            {item.quantity}
                            {isWeight ? " lb" : ""}
                          </span>
                          <button type="button" onClick={() => void onUpdateQuantity(item.lineItemId, item.quantity + 1)} aria-label={`Increase quantity of ${item.name}`}>
                            +
                          </button>
                        </div>
                        <button type="button" className="link-button" onClick={() => void onRemoveItem(item.lineItemId)} aria-label={`Remove ${item.name}`}>
                          Remove
                        </button>
                      </div>
                    </div>
                    <p className="cart-line__total">{formatMoney(item.priceMinor * item.quantity, item.currency)}</p>
                  </li>
                );
              })}
            </ul>

            <footer className="drawer__foot">
              {error && (
                <div className="notice notice--error" role="alert">
                  {error}
                </div>
              )}
              <div className="drawer__row">
                <span>Subtotal</span>
                <strong>{formatMoney(cart?.subtotalMinor ?? 0, currency)}</strong>
              </div>
              <p className="drawer__note">Sales tax is calculated for your pickup store at checkout.</p>
              <button type="button" className="btn btn--primary btn--lg btn--block" onClick={onCheckout}>
                Checkout
              </button>
              <button type="button" className="btn btn--ghost btn--block" onClick={onClose}>
                Continue shopping
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
