import request from "supertest";

/** Just the parts of a ProductDetail these helpers and tests look at. */
export interface DetailLike {
  id: string;
  name: string;
  priceMinor: number;
  stock: number;
  taxCode: string;
  sizeLabel: string;
  soldBy: string;
  configurationOptions: { name: string; choices: string[]; defaultChoice: string }[];
}

/**
 * Finds a product by *behaviour* rather than a hardcoded id, so tuning the
 * seed data never breaks the tests: lists products matching `params`, fetches
 * each one's detail, and returns the first that satisfies `predicate`.
 */
export async function findDetail(
  baseUrl: string,
  params: Record<string, string>,
  predicate: (detail: DetailLike) => boolean
): Promise<DetailLike> {
  const query = new URLSearchParams({ pageSize: "60", ...params }).toString();
  const list = await request(baseUrl).get(`/api/products?${query}`);
  for (const item of list.body.data.items as { id: string }[]) {
    const detail = (await request(baseUrl).get(`/api/products/${item.id}`)).body.data as DetailLike;
    if (predicate(detail)) return detail;
  }
  throw new Error(`No product matched ${query}`);
}
