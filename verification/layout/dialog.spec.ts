import { expect, test } from "@playwright/test";
import { smallTargets } from "./support/hitTargets.ts";
import { shoot } from "./support/shots.ts";
import { openSpecimen } from "./support/specimen.ts";

const OPEN = "Open a confirmation";

test("dialog_opens_named_with_cancel_focused_and_closes_on_escape", async ({ page }, info) => {
  await openSpecimen(page, "Dialog");
  const opener = page.getByRole("button", { name: OPEN });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Save this preset?" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  expect(await smallTargets(dialog)).toEqual([]);
  await shoot(page, info, "dialog");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("dialog_backdrop_click_never_dismisses", async ({ page }, info) => {
  await openSpecimen(page, "Dialog");
  await page.getByRole("button", { name: "Open a destructive confirmation" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete all tracking data?" });
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).toBeVisible();
  await shoot(page, info, "dialog-destructive");
});

test("dialog_plain_backdrop_click_never_dismisses", async ({ page }) => {
  await openSpecimen(page, "Dialog");
  await page.getByRole("button", { name: OPEN }).click();
  const dialog = page.getByRole("dialog", { name: "Save this preset?" });
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).toBeVisible();
});

test("dialog_keeps_a_gutter_in_a_short_viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 300 });
  await openSpecimen(page, "Dialog");
  await page.getByRole("button", { name: OPEN }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const r = await dialog.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, vh: document.documentElement.clientHeight };
  });
  expect(r.top).toBeGreaterThanOrEqual(11);
  expect(r.bottom).toBeLessThanOrEqual(r.vh - 11);
});

test("dialog_keeps_focus_inside_while_open", async ({ page }) => {
  await openSpecimen(page, "Dialog");
  await page.getByRole("button", { name: OPEN }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Alt+Tab");
    const inside = await page.evaluate(
      () => !!document.activeElement?.closest("[data-slot=dialog-content]"),
    );
    expect(inside).toBe(true);
  }
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`dialog_fits_and_stays_in_range_at_${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await openSpecimen(page, "Dialog");
    await page.getByRole("button", { name: OPEN }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        vw: document.documentElement.clientWidth,
        vh: document.documentElement.clientHeight,
      };
    });
    // Capped at the 420px panel width, and always inside the window with a gutter.
    expect(box.width).toBeLessThanOrEqual(421);
    expect(box.width).toBeGreaterThanOrEqual(Math.min(340, box.vw - 24 - 1));
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(box.vw);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.vh);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      box.vw,
    );
    await shoot(page, testInfo, `dialog-${viewport.width}x${viewport.height}`);
  });
}
