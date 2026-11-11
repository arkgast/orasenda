import { expect, type Locator } from "@playwright/test";
import { overflows } from "./fits.ts";

/**
 * Like expectVisibleFits, but a line-clamped box may hide lines: its own scroll overflow is not reported,
 * and its visible box must be at most `lines` lines tall. Everything else is reported as usual.
 */
export async function expectClampedFits(
  frame: Locator,
  clampSelector: string,
  lines: number,
): Promise<void> {
  const reported = await overflows(frame);
  const clampClass = await frame.evaluate((root, sel) => {
    const el = root.querySelector(sel);
    return el instanceof HTMLElement ? (el.className.split(" ")[0] ?? "") : "";
  }, clampSelector);
  expect(
    reported.filter(
      (l) => !l.includes(".sr-only") && !(clampClass && l.includes(`.${clampClass} (`)),
    ),
  ).toEqual([]);
  const box = frame.locator(clampSelector);
  if ((await box.count()) > 0) {
    const h = await box.first().evaluate((el) => ({
      box: el.clientHeight,
      line: Number.parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(h.box).toBeLessThanOrEqual(h.line * lines + 1);
  }
}
