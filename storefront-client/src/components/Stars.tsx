interface StarsProps {
  rating: number;
  reviewCount?: number;
}

/** Five stars, partially filled to the rating; readable by screen readers as text. */
export function Stars({ rating, reviewCount }: StarsProps) {
  const percent = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <span className="stars" role="img" aria-label={`${rating.toFixed(1)} out of 5 stars${reviewCount !== undefined ? `, ${reviewCount} reviews` : ""}`}>
      <span className="stars__track" aria-hidden="true">
        ★★★★★
        <span className="stars__fill" style={{ width: `${percent}%` }}>
          ★★★★★
        </span>
      </span>
      {reviewCount !== undefined && <span className="stars__count">({reviewCount.toLocaleString()})</span>}
    </span>
  );
}
