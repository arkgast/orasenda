import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { TALL_HEIGHT } from "./src/components/ui/floating-timer.tsx";
import { FOCUS_PX } from "./src/components/ui/full-screen-focus.tsx";

const tokens = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../tokens/tokens.json"), "utf8"),
);

function px(name: string): number {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if (o.name === name) found.push(String(o.value ?? o.lineHeight));
    for (const v of Object.values(o)) walk(v);
  };
  walk(tokens);
  const value = Number.parseFloat(found[0] ?? "");
  if (Number.isNaN(value)) throw new Error(`token ${name} has no px value`);
  return value;
}

test("full_screen_focus_and_floater_px_constants_match_tokens_json", () => {
  expect(FOCUS_PX.leaveRow).toBe(px("hit-min"));
  expect(FOCUS_PX.controlsRow).toBe(px("control-lg"));
  expect(FOCUS_PX.statusRow).toBe(px("body-sm"));
  expect(FOCUS_PX.captionRow).toBe(px("body-sm"));
  expect(FOCUS_PX.insetCompact).toBe(px("space-4"));
  expect(FOCUS_PX.inset).toBe(px("space-8"));
  expect(FOCUS_PX.gapTight).toBe(px("space-1"));
  expect(FOCUS_PX.gapRoomy).toBe(px("space-4"));
  expect(FOCUS_PX.padTight).toBe(px("space-2"));
  expect(FOCUS_PX.padRoomy).toBe(px("space-6"));
  expect(TALL_HEIGHT).toBe(2 * px("hit-min"));
});
