import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll } from "vitest";

afterEach(() => {
  cleanup();
});

// The app loads its pages as chunks; tests start once they are in, as they are a moment after launch.
beforeAll(async () => {
  await (await import("@app/App")).pagesReady;
});

// styles/app.css (through the tokens) defines these in the real app; jsdom loads no stylesheet.
document.documentElement.style.setProperty("--layout-compact-width", "640px");
document.documentElement.style.setProperty("--layout-compact-height", "480px");
