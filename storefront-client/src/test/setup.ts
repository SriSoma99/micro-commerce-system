import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom doesn't implement scrolling.
beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

// Unmount rendered components and clear storage between tests so they can't leak into each other.
afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = "";
});
