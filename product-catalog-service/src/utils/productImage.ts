import { ProductImageSpec } from "../data/productRepository";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Renders a product tile as SVG: an emoji on the department's soft gradient,
 * with the brand underneath. Generated (not stored) so the demo has consistent,
 * offline-safe product imagery; real photos later just change the `thumbnail`
 * URL, nothing else.
 */
export function renderProductImage(spec: ProductImageSpec): string {
  const [light, dark] = spec.colors;
  const brand = escapeXml(spec.brand.toUpperCase());

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img" aria-label="${escapeXml(spec.name)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${light}"/>
      <stop offset="1" stop-color="${dark}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <circle cx="300" cy="270" r="185" fill="#ffffff" fill-opacity="0.55"/>
  <text x="300" y="285" font-size="230" text-anchor="middle" dominant-baseline="central"
        font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${spec.emoji}</text>
  <text x="300" y="540" font-size="28" font-weight="700" text-anchor="middle" letter-spacing="3"
        fill="#1f2a37" fill-opacity="0.72" font-family="system-ui, Segoe UI, Helvetica, Arial, sans-serif">${brand}</text>
</svg>`;
}
