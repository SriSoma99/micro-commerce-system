interface CartButtonProps {
  itemCount: number;
  onClick: () => void;
}

export function CartButton({ itemCount, onClick }: CartButtonProps) {
  return (
    <button type="button" className="cart-button" onClick={onClick} aria-label={`Open cart, ${itemCount} ${itemCount === 1 ? "item" : "items"}`}>
      <span aria-hidden="true">🛒</span>
      <span className="cart-button__count" aria-hidden="true">
        {itemCount}
      </span>
    </button>
  );
}
