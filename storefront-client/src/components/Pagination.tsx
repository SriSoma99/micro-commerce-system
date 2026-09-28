import { pageWindow } from "../utils/pagination";

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}

export function Pagination({ page, total, pageSize, onPage }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
        ‹ Previous
      </button>
      <ul className="pagination__pages">
        {pageWindow(page, pages).map((p, index) =>
          p === null ? (
            <li key={`gap-${index}`} className="pagination__gap" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              <button type="button" className={`pagination__page${p === page ? " is-current" : ""}`} onClick={() => onPage(p)} aria-current={p === page ? "page" : undefined} aria-label={`Page ${p}`}>
                {p}
              </button>
            </li>
          )
        )}
      </ul>
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => onPage(page + 1)} disabled={page >= pages}>
        Next ›
      </button>
    </nav>
  );
}
