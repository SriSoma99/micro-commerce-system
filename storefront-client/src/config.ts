export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5001/api";

/** The API's origin, for assets the API serves (product images) that are addressed by path. */
export const API_ORIGIN: string = new URL(API_BASE_URL, window.location.href).origin;

/** Store brand shown in the header. Deliberately generic: the customer's own brand goes here. */
export const STORE_BRAND = "Fresh Basket";
