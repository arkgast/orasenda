import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, vi } from "vitest";
import { timerLayout } from "./index.ts";

const readme = readFileSync(
  resolve(import.meta.dirname, "../../design/system/components/TimerStrip/README.md"),
  "utf8",
);
const tokens = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../design/system/tokens.json"), "utf8"),
);

// Rows come from the README table. Two Today rows differ from the spec table (README wins):
// 360x360 -> ring (spec stackedStrip) and 1000x440 -> ring (spec strip).
const rows = readme
  .split("\n")
  .filter((l) => /^\| (Today|Focus window) \|/.test(l))
  .map((l) => {
    const c = l.split("|").map((s) => s.trim());
    return {
      surface: c[1],
      window: c[2],
      contentWidth: +c[3],
      contentHeight: +c[4],
      windowWidth: +c[5],
      result: c[6].split(" ")[0],
    };
  });

test("timer_layout_matches_spec_table", () => {
  expect(rows).toHaveLength(20);
  for (const r of rows) {
    const { surface, window: w, result, ...box } = r;
    expect(timerLayout(box), `${surface} ${w}`).toBe(result);
  }
});

function findPx(node: unknown, name: string): number | undefined {
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (o.name === name || o.id === name) return parseFloat(String(o.value));
    for (const v of Object.values(o)) {
      const r = findPx(v, name);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

test("timer_layout_constants_match_tokens_json", () => {
  const names = ["layout-ring-min-height", "layout-compact-width", "layout-strip-height"] as const;
  const expected = Object.fromEntries(names.map((n) => [n, findPx(tokens, n)]));
  expect(timerLayout.tokens).toEqual(expected);
  expect(Object.values(expected).every((v) => typeof v === "number" && v > 0)).toBe(true);
});

const L = (contentWidth: number, contentHeight: number, windowWidth: number) =>
  timerLayout({ contentWidth, contentHeight, windowWidth });

test("timer_layout_boundaries", () => {
  expect(L(1000, 360, 1000)).toBe("strip");
  expect(L(700, 360, 700)).toBe("ring");
  expect(L(700, 359, 640)).toBe("strip");
  expect(L(700, 359, 639)).toBe("stackedStrip");
  expect(L(800, 400, 800)).toBe("ring");
  expect(L(801, 400, 801)).toBe("strip");
  expect(L(1000, 420, 1000)).toBe("ring");
  expect(L(1000, 419, 1000)).toBe("strip");
  expect(L(600, 300, 640)).toBe("strip");
  expect(L(600, 300, 639)).toBe("stackedStrip");
});

test("timer_layout_is_pure", () => {
  const trap = () =>
    new Proxy(
      {},
      {
        get: () => {
          throw new Error("timerLayout must not read the environment");
        },
      },
    );
  vi.stubGlobal("document", trap());
  vi.stubGlobal("window", trap());
  try {
    expect(L(900, 240, 900)).toBe("strip");
    expect(L(300, 300, 300)).toBe(L(300, 300, 300));
  } finally {
    vi.unstubAllGlobals();
  }
});
