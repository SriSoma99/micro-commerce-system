import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/client";
import type { ProductDetail } from "../types/product";
import { assetUrl, formatMoney, formatUnitPrice, titleCase } from "../utils/format";
import { Stars } from "./Stars";
import type { SystemStatus } from "./StatusBadge";

export interface ProductDetailModalProps {
  productId: string;
  storeId?: string | null;
  onClose: () => void;
  onStatusChange: (status: SystemStatus) => void;
  /** Resolves to null on success, or a message to show. */
  onAdd: (productId: string, quantity: number, selectedConfiguration?: Record<string, string>) => Promise<string | null>;
  onAdded: (name: string) => void;
}

/** Fetches the full detail itself (list views only carry the light Master fields) and reports its own resilience status upward. */
export function ProductDetailModal({ productId, storeId, onClose, onStatusChange, onAdd, onAdded }: ProductDetailModalProps) {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    const url = `/products/${productId}${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ""}`;
    void apiRequest<ProductDetail>(url).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setProduct(result.data);
        setIsFallback(result.isFallback);
        onStatusChange({ source: result.source, retrievedAt: result.retrievedAt });
      } else {
        setFailure(result.status === 404 ? "This product is no longer available." : result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [productId, storeId, onStatusChange]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stock = product?.storeStock !== undefined ? product.storeStock : (product?.stock ?? 0);
  const maxQuantity = Math.max(1, Math.min(stock, 20));
  const isWeight = product?.soldBy === "weight";

  async function add() {
    if (!product) return;
    setBusy(true);
    setAddError(null);
    const message = await onAdd(product.id, quantity, Object.keys(chosen).length > 0 ? chosen : undefined);
    setBusy(false);
    if (message) setAddError(message);
    else {
      onAdded(product.name);
      onClose();
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={product?.name ?? "Product details"} onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} type="button" className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {!product && !failure && (
          <div className="page-state">
            <div className="spinner" />
            <p>Loading product&hellip;</p>
          </div>
        )}

        {failure && <div className="notice notice--error">{failure}</div>}

        {product && (
          <div className="detail">
            <div className="detail__media">
              <img src={assetUrl(product.gallery[0] ?? product.thumbnail)} alt={product.name} />
            </div>

            <div className="detail__body">
              {isFallback && <div className="notice notice--warning">Showing saved product information while live details are unavailable. Stock may have changed.</div>}

              <p className="detail__brand">{product.brand}</p>
              <h2>{product.name}</h2>
              <Stars rating={product.rating.average} reviewCount={product.rating.reviewCount} />

              <div className="detail__price">
                <span className="price price--lg">
                  {formatMoney(product.priceMinor, product.currency)}
                  {isWeight && <span className="price__per"> / lb</span>}
                </span>
                {!isWeight && <span className="unit-price">{formatUnitPrice(product.unitPrice, product.currency)}</span>}
              </div>

              <div className="product-card__tags">
                {product.snapEligible && <span className="tag tag--snap">SNAP eligible</span>}
                {product.dietaryTags.map((tag) => (
                  <span key={tag} className="tag">
                    {titleCase(tag)}
                  </span>
                ))}
                {product.isWeeklyFind && <span className="badge badge--find">Weekly find</span>}
              </div>

              <p className="detail__description">{product.description}</p>

              <p className={`stock ${stock === 0 ? "stock--out" : stock <= 8 ? "stock--low" : "stock--ok"}`}>{stock === 0 ? "Out of stock" : stock <= 8 ? `Only ${stock} left` : "In stock"}</p>

              {product.configurationOptions.map((option) => (
                <div className="field" key={option.name}>
                  <label className="field__label" htmlFor={`opt-${option.name}`}>
                    {option.name}
                  </label>
                  <select id={`opt-${option.name}`} className="input" value={chosen[option.name] ?? option.defaultChoice} onChange={(e) => setChosen((current) => ({ ...current, [option.name]: e.target.value }))}>
                    {option.choices.map((choice) => (
                      <option key={choice} value={choice}>
                        {choice}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              <div className="detail__buy">
                <div className="stepper" role="group" aria-label={isWeight ? "Pounds" : "Quantity"}>
                  <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="Decrease quantity">
                    −
                  </button>
                  <span aria-live="polite">
                    {quantity}
                    {isWeight ? " lb" : ""}
                  </span>
                  <button type="button" onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))} disabled={quantity >= maxQuantity || stock === 0} aria-label="Increase quantity">
                    +
                  </button>
                </div>
                <button type="button" className="btn btn--primary btn--lg" onClick={add} disabled={busy || stock === 0}>
                  {busy ? "Adding…" : `Add to cart · ${formatMoney(product.priceMinor * quantity, product.currency)}`}
                </button>
              </div>
              {addError && (
                <div className="notice notice--error" role="alert">
                  {addError}
                </div>
              )}

              <h3 className="detail__specs-title">Product details</h3>
              <dl className="specs">
                {product.specifications.map((spec) => (
                  <div key={spec.label}>
                    <dt>{spec.label}</dt>
                    <dd>{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
