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
  const iconButtons = `
    - paragraph: icon-button-md
    - button "Pause session"
    - paragraph: icon-button-md-shortcut
    - button "End session"
    - paragraph: icon-button-round
    - button "Resume session"
    - paragraph: icon-button-menu-trigger
    - button "Pages"
    - paragraph: icon-button-pages-keys
    - button "Pages"
    - paragraph: icon-button-leave-full-screen
    - button "Leave full screen"
    - paragraph: icon-button-disabled
    - button "Jump to section" [disabled]
    - text: Nothing to jump to yet.
  `;
  await expect(page.locator("body")).toMatchAriaSnapshot(iconButtons);
  // With a tooltip showing, its text (label and Kbd) is still absent from the accessibility tree.
  const pages = page.locator('[data-state="icon-button-pages-keys"] button');
  await pages.hover();
  await expect(page.locator("[data-slot=tooltip]")).toContainText("⌘1–6");
  await expect(page.locator("[data-slot=tooltip]")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("body")).toMatchAriaSnapshot(iconButtons);
  await expect(pages).toHaveAttribute(
    "aria-keyshortcuts",
    "Meta+1 Meta+2 Meta+3 Meta+4 Meta+5 Meta+6",
  );
  await expect(page.locator('[data-state="icon-button-round"] button')).not.toHaveAttribute(
    "aria-keyshortcuts",
  );
  await expect(page.locator('[data-state="icon-button-disabled"] button')).toHaveAttribute(
    "aria-describedby",
    "jump-why",
  );
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

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`icon_button_keeps_its_hit_boxes_at_${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openSpecimen(page, "IconButton");
    const buttons = page.locator("[data-slot=icon-button]");
    expect(await buttons.count()).toBeGreaterThan(0);
    const boxes = await buttons.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          w: r.width,
          h: r.height,
          inside: r.left >= 0 && r.right <= document.documentElement.clientWidth,
        };
      }),
    );
    for (const box of boxes) {
      // md is 44, round is 52: a range, never below the hit target.
      expect(box.w).toBeGreaterThanOrEqual(44);
      expect(box.w).toBeLessThanOrEqual(52);
      expect(box.h).toBeGreaterThanOrEqual(44);
      expect(box.h).toBeLessThanOrEqual(52);
      expect(box.inside).toBe(true);
    }
  });
}

test("icon_button_icon_is_20px_line_icon", async ({ page }) => {
  await openSpecimen(page, "IconButton");
  const icons = page.locator("[data-slot=icon-button] svg");
  expect(await icons.count()).toBeGreaterThan(0);
  const styles = await icons.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { w: r.width, h: r.height, fill: cs.fill, stroke: cs.stroke };
    }),
  );
  for (const s of styles) {
    expect(s.w).toBe(20);
    expect(s.h).toBe(20);
    expect(s.fill).toBe("none");
    expect(s.stroke).not.toBe("none");
  }
});
