import type { ProductMaster } from "../types/product";
import { assetUrl, formatMoney, formatUnitPrice } from "../utils/format";
import { Stars } from "./Stars";

interface ProductCardProps {
  product: ProductMaster;
  onOpen: (productId: string) => void;
  onAdd: (product: ProductMaster) => void;
}

/** One product in the grid. Typed to `ProductMaster` only: list views never see Detail-only fields. */
export function ProductCard({ product, onOpen, onAdd }: ProductCardProps) {
  const isWeight = product.soldBy === "weight";
  const visibleTags = product.dietaryTags.filter((tag) => tag === "organic" || tag === "vegan" || tag === "gluten-free").slice(0, 2);
  const isOutOfStock = product.storeStock !== undefined ? product.storeStock <= 0 : false;
  const isLowStock = product.storeStock !== undefined ? product.storeStock > 0 && product.storeStock <= 10 : false;

  return (
    <article className={`product-card${isOutOfStock ? " is-out-of-stock" : ""}`}>
      <button type="button" className="product-card__open" onClick={() => onOpen(product.id)} aria-label={`View details for ${product.name}`}>
        <div className="product-card__media">
          <img src={assetUrl(product.thumbnail)} alt="" loading="lazy" width={300} height={300} />
          <div className="product-card__badges">
            {product.isWeeklyFind && <span className="badge badge--find">Weekly find</span>}
            {product.isPrivateLabel && <span className="badge badge--brand">Store brand</span>}
            {isOutOfStock && <span className="badge badge--out-of-stock" style={{ background: "#dc2626", color: "#fff" }}>Out of stock</span>}
          </div>
        </div>
        <h3 className="product-card__name">{product.name}</h3>
      </button>

      <div className="product-card__meta">
        <span>{product.sizeLabel}</span>
        <Stars rating={product.rating.average} reviewCount={product.rating.reviewCount} />
      </div>

      <div className="product-card__tags">
        {product.snapEligible && <span className="tag tag--snap">SNAP</span>}
        {visibleTags.map((tag) => (
          <span key={tag} className="tag">
            {tag.replace("-", " ")}
          </span>
        ))}
        {product.storeStock !== undefined && (
          <span
            className="tag"
            style={{
              background: isOutOfStock ? "#fee2e2" : isLowStock ? "#fef3c7" : "#ecfdf5",
              color: isOutOfStock ? "#991b1b" : isLowStock ? "#92400e" : "#065f46",
              fontWeight: 600,
            }}
          >
            {isOutOfStock ? "Out of stock" : isLowStock ? `Only ${product.storeStock} left` : "In stock"}
          </span>
        )}
      </div>

      <div className="product-card__buy">
        <div>
          <div className="price">
            {formatMoney(product.priceMinor, product.currency)}
            {isWeight && <span className="price__per"> / lb</span>}
          </div>
          {!isWeight && <div className="unit-price">{formatUnitPrice(product.unitPrice, product.currency)}</div>}
        </div>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => onAdd(product)}
          disabled={isOutOfStock}
          aria-label={isOutOfStock ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
        >
          {isOutOfStock ? "Out of stock" : isWeight ? "Add 1 lb" : "Add"}
        </button>
      </div>
    </article>
  );
}
