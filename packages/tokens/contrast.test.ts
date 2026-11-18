import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert, describe, expect, test } from "vitest";
import { BadInput, check, meets, resolve } from "./contrast.ts";

const here = dirname(fileURLToPath(import.meta.url));
// biome-ignore lint/suspicious/noExplicitAny: tokens.json and the pairs file are read loosely
type Loose = any;
const realTokens: Loose = JSON.parse(readFileSync(join(here, "tokens.json"), "utf8"));
const realPairs: Loose = JSON.parse(readFileSync(join(here, "contrast-pairs.json"), "utf8"));

const WALLPAPERS = ["#EDEDED", "#808080", "#1C1C1E"];

const TOKENS = {
  color: {
    tokens: [
      { name: "white", value: { light: "#ffffff", dark: "#ffffff" } },
      { name: "black", value: { light: "#000000", dark: "#000000" } },
      { name: "grey-777", value: { light: "#777777", dark: "#777777" } },
      { name: "grey-949494", value: { light: "#949494", dark: "#949494" } },
      { name: "ink", value: { light: "#111111", dark: "#eeeeee" } },
      { name: "ink-alias", value: { light: "{ink}", dark: "{ink}" } },
      { name: "scrim", value: { light: "rgba(0, 0, 0, 0.5)", dark: "rgba(0, 0, 0, 0.5)" } },
    ],
  },
};

// 0 when every pair holds, 1 when a pair fails, 2 on bad input (as the old script exited).
function run(pairs: Loose, tokens: Loose = TOKENS): number {
  try {
    if (!Array.isArray(pairs)) throw new BadInput("the pairs file must hold a list");
    return check(tokens, pairs).failed ? 1 : 0;
  } catch (e) {
    if (e instanceof BadInput) return 2;
    throw e;
  }
}

const pair = (fg: string, bg: string, kind = "text") => ({ fg, bg, kind, where: "test" });
const floater = (fill: string, edge: string, kind = "mark") => ({
  fill,
  edge,
  wallpaper: WALLPAPERS,
  kind,
  where: "test",
  rule: "fill-or-edge",
});

describe("contrast maths", () => {
  test("text_pair_at_4_5_passes", () => {
    expect(meets(4.5, "text")).toBe(true);
    expect(meets(4.4999, "text")).toBe(false);
    // black on white is 21:1, well above the line
    expect(run([pair("black", "white")])).toBe(0);
  });

  test("seeded_text_pair_under_4_5_fails", () => {
    // #777777 on white is about 4.48:1
    expect(run([pair("grey-777", "white")])).toBe(1);
  });

  test("mark_pair_uses_3_to_1", () => {
    // #949494 on white is about 3.03:1
    expect(run([pair("grey-949494", "white", "mark")])).toBe(0);
    expect(run([pair("grey-949494", "white", "text")])).toBe(1);
  });

  test("floater_fails_when_fill_and_edge_both_under_3", () => {
    // white fill and edge on the light wallpaper are both near 1.2:1
    expect(run([floater("white", "white")])).toBe(1);
  });

  test("floater_passes_when_edge_holds_on_every_wallpaper", () => {
    // White fill fails on #EDEDED (1.17) but holds on the other two; the black edge
    // holds there (17.9), so every wallpaper has one of the two at 3:1 or more.
    const tokens = {
      color: {
        tokens: [
          { name: "fill", value: { light: "#ffffff", dark: "#ffffff" } },
          { name: "edge", value: { light: "#000000", dark: "#000000" } },
        ],
      },
    };
    expect(run([floater("fill", "edge")], tokens)).toBe(0);
  });

  test("token_reference_resolves", () => {
    expect(resolve(TOKENS, "ink-alias")).toEqual(["#111111", "#eeeeee"]);
    expect(resolve(realTokens, "focus-ring")).toEqual(resolve(realTokens, "focus"));
    expect(resolve(realTokens, "selection")).toEqual(resolve(realTokens, "focus-soft"));
  });

  test("unknown_token_is_bad_input", () => {
    expect(run([pair("nope", "white")])).toBe(2);
    expect(run([{ fg: "black" }])).toBe(2);
    expect(run([pair("scrim", "white")])).toBe(2);
    expect(run([pair("black", "white", "icon")])).toBe(2);
  });
});

describe("declared colour pairs", () => {
  test("every_pair_holds_in_both_themes", () => {
    assert.isArray(realPairs);
    const { lines, failed } = check(realTokens, realPairs);
    const failing = lines.filter((l) => l.startsWith("FAIL"));
    expect(failing, failing.join("\n")).toEqual([]);
    expect(failed).toBe(false);
    expect(lines.length).toBeGreaterThan(0);
  });
});
