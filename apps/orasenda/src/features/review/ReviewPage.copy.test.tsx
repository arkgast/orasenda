import { settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderReview } from "./ReviewPage.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  vi.restoreAllMocks();
});

const BANNED = /!|missed|failed|broken|streak lost|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/iu;

// Every source file of the feature, found by glob so later tasks are covered without an edit.
const SOURCES = import.meta.glob<string>("./*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** The words a file shows: string literals and JSX text. Logs and imports are not copy. */
function literals(source: string): string[] {
  const code = source
    .split("\n")
    .filter((line) => !/^\s*(import|export .* from)\b/.test(line) && !line.includes("console."))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const found: string[] = [];
  for (const m of code.matchAll(
    /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g,
  )) {
    found.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  for (const m of code.matchAll(/>([^<>{}\n]+)</g)) found.push(m[1] ?? "");
  return found;
}

test("review_copy_has_no_banned_words", async () => {
  const { container } = await renderReview();
  expect(container.textContent ?? "").not.toMatch(BANNED);

  const files = Object.entries(SOURCES).filter(([name]) => !/\.(test|support)\./.test(name));
  expect(files.map(([name]) => name)).toContain("./Overview.tsx");
  for (const [name, source] of files) {
    for (const text of literals(source)) {
      expect(text, `${name}: ${text}`).not.toMatch(BANNED);
    }
  }
});

test("failure_copy_has_no_banned_words", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { container } = await renderReview({
    review_get: () => Promise.reject("store"),
  });
  expect(container.textContent ?? "").not.toMatch(BANNED);
});
