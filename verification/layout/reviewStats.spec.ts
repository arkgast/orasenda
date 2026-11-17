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
      if (range !== "6 months") await expectNoOverlap(page);
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
  });

  test(`review_stats_gap_${at}`, async ({ page }) => {
    await openStats(page, "reviewStatsGap", size);
    for (const range of RANGES) {
      await pick(page, range);
      await expect(page.getByText("Nothing recorded in this range yet.")).toBeAttached();
      await expectContained(page, size);
      if (range !== "6 months") await expectNoOverlap(page);
    }
    await expect(page.getByText("Stats appear after your first focus session.")).toBeAttached();
    // No fills at all, and no button that asks for anything.
    await expect(page.locator('[data-slot="trend-bar-fill"]')).toHaveCount(0);
    expect(await smallTargets(page.getByRole("main"))).toEqual([]);
  });
}
