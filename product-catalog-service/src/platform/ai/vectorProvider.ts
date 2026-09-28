import { getDb } from "../../db/database";
import { queryStorePolicies, type PolicyDocument } from "./policyRAG";

export interface VectorSearchResult<T = unknown> {
  id: string;
  score: number; // 0.0 - 1.0 (higher is more similar)
  payload: T;
  matchedText: string;
}

export interface VectorSearchProvider {
  readonly id: string;
  readonly isCloud: boolean;
  searchProducts(query: string, options?: { storeId?: string; limit?: number; dietary?: string[] }): Promise<VectorSearchResult<{ id: string; name: string; brand: string; priceMinor: number; stock: number; snapEligible: boolean; sizeLabel: string }>[]>;
  searchPolicies(query: string, topicFilter?: string): Promise<VectorSearchResult<PolicyDocument>[]>;
}

/**
 * Default local desktop vector provider: utilizes SQLite FTS5 (BM25 + Porter stemming)
 * combined with structured JSON tag filters for ultra-fast, offline hybrid semantic retrieval.
 */
export class SqliteFtsVectorProvider implements VectorSearchProvider {
  readonly id = "sqlite-fts5-hybrid";
  readonly isCloud = false;

  async searchProducts(query: string, options: { storeId?: string; limit?: number; dietary?: string[] } = {}) {
    const db = getDb();
    const limit = options.limit ?? 8;
    const storeId = options.storeId ?? "IL-01";

    const cleanQuery = query.replace(/[^\w\s]/g, " ").trim();
    if (!cleanQuery) return [];

    const ftsQuery = cleanQuery
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => `"${w}"*`)
      .join(" OR ");

    let sql = `
      SELECT p.id, p.name, p.brand, p.price_minor, p.size_label, p.snap_eligible,
             COALESCE(si.stock, p.stock) as stock,
             bm25(products_fts) as rank_score
      FROM products_fts fts
      JOIN products p ON p.id = fts.id
      LEFT JOIN store_inventory si ON si.product_id = p.id AND si.store_id = ?
      WHERE products_fts MATCH ?
    `;
    const params: (string | number)[] = [storeId, ftsQuery];

    if (options.dietary && options.dietary.length > 0) {
      const placeholders = options.dietary.map(() => "?").join(",");
      sql += ` AND p.id IN (SELECT product_id FROM product_tags WHERE tag IN (${placeholders}))`;
      params.push(...options.dietary);
    }

    sql += ` ORDER BY rank_score ASC LIMIT ?`;
    params.push(limit);

    try {
      const rows = db.prepare(sql).all(...params) as {
        id: string;
        name: string;
        brand: string;
        price_minor: number;
        size_label: string;
        snap_eligible: number;
        stock: number;
        rank_score: number;
      }[];

      return rows.map((r) => ({
        id: r.id,
        // Convert negative BM25 rank score to 0.0 - 1.0 confidence score
        score: Math.max(0.1, Math.min(0.99, Number((1 / (1 + Math.abs(r.rank_score || 1))).toFixed(3)))),
        payload: {
          id: r.id,
          name: r.name,
          brand: r.brand,
          priceMinor: r.price_minor,
          stock: r.stock,
          snapEligible: Boolean(r.snap_eligible),
          sizeLabel: r.size_label
        },
        matchedText: `${r.brand} ${r.name}`
      }));
    } catch {
      return [];
    }
  }

  async searchPolicies(query: string, topicFilter?: string): Promise<VectorSearchResult<PolicyDocument>[]> {
    const docs = queryStorePolicies(query, topicFilter);
    return docs.map((doc, idx) => ({
      id: doc.id,
      score: Number((0.95 - idx * 0.05).toFixed(2)),
      payload: doc,
      matchedText: `${doc.title} - ${doc.summary}`
    }));
  }
}
