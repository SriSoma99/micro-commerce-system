/**
 * Page numbers to show around the current page: always the first and last,
 * a window around the current one, and `null` for each "..." gap.
 * pageWindow(5, 20) -> [1, null, 4, 5, 6, null, 20]
 */
export function pageWindow(page: number, pages: number, radius = 1): (number | null)[] {
  if (pages <= 1) return pages === 1 ? [1] : [];
  const wanted = new Set<number>([1, pages]);
  for (let p = page - radius; p <= page + radius; p++) if (p >= 1 && p <= pages) wanted.add(p);

  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    const previous = sorted[i - 1];
    if (previous !== undefined && p - previous === 2) out.push(previous + 1); // a single-page gap: show the number, not "..."
    else if (previous !== undefined && p - previous > 2) out.push(null);
    out.push(p);
  });
  return out;
}
