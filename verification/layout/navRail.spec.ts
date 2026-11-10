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

test("nav_rail_focus_ring_visible_on_keyboard", async ({ page }, info) => {
  await openSpecimen(page, "NavRail");
  const first = page.locator("[data-state=nav-rail-today] [data-slot=nav-rail-item]");
  for (let i = 0; i < (await first.count()); i++) {
    await pressTab(page);
    const active = page.locator(":focus");
    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute("data-slot", "nav-rail-item");
    await expectFocusRingVisible(active);
  }
  await shoot(page, info, "nav-rail-focus");
});

test("nav_rail_keyboard_activates_and_marks_current", async ({ page }) => {
  await openSpecimen(page, "NavRail");
  const board = page.locator("[data-state=nav-rail-today] button", { hasText: "Board" });
  await board.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  // The specimen's current page is fixed by the host; activation leaves aria-current where it was.
  await expect(page.locator("[data-state=nav-rail-today] [aria-current=page]")).toHaveText("Today");
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
