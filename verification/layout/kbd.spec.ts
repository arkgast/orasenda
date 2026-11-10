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
  // A Kbd with spaces has break opportunities, so only white-space: nowrap keeps it on one line. Squeeze the
  // running-text line so the Kbd sits at the line edge, then check it stays whole and that it splits without nowrap.
  const result = await page.evaluate(() => {
    const p = document.querySelector("[data-state='kbd-running-text'] p") as HTMLElement;
    p.style.cssText = "width:60px;display:block";
    const kbd = p.querySelector(".os-kbd") as HTMLElement;
    kbd.textContent = "⌘1 ⌘2 ⌘3 ⌘4";
    // The Kbd is a box, so count its lines by height rather than by client rects.
    const line = Number.parseFloat(getComputedStyle(kbd).lineHeight);
    const lines = () => Math.round(kbd.getBoundingClientRect().height / line);
    const whole = kbd.getClientRects().length === 1 ? lines() : -1;
    kbd.style.whiteSpace = "normal";
    const withoutNowrap = lines();
    return { whole, withoutNowrap };
  });
  expect(result.whole).toBe(1);
  expect(result.withoutNowrap).toBeGreaterThan(1);
});
