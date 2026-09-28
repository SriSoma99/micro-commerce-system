import { describe, expect, it } from "vitest";
import { parseRoute, safeNext } from "./route";

describe("parseRoute", () => {
  it("treats an empty hash as the shop", () => {
    expect(parseRoute("")).toEqual({ name: "shop", search: "" });
    expect(parseRoute("#/")).toEqual({ name: "shop", search: "" });
  });

  it("keeps the shop's filter query string", () => {
    expect(parseRoute("#/?q=milk&category=dairy-eggs")).toEqual({ name: "shop", search: "q=milk&category=dairy-eggs" });
  });

  it("parses the fixed screens", () => {
    expect(parseRoute("#/checkout")).toEqual({ name: "checkout" });
    expect(parseRoute("#/invoices")).toEqual({ name: "invoices" });
    expect(parseRoute("#/login")).toEqual({ name: "login", next: null });
    expect(parseRoute("#/signup")).toEqual({ name: "signup", next: null });
    expect(parseRoute("#/account")).toEqual({ name: "account" });
    expect(parseRoute("#/setup")).toEqual({ name: "setup" });
  });

  it("parses screens with an id, decoding it", () => {
    expect(parseRoute("#/invoices/inv_abc")).toEqual({ name: "invoice", id: "inv_abc" });
    expect(parseRoute("#/orders/a%20b")).toEqual({ name: "order", id: "a b" });
  });

  it("carries the post-login destination", () => {
    expect(parseRoute("#/login?next=/checkout")).toEqual({ name: "login", next: "/checkout" });
  });

  it("tolerates trailing slashes and rejects unknown paths", () => {
    expect(parseRoute("#/checkout/")).toEqual({ name: "checkout" });
    expect(parseRoute("#/nope")).toEqual({ name: "notFound" });
    expect(parseRoute("#/invoices/a/b")).toEqual({ name: "notFound" });
  });
});

describe("safeNext", () => {
  it("allows in-app paths", () => {
    expect(safeNext("/checkout")).toBe("/checkout");
    expect(safeNext("/?q=milk&category=dairy-eggs")).toBe("/?q=milk&category=dairy-eggs");
  });

  it("falls back to the shop for anything else (no open redirects)", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
  });
});
