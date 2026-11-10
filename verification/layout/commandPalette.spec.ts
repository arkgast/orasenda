import { expect, test } from "@playwright/test";
import { smallTargets } from "./support/hitTargets.ts";
import { shoot } from "./support/shots.ts";
import { openSpecimen } from "./support/specimen.ts";

const OPEN = "Open the command palette";

test("command_palette_opens_named_with_search_focused_and_closes_on_escape", async ({
  page,
}, info) => {
  await openSpecimen(page, "CommandPalette");
  const opener = page.getByRole("button", { name: OPEN });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Commands" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Search commands" })).toBeFocused();
  expect(await smallTargets(dialog)).toEqual([]);
  await shoot(page, info, "command-palette");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("command_palette_arrows_move_and_enter_runs", async ({ page }) => {
  await openSpecimen(page, "CommandPalette");
  await page.getByRole("button", { name: OPEN }).click();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { selected: true })).toContainText("Pause");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Ran pause")).toBeVisible();
});

test("command_palette_typing_filters_and_empty_state_speaks", async ({ page }) => {
  await openSpecimen(page, "CommandPalette");
  await page.getByRole("button", { name: OPEN }).click();
  await page.keyboard.type("capt");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.type("zzz");
  await expect(page.getByRole("status")).toContainText("No matching commands");
});

test("command_palette_backdrop_click_never_dismisses", async ({ page }) => {
  await openSpecimen(page, "CommandPalette");
  await page.getByRole("button", { name: OPEN }).click();
  await page.mouse.click(2, 2);
  await expect(page.getByRole("dialog", { name: "Commands" })).toBeVisible();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
  { width: 390, height: 300 },
]) {
  test(`command_palette_fits_at_${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await openSpecimen(page, "CommandPalette");
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
    expect(box.width).toBeLessThanOrEqual(421);
    expect(box.width).toBeGreaterThanOrEqual(Math.min(340, box.vw - 24 - 1));
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(box.vw);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.vh);
    await shoot(page, testInfo, `command-palette-${viewport.width}x${viewport.height}`);
  });
}
