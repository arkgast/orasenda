import { expect, test } from "@playwright/test";
import { expectVisibleFits } from "./support/fitsVisible.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";
import { animatedElements } from "./support/motion.ts";
import { shoot } from "./support/shots.ts";
import { frames, openSpecimen, pressTab } from "./support/specimen.ts";

const SMALL_CONTROLS = ["IconButton", "Tooltip", "Kbd"];

test("icon_button_hit_boxes_md_44_round_52", async ({ page }, info) => {
  await openSpecimen(page, "IconButton");
  const round = page.locator('[data-frame][data-state="icon-button-round"]');
  const rest = page.locator("[data-frame]:not([data-state='icon-button-round'])");
  expect(await smallTargets(rest.first())).toEqual([]);
  for (let i = 0; i < (await rest.count()); i++) {
    expect(await smallTargets(rest.nth(i))).toEqual([]);
  }
  expect(await smallTargets(round, { width: 52, height: 52 })).toEqual([]);
  await shoot(page, info, "icon-button");
});

test("small_controls_fit_and_ring_visible", async ({ page }, info) => {
  for (const name of SMALL_CONTROLS) {
    await openSpecimen(page, name);
    const all = frames(page);
    for (let i = 0; i < (await all.count()); i++) await expectVisibleFits(all.nth(i));
    const count = await page
      .locator("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")
      .count();
    for (let i = 0; i < count; i++) {
      await pressTab(page);
      const active = page.locator(":focus");
      await expect(active).toHaveCount(1);
      await expectFocusRingVisible(active);
    }
    if (name !== "Tooltip") await shoot(page, info, name === "Kbd" ? "kbd" : "icon-button-focus");
  }
});

test("small_controls_aria_snapshot", async ({ page }) => {
  await openSpecimen(page, "IconButton");
  await expect(page.locator("body")).toMatchAriaSnapshot(`
    - paragraph: icon-button-md
    - button "Pause session"
    - paragraph: icon-button-md-shortcut
    - button "End session"
    - paragraph: icon-button-round
    - button "Resume session"
    - paragraph: icon-button-menu-trigger
    - button "Pages"
    - paragraph: icon-button-leave-full-screen
    - button "Leave full screen"
    - paragraph: icon-button-disabled
    - button "Jump to section" [disabled]
    - text: Nothing to jump to yet.
  `);
  await openSpecimen(page, "Tooltip");
  await expect(page.locator("body")).toMatchAriaSnapshot(`
    - paragraph: tooltip-preset-summary
    - button "Classic, ends 15:20, Change preset"
    - paragraph: tooltip-long-label
    - button "Jump to section, the list of settings sections on this page, in order"
    - paragraph: tooltip-dialog
    - button "Open dialog"
  `);
  await openSpecimen(page, "Kbd");
  await expect(page.locator("body")).toMatchAriaSnapshot(`
    - paragraph: kbd-running-text
    - paragraph: Press Control-Option-F to capture a thought.
    - paragraph: kbd-single-key
    - paragraph: Preset P key
    - paragraph: kbd-command-period
    - paragraph: End Command-Period
    - paragraph: kbd-shift-command
    - paragraph: Palette Shift-Command-P
  `);
});

test("small_controls_no_motion_when_reduced", async ({ page }, info) => {
  test.skip(info.project.name !== "light-reduced-motion", "reduced motion project only");
  for (const name of SMALL_CONTROLS) {
    await openSpecimen(page, name);
    expect(await animatedElements(page)).toEqual([]);
  }
  await openSpecimen(page, "IconButton");
  await page.getByRole("button", { name: "Pause session" }).hover();
  expect(await animatedElements(page)).toEqual([]);
});
