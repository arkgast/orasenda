import { expect, type Page, test } from "@playwright/test";
import { digitsInsideRing } from "./support/ring.ts";
import { openSpecimen } from "./support/specimen.ts";

const states = (page: Page, prefix: string) =>
  page.locator(`[data-frame][data-state^='${prefix}']`);

// Every frame that shows digits for the given length: fluid sizes, numeric 280 and full 560.
const LONG = ["timer-ring-fluid-long", "timer-ring-numeric-long", "timer-ring-full-long"];
const SHORT = ["timer-ring-fluid-focus", "timer-ring-numeric-focus", "timer-ring-full-short"];

async function md(page: Page) {
  return page.evaluate(() =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--type-timer-md-font-size"),
    ),
  );
}

// `floor`: fluid frames where the timer-md floor sets the size (160px) are held to the circle only.
// Every other "long" frame lies inside the inner square; "short" is held to the circle (square=false).
async function expectInside(page: Page, frame: string, square: boolean, floor = false) {
  const loc = page.locator(`[data-frame][data-state="${frame}"]`);
  const r = await digitsInsideRing(page, loc);
  const label = `${frame} (digits ${r.digits.w.toFixed(0)}x${r.digits.h.toFixed(0)} in ${r.inner.toFixed(0)})`;
  expect(r.circleProblems, label).toEqual([]);
  if (square && !(floor && r.fontSize <= (await md(page)) + 0.5))
    expect(r.problems, label).toEqual([]);
}

test("ring_digits_inside_for_h_mm_ss_every_size", async ({ page }) => {
  await openSpecimen(page, "TimerRing");
  const longs = states(page, "timer-ring-fluid-long");
  expect(await longs.count()).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < (await longs.count()); i++) {
    await expectInside(page, (await longs.nth(i).getAttribute("data-state")) ?? "", true, true);
  }
  for (const s of LONG.slice(1)) await expectInside(page, s, true);
});

// "MM:SS" keeps its size (see ring_short_digits_unchanged_at_400), so it is held to the circle only.
test("ring_digits_inside_for_mm_ss_every_size", async ({ page }) => {
  await openSpecimen(page, "TimerRing");
  const fluid = page.locator(
    "[data-frame][data-state^='timer-ring-fluid-'][data-state*='x']:not([data-state*='long'])",
  );
  expect(await fluid.count()).toBeGreaterThanOrEqual(6);
  for (let i = 0; i < (await fluid.count()); i++) {
    await expectInside(page, (await fluid.nth(i).getAttribute("data-state")) ?? "", false);
  }
  for (const s of SHORT) await expectInside(page, s, false);
});

test("ring_long_digits_at_least_timer_md", async ({ page }) => {
  await openSpecimen(page, "TimerRing");
  const floor = await md(page);
  const longs = states(page, "timer-ring-fluid-long");
  for (let i = 0; i < (await longs.count()); i++) {
    const r = await digitsInsideRing(page, longs.nth(i));
    expect(r.fontSize).toBeGreaterThanOrEqual(floor);
  }
});

test("ring_short_digits_unchanged_at_400", async ({ page }) => {
  await openSpecimen(page, "TimerRing");
  const r = await digitsInsideRing(page, page.locator("[data-state='timer-ring-fluid-focus']"));
  // clamp(timer-md, 23cqi, timer-xl) at 400px: the pre-change size.
  const xl = await page.evaluate(() =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--type-timer-xl-font-size"),
    ),
  );
  expect(r.fontSize).toBeCloseTo(Math.min(xl, Math.max(await md(page), 0.23 * 400)), 1);
});
