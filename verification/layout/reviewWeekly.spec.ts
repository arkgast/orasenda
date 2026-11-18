import { expect, type Locator, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";

const SIZES = [
  { width: 360, height: 240 },
  { width: 640, height: 480 },
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
];

type Size = { width: number; height: number };

/** Presses a button the way a keyboard does, so focus rings keep showing (:focus-visible). */
async function press(page: Page, button: Locator) {
  await button.focus();
  await page.keyboard.press("Enter");
}

async function startWeekly(page: Page, scenario: string, size: Size) {
  await openApp(page, scenario, size);
  await page.keyboard.press("Meta+6");
  await expect(page.getByRole("heading", { name: "Review", level: 1 })).toBeAttached();
  await press(page, page.getByRole("button", { name: "Start weekly review" }).first());
  await expect(page.getByRole("heading", { name: "Look back", level: 1 })).toBeFocused();
}

const next = (page: Page) => page.getByRole("button", { name: "Continue" });

/** The page never scrolls; every footer control sits fully inside the window. */
async function expectFits(page: Page, size: Size) {
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
    size.height,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    size.width,
  );
  for (const name of [/^End/, /^Continue|^Back to Review/]) {
    const box = await page.getByRole("button", { name }).first().boundingBox();
    expect(box, String(name)).not.toBeNull();
    if (!box) return;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height);
  }
  expect(await smallTargets(page.getByRole("main"))).toEqual([]);
}

/** The scroll region is never squeezed below one hit target, and never scrolls sideways. */
async function expectRegionRoom(page: Page, name: string) {
  const region = page.getByRole("region", { name });
  const hit = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hit-min")),
  );
  expect((await region.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(hit);
  expect(await region.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
}

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test(`weekly_each_step_fits_${at}`, async ({ page }) => {
    await startWeekly(page, "reviewWeekly", size);
    await expect(page.getByText("Last week you chose: Stop work by five")).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expectFits(page, size);
    // The look-back scrolls inside its region and never widens it.
    const region = page.getByRole("region", { name: "Look back" });
    expect(await region.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

    await press(page, next(page));
    await expect(page.getByRole("heading", { name: "One improvement", level: 1 })).toBeFocused();
    await expect(page.getByRole("button", { name: "Not now" })).toBeVisible();
    await expectFits(page, size);
    await expectRegionRoom(page, "One improvement");

    await press(page, next(page));
    await expect(page.getByRole("heading", { name: "Priorities", level: 1 })).toBeFocused();
    await expectFits(page, size);
    await expectRegionRoom(page, "Priorities");

    await press(page, next(page));
    await expect(page.getByRole("heading", { name: "Week planned.", level: 1 })).toBeAttached();
    await expect(page.getByRole("button", { name: "Back to Review" })).toBeFocused();
    await expectFits(page, size);
  });

  test(`weekly_three_pickers_fit_${at}`, async ({ page }) => {
    await startWeekly(page, "reviewWeekly", size);
    await press(page, next(page));
    await press(page, next(page));
    await expect(page.getByRole("heading", { name: "Priorities", level: 1 })).toBeFocused();
    for (const n of [1, 2, 3]) {
      const slot = page.getByRole("button", { name: `Add priority ${n}` });
      await slot.scrollIntoViewIfNeeded();
      await press(page, slot);
      // The first title is long: it truncates inside the column instead of widening the region.
      await page.keyboard.type(n === 1 ? "A long priority ".repeat(8) : `Priority ${n}`);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
    }
    await expect(page.getByRole("button", { name: /^Task: Priority 3/ })).toBeAttached();
    await expect(page.getByRole("button", { name: /^Add priority/ })).toHaveCount(0);
    await expectFits(page, size);
    await expectRegionRoom(page, "Priorities");
  });

  test(`weekly_picker_panel_stays_in_the_region_${at}`, async ({ page }) => {
    await startWeekly(page, "reviewWeekly", size);
    await press(page, next(page));
    await press(page, next(page));
    for (const n of [1, 2]) {
      const slot = page.getByRole("button", { name: `Add priority ${n}` });
      await press(page, slot);
      await page.keyboard.type(`Priority ${n}`);
      await page.keyboard.press("Enter");
    }
    await press(page, page.getByRole("button", { name: "Add priority 3" }));
    await page.keyboard.press("ArrowDown");
    const panel = page.locator('[data-slot="task-picker-panel"]');
    await expect(panel).toBeVisible();
    const region = await page.getByRole("region", { name: "Priorities" }).boundingBox();
    const box = await panel.boundingBox();
    expect(region).not.toBeNull();
    expect(box).not.toBeNull();
    if (!region || !box) return;
    expect(box.y).toBeGreaterThanOrEqual(region.y - 1);
    expect(box.y + box.height).toBeLessThanOrEqual(region.y + region.height + 1);
  });

  test(`weekly_failed_saves_keep_their_lines_in_view_${at}`, async ({ page }) => {
    await startWeekly(page, "reviewWeeklySaveFails", size);
    await press(page, next(page));
    await press(page, next(page));
    const line = page.getByText("Orasenda can't save your reflection right now.");
    await expect(line).toBeVisible();
    await expectFits(page, size);
    await press(page, page.getByRole("button", { name: "Not now" }));
    await expect(page.getByRole("heading", { name: "Priorities", level: 1 })).toBeFocused();
    const slot = page.getByRole("button", { name: "Add priority 1" });
    await press(page, slot);
    await page.keyboard.type("x".repeat(201));
    await page.keyboard.press("Enter");
    await press(page, next(page));
    const tooLong = page.getByText("Keep a priority to 200 characters.");
    await expect(tooLong).toBeVisible();
    await expectFits(page, size);
    await expectRegionRoom(page, "Priorities");
  });
}

test("weekly_quiet_week_fits_at_the_minimum", async ({ page }) => {
  await startWeekly(page, "reviewWeeklyEmpty", SIZES[0] as Size);
  await expect(page.getByText("Nothing recorded this week.")).toBeVisible();
  await expectFits(page, SIZES[0] as Size);
});

test("weekly_primary_shows_a_focus_ring_and_reduce_motion_changes_steps_at_once", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startWeekly(page, "reviewWeekly", { width: 900, height: 600 });
  await next(page).focus();
  await expectFocusRingVisible(next(page));
  await press(page, next(page));
  const body = page.locator('[data-slot="flow-step-body"]');
  const duration = await body.evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(Number.parseFloat(duration)).toBe(0);
});
