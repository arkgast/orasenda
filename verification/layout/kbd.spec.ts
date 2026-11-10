import { expect, test } from "@playwright/test";
import { shoot } from "./support/shots.ts";
import { openSpecimen } from "./support/specimen.ts";

test("kbd_never_wraps", async ({ page }, info) => {
  await openSpecimen(page, "Kbd");
  const kbds = page.locator(".os-kbd");
  expect(await kbds.count()).toBeGreaterThan(0);
  const rects = await kbds.evaluateAll((els) => els.map((el) => el.getClientRects().length));
  expect(rects.every((n) => n === 1)).toBe(true);
  await shoot(page, info, "kbd-glyphs");
});
