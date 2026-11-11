import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll } from "vitest";

afterEach(() => {
  cleanup();
});

// The app loads its pages as chunks; tests start once they are in, as they are a moment after launch.
beforeAll(async () => {
  await (await import("../app/App")).pagesReady;
});
