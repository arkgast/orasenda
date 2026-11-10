import { expect, type Page, test } from "@playwright/test";
import { animatedElements } from "./support/motion.ts";
import { shoot } from "./support/shots.ts";
import { frames, openSpecimen } from "./support/specimen.ts";

const floating = (page: Page) =>
  page.locator("[data-frame][data-state^='menu-bar-timer-floating-']");

/** The timer's box against its frame: [timer, frame]. */
async function boxes(page: Page, state: string) {
  return page.locator(`[data-state='${state}']`).evaluate((frame) => {
    const t = (
      frame.querySelector("[data-slot=menu-bar-timer]") as HTMLElement
    ).getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    return {
      t: { l: t.left, r: t.right, top: t.top, b: t.bottom, w: t.width, h: t.height },
      f: { l: f.left, r: f.right, top: f.top, b: f.bottom },
    };
  });
}

test("floating_variant_fits_inside_280x56", async ({ page }, info) => {
  await openSpecimen(page, "MenuBarTimer");
  const count = await floating(page).count();
  expect(count).toBeGreaterThanOrEqual(2);
  for (const state of ["menu-bar-timer-floating-focus", "menu-bar-timer-floating-paused"]) {
    const { t, f } = await boxes(page, state);
    expect(f.r - f.l, "frame is the 280 floater").toBeGreaterThanOrEqual(279);
    expect(t.l).toBeGreaterThanOrEqual(f.l - 1);
    expect(t.r).toBeLessThanOrEqual(f.r + 1);
    expect(t.top).toBeGreaterThanOrEqual(f.top - 1);
    expect(t.b).toBeLessThanOrEqual(f.b + 1);
    expect(t.h, `${state} stays one row`).toBeLessThanOrEqual(56);
  }
  await shoot(page, info, "menu-bar-timer");
});

test("long_task_is_truncated_not_wrapped", async ({ page }) => {
  await openSpecimen(page, "MenuBarTimer");
  const task = page.locator(
    "[data-state='menu-bar-timer-floating-focus'] [data-slot=menu-bar-timer-task]",
  );
  await expect(task).toHaveCSS("text-overflow", "ellipsis");
  const clipped = await task.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(clipped).toBe(true);
});

test("menu_bar_timer_has_no_focusable_content", async ({ page }) => {
  await openSpecimen(page, "MenuBarTimer");
  // Informational only: the host wraps it in its own control, so nothing inside takes focus or needs a hit target.
  const focusable = await page
    .locator("[data-slot=menu-bar-timer] :is(a, button, input, [tabindex])")
    .count();
  expect(focusable).toBe(0);
  // The timer itself keeps at least the hit-floor height (24px).
  const heights = await page
    .locator("[data-slot=menu-bar-timer]")
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(24);
});

test("mode_is_a_shape_and_a_word_never_colour_alone", async ({ page }) => {
  await openSpecimen(page, "MenuBarTimer");
  for (const mode of ["focus", "warning", "break", "paused", "idle"]) {
    const timer = page.locator(`[data-state='menu-bar-timer-${mode}'] [data-slot=menu-bar-timer]`);
    expect(await timer.locator("svg").count(), `${mode} has a shape`).toBe(1);
    await expect(timer).toHaveAttribute("aria-label", /^(Focus|Almost up|Break|Paused|No session)/);
  }
  await expect(
    page.locator("[data-state='menu-bar-timer-idle'] [data-slot=menu-bar-timer-digits]"),
  ).toHaveCount(0);
});

test("menu_bar_timer_aria_snapshot", async ({ page }) => {
  await openSpecimen(page, "MenuBarTimer");
  await expect(page.locator("[data-state='menu-bar-timer-floating-paused']")).toMatchAriaSnapshot(`
    - timer "Paused, 18 minutes 42 seconds remaining, Write chapter"
  `);
  await expect(page.locator("[data-state='menu-bar-timer-idle']")).toMatchAriaSnapshot(`
    - timer "No session"
  `);
});

test("timer_faces_no_motion_when_reduced (MenuBarTimer)", async ({ page }, info) => {
  test.skip(info.project.name !== "light-reduced-motion", "reduced motion project only");
  await openSpecimen(page, "MenuBarTimer");
  expect(await animatedElements(page)).toEqual([]);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`menu_bar_timer_keeps_its_shape_at_${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openSpecimen(page, "MenuBarTimer");
    expect(await frames(page).count()).toBeGreaterThan(0);
    const noScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noScroll).toBe(true);
    for (const state of ["menu-bar-timer-floating-focus", "menu-bar-timer-floating-paused"]) {
      const { t, f } = await boxes(page, state);
      expect(t.h).toBeGreaterThanOrEqual(24);
      expect(t.h).toBeLessThanOrEqual(56);
      expect(t.w).toBeGreaterThan(80);
      expect(t.w).toBeLessThanOrEqual(f.r - f.l + 1);
    }
    for (const state of ["menu-bar-timer-focus", "menu-bar-timer-paused"]) {
      const { t } = await boxes(page, state);
      expect(t.h).toBeGreaterThanOrEqual(24);
      expect(t.h).toBeLessThanOrEqual(40);
      expect(t.w).toBeLessThanOrEqual(200);
    }
  });
}
