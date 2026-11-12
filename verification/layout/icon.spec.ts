import { expect, test } from "@playwright/test";
import { expectVisibleFits } from "./support/fitsVisible.ts";
import { animatedElements } from "./support/motion.ts";
import { shoot } from "./support/shots.ts";
import { frames, openSpecimen } from "./support/specimen.ts";

test("glyph_sheet_at_20px_both_themes", async ({ page }, info) => {
  await openSpecimen(page, "Icon");
  const all = frames(page);
  expect(await all.count()).toBe(3);
  for (let i = 0; i < 3; i++) await expectVisibleFits(all.nth(i));
  const sizes = await page.locator("[data-icon] svg").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, stroke: getComputedStyle(el).stroke };
    }),
  );
  expect(sizes.length).toBe(20);
  const ink = await page
    .locator("[data-icon]")
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  for (const s of sizes) {
    expect(s.w).toBe(20);
    expect(s.h).toBe(20);
    // currentColor: the glyph takes the text colour of the theme, so it is visible in both.
    expect(s.stroke).toBe(ink);
  }
  const md = await page.locator("[data-state=icon-md-alert] svg").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [r.width, r.height];
  });
  expect(md).toEqual([14, 14]);
  await shoot(page, info, "icon-sheet");
});

test("icons_and_rail_aria_snapshot", async ({ page }) => {
  await openSpecimen(page, "Icon");
  expect(await page.locator("svg:not([aria-hidden=true])").count()).toBe(0);
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
  expect(await page.locator("svg:not([aria-hidden=true])").count()).toBe(0);
});

test("icons_and_rail_no_motion_when_reduced", async ({ page }, info) => {
  test.skip(info.project.name !== "light-reduced-motion", "reduced motion project only");
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const name of ["Icon", "NavRail"]) {
    await openSpecimen(page, name);
    expect(await animatedElements(page)).toEqual([]);
  }
});
