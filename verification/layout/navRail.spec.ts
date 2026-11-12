import { expect, test } from "@playwright/test";
import { expectVisibleFits } from "./support/fitsVisible.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";
import { animatedElements } from "./support/motion.ts";
import { shoot } from "./support/shots.ts";
import { frames, openSpecimen, pressTab } from "./support/specimen.ts";

test("nav_rail_fits_and_hit_targets", async ({ page }, info) => {
  await openSpecimen(page, "NavRail");
  const all = frames(page);
  expect(await all.count()).toBe(2);
  for (let i = 0; i < 2; i++) {
    await expectVisibleFits(all.nth(i));
    expect(await smallTargets(all.nth(i))).toEqual([]);
  }
  // Each item is a range around the 52px item in the 64px rail, not an exact size.
  const sizes = await page.locator("[data-slot=nav-rail-item]").evaluateAll((els) =>
    els.map((el) => ({
      w: el.getBoundingClientRect().width,
      h: el.getBoundingClientRect().height,
    })),
  );
  expect(sizes.length).toBe(12);
  for (const s of sizes) {
    expect(s.w).toBeGreaterThanOrEqual(60);
    expect(s.w).toBeLessThanOrEqual(68);
    expect(s.h).toBeGreaterThanOrEqual(48);
    expect(s.h).toBeLessThanOrEqual(60);
  }
  await shoot(page, info, "nav-rail");
});

test("nav_rail_label_is_caption_size_and_current_has_side_bar", async ({ page }) => {
  await openSpecimen(page, "NavRail");
  const rail = page.locator("[data-state=nav-rail-today]");
  const label = await rail
    .locator("[data-slot=nav-rail-item] span")
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(label).toBeGreaterThanOrEqual(10);
  expect(label).toBeLessThanOrEqual(12);
  const bar = async (sel: string) =>
    rail.locator(sel).evaluate((el) => parseFloat(getComputedStyle(el).borderInlineStartWidth));
  expect(await bar("[aria-current=page]")).toBeGreaterThanOrEqual(2);
  expect(await bar("[aria-current=page]")).toBeLessThanOrEqual(4);
  const other = await rail
    .locator("button:not([aria-current])")
    .first()
    .evaluate((el) => getComputedStyle(el).borderInlineStartColor);
  const cur = await rail
    .locator("[aria-current=page]")
    .evaluate((el) => getComputedStyle(el).borderInlineStartColor);
  expect(other).not.toBe(cur);
});

test("rail_roving_focus_one_tab_stop", async ({ page }, info) => {
  await openSpecimen(page, "NavRail");
  const rail = page.locator("[data-state=nav-rail-today]");
  const stops = rail.locator("[data-slot=nav-rail-item][tabindex='0']");
  await expect(stops).toHaveCount(1);
  await expect(stops).toHaveText("Today");
  await pressTab(page);
  const first = page.locator(":focus");
  await expect(first).toHaveAttribute("data-slot", "nav-rail-item");
  await expect(first).toHaveText("Today");
  await expectFocusRingVisible(first);
  await shoot(page, info, "nav-rail-focus");
  // Arrows move within the rail and the tab stop moves with focus.
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(":focus")).toHaveText("Board");
  await expect(stops).toHaveText("Board");
  await expectFocusRingVisible(page.locator(":focus"));
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(page.locator(":focus")).toHaveText("Settings");
  // Tab leaves the rail: the next stop is not a rail item of the first frame.
  await pressTab(page);
  expect(await rail.locator(":focus").count()).toBe(0);
});

test("nav_rail_keyboard_activates_and_marks_current", async ({ page }) => {
  await openSpecimen(page, "NavRail");
  const rail = page.locator("[data-state=nav-rail-today]");
  const current = rail.locator("[aria-current=page]");
  await rail.getByRole("button", { name: "Today" }).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(current).toHaveText("Board");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(current).toHaveText("Calendar");
  await expect(rail.locator("[data-slot=nav-rail-item][tabindex='0']")).toHaveText("Calendar");
  await expect(page.locator("[data-state=nav-rail-settings] [aria-current=page]")).toHaveText(
    "Settings",
  );
});

test("nav_rail_has_no_motion_under_reduced_motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openSpecimen(page, "NavRail");
  expect(await animatedElements(page)).toEqual([]);
});

test("nav_rail_aria_snapshot", async ({ page }) => {
  await openSpecimen(page, "NavRail");
  await expect(page.locator("[data-state=nav-rail-today]")).toMatchAriaSnapshot(`
    - navigation "Main navigation":
      - button "Today"
      - button "Board"
      - button "Calendar"
      - button "Routines"
      - button "Review"
      - button "Settings"
  `);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`nav_rail_keeps_its_shape_at_${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openSpecimen(page, "NavRail");
    const all = frames(page);
    for (let i = 0; i < (await all.count()); i++) {
      await expectVisibleFits(all.nth(i));
      expect(await smallTargets(all.nth(i))).toEqual([]);
    }
    const width = await page
      .locator("[data-slot=nav-rail]")
      .first()
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThanOrEqual(60);
    expect(width).toBeLessThanOrEqual(68);
  });
}
