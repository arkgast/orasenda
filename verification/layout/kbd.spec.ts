import { expect, test } from "@playwright/test";
import { shoot } from "./support/shots.ts";
import { openSpecimen } from "./support/specimen.ts";

test("kbd_never_wraps", async ({ page }, info) => {
  await openSpecimen(page, "Kbd");
  const kbds = page.locator(".os-kbd");
  expect(await kbds.count()).toBeGreaterThan(0);
  const rects = await kbds.evaluateAll((els) => els.map((el) => el.getClientRects().length));
  expect(rects.every((n) => n === 1)).toBe(true);
  await expect(kbds.first()).toHaveCSS("white-space", "nowrap");
  await shoot(page, info, "kbd-glyphs");
});

test("kbd_stays_whole_at_the_line_edge", async ({ page }) => {
  await openSpecimen(page, "Kbd");
  // Squeeze a running-text line so the Kbd sits at the line edge; a broken nowrap would split it.
  const result = await page.evaluate(() => {
    const p = document.querySelector("[data-state='kbd-running-text'] p") as HTMLElement;
    p.style.cssText = "width:120px;display:block";
    const kbd = p.querySelector(".os-kbd") as HTMLElement;
    return { rects: kbd.getClientRects().length, wraps: p.getClientRects().length };
  });
  expect(result.rects).toBe(1);
});
