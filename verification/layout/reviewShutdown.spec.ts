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

async function startShutdown(page: Page, scenario: string, size: Size) {
  await openApp(page, scenario, size);
  await page.keyboard.press("Meta+6");
  await expect(page.getByRole("heading", { name: "Review", level: 1 })).toBeAttached();
  await press(page, page.getByRole("button", { name: "Start shutdown" }).first());
  await expect(page.getByRole("heading", { name: "Unfinished tasks", level: 1 })).toBeFocused();
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

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test(`shutdown_each_step_fits_${at}`, async ({ page }) => {
    await startShutdown(page, "reviewShutdown", size);
    await expect(page.getByText("In progress")).toBeVisible();
    await expect(page.locator('[data-variant="primary"]')).toHaveCount(1);
    await expectFits(page, size);
    // The longest title wraps inside the region instead of widening it.
    const region = page.getByRole("region", { name: "Unfinished tasks" });
    expect(await region.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

    await press(page, next(page));
    await expect(page.getByRole("heading", { name: "Tomorrow", level: 1 })).toBeFocused();
    await expectFits(page, size);
    const tomorrow = page.getByRole("region", { name: "Tomorrow" });
    expect(await tomorrow.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

    await press(page, next(page));
    await expect(page.getByRole("heading", { name: "Reflect", level: 1 })).toBeFocused();
    await expect(page.getByRole("button", { name: "Not now" })).toBeVisible();
    await expectFits(page, size);

    await press(page, next(page));
    await expect(
      page.getByRole("heading", { name: "Shutdown complete.", level: 1 }),
    ).toBeAttached();
    await expect(page.getByRole("button", { name: "Back to Review" })).toBeFocused();
    await expectFits(page, size);
  });

  test(`shutdown_toggle_and_toast_${at}`, async ({ page }) => {
    await startShutdown(page, "reviewShutdown", size);
    const toggle = page.getByRole("button", { name: "Back to Backlog Write notes" });
    await press(page, toggle);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    // The state is also in words.
    await expect(page.getByText("Doing · Goes to Backlog")).toBeVisible();
    await press(page, next(page));
    const toast = page.locator('[data-slot="toast"]');
    await expect(toast).toContainText("Moved 2 tasks to Backlog.");
    const box = await toast.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    // The toast sits inside the window, at the bottom centre, and the page still fits.
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    expect(await smallTargets(toast)).toEqual([]);
    // It never covers the step's own controls: each one is the top element at its centre.
    for (const name of [/^End/, /^Continue/]) {
      const hit = await page.getByRole("button", { name }).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return top === el || el.contains(top);
      });
      expect(hit, String(name)).toBe(true);
    }
    // Undo and Dismiss stay reachable by keyboard.
    const undo = page.getByRole("button", { name: "Undo" });
    await undo.focus();
    await expectFocusRingVisible(undo);
    await press(page, page.getByRole("button", { name: "Dismiss" }));
    await expect(toast).toHaveCount(0);
  });
}

test("shutdown_with_nothing_unfinished_fits_at_the_minimum", async ({ page }) => {
  await startShutdown(page, "reviewShutdownEmpty", SIZES[0] as Size);
  await expect(page.getByText("Nothing unfinished.")).toBeVisible();
  await expectFits(page, SIZES[0] as Size);
});

test("shutdown_primary_shows_a_focus_ring_and_reduce_motion_changes_steps_at_once", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startShutdown(page, "reviewShutdown", { width: 900, height: 600 });
  await next(page).focus();
  await expectFocusRingVisible(next(page));
  await press(page, next(page));
  const body = page.locator('[data-slot="flow-step-body"]');
  const duration = await body.evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(Number.parseFloat(duration)).toBe(0);
});
