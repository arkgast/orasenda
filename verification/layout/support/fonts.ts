import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

// biome-ignore lint/suspicious/noExplicitAny: tokens.json is read loosely
type Json = Record<string, any>;
const tokens: Json = JSON.parse(
  readFileSync(resolve(__dirname, "../../../design/system/tokens.json"), "utf8"),
);

const firstName = (stack: string) => stack.split(",")[0].trim().replace(/^"|"$/g, "");

/** Every family and weight a type style uses, from tokens.json. */
export const FONT_FACES: Array<{ family: string; weight: number }> = (() => {
  const seen = new Set<string>();
  const out: Array<{ family: string; weight: number }> = [];
  for (const group of tokens.type.groups as Json[]) {
    const family = firstName(tokens.type.families[group.family]);
    for (const style of group.styles as Json[]) {
      const key = `${family}/${style.fontWeight}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ family, weight: style.fontWeight });
      }
    }
  }
  return out;
})();

const FILES: Array<{ family: string; file: string }> = tokens.type.fonts;

/**
 * Loads every family and weight, then checks a loaded FontFace exists for each and that its file
 * came from the page's own origin with status 200. document.fonts.check alone passes for a
 * family nothing declares.
 */
export async function expectBundledFontsLoaded(page: Page): Promise<void> {
  const report = await page.evaluate(
    async ({ faces, files }) => {
      await Promise.all(faces.map((f) => document.fonts.load(`${f.weight} 16px "${f.family}"`)));
      await document.fonts.ready;
      const loaded = new Set<string>();
      document.fonts.forEach((ff) => {
        if (ff.status === "loaded") loaded.add(ff.family.replace(/^"|"$/g, ""));
      });
      const problems: string[] = [];
      for (const f of faces) {
        if (!loaded.has(f.family)) problems.push(`no loaded FontFace for ${f.family}`);
      }
      const entries = performance.getEntriesByType("resource").map((e) => e.name);
      for (const { family, file } of files) {
        const base = file.split("/").pop() as string;
        const url = entries.find((n) => decodeURIComponent(n).includes(base));
        if (!url) {
          problems.push(`${family}: no request for ${base}`);
          continue;
        }
        if (new URL(url).origin !== location.origin)
          problems.push(`${family}: ${url} is off-origin`);
        const res = await fetch(url);
        if (res.status !== 200) problems.push(`${family}: ${url} answered ${res.status}`);
      }
      return problems;
    },
    { faces: FONT_FACES, files: FILES },
  );
  expect(report).toEqual([]);
}
