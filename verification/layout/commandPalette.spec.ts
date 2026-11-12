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

test("command_palette_keeps_focus_inside_while_open", async ({ page }) => {
  await openSpecimen(page, "CommandPalette");
  await page.getByRole("button", { name: OPEN }).click();
  await expect(page.getByRole("dialog", { name: "Commands" })).toBeVisible();
  // WebKit skips buttons on plain Tab, so use Alt+Tab (as the Dialog spec does).
  await page.keyboard.press("Alt+Tab");
  await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Alt+Tab");
    const inside = await page.evaluate(
      () => !!document.activeElement?.closest("[data-slot=dialog-content]"),
    );
    expect(inside).toBe(true);
  }
});

const OPEN_COMPACT = "Open the compact command palette";

test("command_palette_compact_fits_360x240", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 240 });
  await openSpecimen(page, "CommandPalette");
  await page.getByRole("button", { name: OPEN_COMPACT }).click();
  const dialog = page.getByRole("dialog", { name: "Commands" });
  await expect(dialog).toBeVisible();
  const box = await dialog.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      vw: document.documentElement.clientWidth,
      vh: document.documentElement.clientHeight,
    };
  });
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(box.vw);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(box.vh);
  // The title and label are hidden; the field and Close share one line.
  const title = await dialog.getByRole("heading", { name: "Commands" }).boundingBox();
  expect(title ? title.width * title.height : 0).toBeLessThanOrEqual(1);
  const field = await page.getByRole("combobox", { name: "Search commands" }).boundingBox();
  const close = await page.getByRole("button", { name: "Close" }).boundingBox();
  expect(field && close && Math.abs(field.y - close.y) < field.height).toBe(true);
  expect(close ? close.x : 0).toBeGreaterThan(field ? field.x + field.width - 1 : 0);
  // The list scrolls inside the panel instead of pushing it off the window.
  const list = dialog.getByRole("listbox");
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await shoot(page, info, "command-palette-compact-360x240");
});

test("long_command_wraps_without_hiding_kbd", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSpecimen(page, "CommandPalette");
  await page.getByRole("button", { name: OPEN }).click();
  const row = page.getByRole("option", { name: /Change the length of every focus session/ });
  await row.scrollIntoViewIfNeeded();
  const kbd = row.locator('[data-slot="kbd"]');
  await expect(kbd).toBeVisible();
  const measured = await row.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const k = el.querySelector('[data-slot="kbd"]')?.getBoundingClientRect();
    const label = el.querySelector("span span")?.getBoundingClientRect();
    return {
      rowRight: r.right,
      kbdRight: k?.right ?? 0,
      kbdLeft: k?.left ?? 0,
      labelRight: label?.right ?? 0,
    };
  });
  expect(measured.kbdRight).toBeLessThanOrEqual(measured.rowRight);
  expect(measured.labelRight).toBeLessThanOrEqual(measured.kbdLeft);
  const box = await row.boundingBox();
  // Wrapped onto several lines, so it is taller than one hit-min row.
  expect(box?.height).toBeGreaterThan(60);
});

test("palette_rows_and_close_meet_hit_min", async ({ page }) => {
  for (const [opener, viewport] of [
    [OPEN, { width: 1440, height: 900 }],
    [OPEN_COMPACT, { width: 360, height: 240 }],
  ] as const) {
    await page.setViewportSize(viewport);
    await openSpecimen(page, "CommandPalette");
    await page.getByRole("button", { name: opener }).click();
    const dialog = page.getByRole("dialog", { name: "Commands" });
    await expect(dialog).toBeVisible();
    expect(await smallTargets(dialog)).toEqual([]);
    for (const row of await dialog.getByRole("option").all()) {
      expect((await row.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    const close = await page.getByRole("button", { name: "Close" }).boundingBox();
    expect(close?.width).toBeGreaterThanOrEqual(44);
    expect(close?.height).toBeGreaterThanOrEqual(44);
  }
});

test("command_palette_list_is_one_tab_stop_in_the_browser", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 240 });
  await openSpecimen(page, "CommandPalette");
  await page.getByRole("button", { name: OPEN_COMPACT }).click();
  await expect(page.getByRole("combobox", { name: "Search commands" })).toBeFocused();
  await page.keyboard.press("Alt+Tab");
  await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
  // Two stops only: the next press leaves Close and the list's rows never take focus.
  await page.keyboard.press("Alt+Tab");
  const rows = await page.evaluate(
    () => !!document.activeElement?.closest("[cmdk-item], [role=option]"),
  );
  expect(rows).toBe(false);
  expect(await page.locator("[role=option][tabindex]").count()).toBe(0);
});
