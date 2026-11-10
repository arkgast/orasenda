import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// describeShortcut throws on an unknown glyph string in tests (Kbd README, "Shortcut glyphs").
const host = window as unknown as { Orasenda?: Record<string, unknown> };
host.Orasenda = { ...host.Orasenda, strictShortcuts: true };

afterEach(() => {
  cleanup();
});
