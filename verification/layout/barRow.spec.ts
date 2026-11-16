import { expect, test } from "@playwright/test";
import { openSpecimen } from "./support/specimen.ts";

test("bar_row_stubs_never_cross_the_fill", async ({ page }) => {
  await openSpecimen(page, "BarRow");
  for (const state of ["bar-row-goal-420", "bar-row-goal-reached-420"]) {
    const frame = page.locator(`[data-state='${state}']`);
    const fill = (await frame.locator("[data-slot=bar-fill]").boundingBox())!;
    const stubs = await frame
      .locator("[data-slot=bar-goal-stub]")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    expect(stubs).toHaveLength(2);
    for (const s of stubs) {
      const overlapX = Math.min(s.right, fill.x + fill.width) - Math.max(s.left, fill.x);
      const overlapY = Math.min(s.bottom, fill.y + fill.height) - Math.max(s.top, fill.y);
      expect(overlapX > 0.01 && overlapY > 0.01).toBe(false);
    }
  }
});

test("bar_row_columns_align_and_nothing_is_tabbable", async ({ page }) => {
  await openSpecimen(page, "BarRow");
  const frame = page.locator("[data-state='bar-row-plain-420']");
  const rights = await frame
    .locator("[data-slot=bar-row] > span:last-child")
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().right)));
  expect(new Set(rights).size).toBe(1);
  const heights = await frame
    .locator("[data-slot=bar-row]")
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBe(1);
  expect(
    await page
      .locator("[data-slot=bar-row] [tabindex], [data-slot=bar-row] a, [data-slot=bar-row] button")
      .count(),
  ).toBe(0);
});

test("bar_row_single_line_rows_are_control_sm_tall", async ({ page }) => {
  await openSpecimen(page, "BarRow");
  const expected = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--control-sm")),
  );
  expect(expected).toBeGreaterThan(0);
  const heights = await page
    .locator("[data-state='bar-row-plain-420'] [data-slot=bar-row]")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  for (const h of heights) expect(Math.abs(h - expected)).toBeLessThan(0.5);
});

test("bar_row_stubs_sit_inside_the_row_with_equal_clearance", async ({ page }) => {
  await openSpecimen(page, "BarRow");
  for (const state of ["bar-row-goal-420", "bar-row-goal-reached-420"]) {
    const frame = page.locator(`[data-state='${state}']`);
    const row = (await frame.locator("[data-slot=bar-row]").boundingBox())!;
    const words = (await frame.locator("[data-slot=bar-goal-words]").boundingBox())!;
    const [top, bottom] = await frame
      .locator("[data-slot=bar-goal-stub]")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    expect(top.top).toBeGreaterThanOrEqual(row.y);
    expect(bottom.bottom).toBeLessThanOrEqual(words.y);
    expect(Math.abs(top.top - row.y - (words.y - bottom.bottom))).toBeLessThanOrEqual(1);
  }
});

test("bar_row_long_label_wraps_and_leaves_the_bar_room_at_360", async ({ page }) => {
  await openSpecimen(page, "BarRow");
  const frame = page.locator("[data-state='bar-row-narrow-360']");
  const row = (await frame.locator("[data-slot=bar-row]").nth(1).boundingBox())!;
  const fill = (await frame.locator("[data-slot=bar-fill]").nth(1).boundingBox())!;
  expect(fill.width).toBeGreaterThanOrEqual(row.width * 0.4 - 0.5);
});
