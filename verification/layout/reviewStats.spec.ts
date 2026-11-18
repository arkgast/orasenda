import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { smallTargets } from "./support/hitTargets.ts";

const SIZES = [
  { width: 360, height: 240 },
  { width: 640, height: 480 },
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
];
const RANGES = ["Week", "8 weeks", "6 months"];

async function openStats(page: Page, scenario: string, size: { width: number; height: number }) {
  await openApp(page, scenario, size);
  await page.keyboard.press("Meta+6");
  await expect(page.getByRole("heading", { name: "Stats", level: 2 })).toBeAttached();
}

async function pick(page: Page, range: string) {
  await page.getByRole("radio", { name: range, exact: true }).check({ force: true });
  await expect(page.getByRole("radio", { name: range, exact: true })).toBeChecked();
}

/** Nothing leaves the window, and the one scrolling box is the Review region. */
async function expectContained(page: Page, size: { width: number; height: number }) {
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
    size.height,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    size.width,
  );
  const region = page.getByRole("region", { name: "Review", exact: true });
  expect(await region.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
}

/** No two period labels in the plot overlap, and no bar leaves the plot. */
async function expectNoOverlap(page: Page) {
  const bad = await page.evaluate(() => {
    const boxes = Array.from(
      document.querySelectorAll('[data-slot="trend-bar"] > span:last-child'),
    ).map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    });
    const overlaps: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (
          a &&
          b &&
          a.left < b.right - 0.5 &&
          b.left < a.right - 0.5 &&
          a.top < b.bottom &&
          b.top < a.bottom
        ) {
          overlaps.push(`${i}/${j}`);
        }
      }
    }
    const plot = document.querySelector('[data-slot="trend-bars-plot"]')?.getBoundingClientRect();
    const out = Array.from(document.querySelectorAll('[data-slot="trend-bar-fill"]')).filter(
      (el) => {
        const r = el.getBoundingClientRect();
        return plot ? r.top < plot.top - 0.5 || r.bottom > plot.bottom + 0.5 : false;
      },
    );
    return { overlaps, out: out.length };
  });
  expect(bad).toEqual({ overlaps: [], out: 0 });
}

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test(`review_stats_weeks_${at}`, async ({ page }) => {
    await openStats(page, "reviewStatsWeeks", size);
    for (const range of RANGES) {
      await pick(page, range);
      await expectContained(page, size);
      await expectNoOverlap(page);
      // Dots and their legend are on Week only.
      const dots = range === "Week" ? 1 : 0;
      expect((await page.locator('[data-slot="habit-dot"]').count()) > 0).toBe(dots === 1);
      expect(await smallTargets(page.getByRole("main"))).toEqual([]);
    }
    // The longest sentences wrap inside the region instead of widening it.
    for (const text of [
      /^Over the last few weeks, tasks took more/,
      /^6 finished tasks had an estimate/,
    ]) {
      const inside = await page.getByText(text).evaluate((el) => {
        const edge = document.querySelector('[data-slot="scroll-region"]')?.getBoundingClientRect();
        return edge ? el.getBoundingClientRect().right <= edge.right : false;
      });
      expect(inside).toBe(true);
    }
    await expect(page.getByRole("button", { name: "Use 40%" })).toBeAttached();
    await expect(page.getByRole("button", { name: "Not now" })).toBeAttached();
    // The actions wrap under the sentence instead of squeezing it to a sliver.
    const notice = await page
      .locator('[data-slot="inline-notice-message"]')
      .last()
      .evaluate((el) => el.getBoundingClientRect().bottom);
    const actionTop = await page
      .getByRole("button", { name: "Use 40%" })
      .evaluate((el) => el.getBoundingClientRect().top);
    if (process.env.DEBUG_GAPS)
      console.log(JSON.stringify({ at, noticeBottom: notice, actionTop }));
    expect(actionTop).toBeGreaterThanOrEqual(notice - 0.5);
    if (size.height <= 240) {
      // At the smallest window the page is longer than the region, so the region scrolls.
      const region = page.getByRole("region", { name: "Review", exact: true });
      expect(await region.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    }
  });

  test(`review_stats_gap_${at}`, async ({ page }) => {
    await openStats(page, "reviewStatsGap", size);
    for (const range of RANGES) {
      await pick(page, range);
      await expectContained(page, size);
      await expectNoOverlap(page);
      // Filled and empty periods side by side; the gap is not counted in words.
      expect(await page.locator('[data-slot="trend-bar-fill"]').count()).toBeGreaterThan(0);
      await expect(page.getByText("Nothing recorded in this range yet.")).toHaveCount(0);
      expect(await smallTargets(page.getByRole("main"))).toEqual([]);
    }
    await expect(page.getByText("Done on 22 days in these 6 months")).toBeAttached();
  });

  test(`review_stats_empty_${at}`, async ({ page }) => {
    await openStats(page, "reviewStatsEmpty", size);
    for (const range of RANGES) {
      await pick(page, range);
      await expectContained(page, size);
      await expectNoOverlap(page);
      // The one sentence shows once, whatever the range.
      const line =
        range === "6 months"
          ? "Stats appear after your first focus session."
          : "Nothing recorded in this range yet.";
      await expect(page.getByText(line)).toHaveCount(1);
      await expect(page.locator('[data-slot="trend-bar-fill"]')).toHaveCount(0);
      expect(await smallTargets(page.getByRole("main"))).toEqual([]);
    }
  });

  test(`review_stats_unavailable_${at}`, async ({ page }) => {
    await openStats(page, "reviewStatsUnavailable", size);
    const row = page.locator('[data-slot="inline-notice"][data-tone="attention"]');
    await expect(row).toBeAttached();
    // The row keeps its sentence and its button inside the window, whatever its height.
    const box = await row.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(size.width);
    await expectContained(page, size);
    expect(await smallTargets(page.getByRole("main"))).toEqual([]);
  });
}
