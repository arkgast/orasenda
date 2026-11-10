import { expect, test } from "@playwright/test";
import { shoot } from "./support/shots.ts";
import { openSpecimen, pressTab } from "./support/specimen.ts";

const PANEL = ".os-tooltip-panel";

test("tooltip_40ch_two_lines_kbd_unbroken", async ({ page }, info) => {
  await openSpecimen(page, "Tooltip");
  await page.getByRole("button", { name: /Jump to section/ }).hover();
  const panel = page.locator(PANEL);
  await expect(panel).toBeVisible();
  const m = await panel.evaluate((p) => {
    const label = p.querySelector(".os-tooltip-label") as HTMLElement;
    const kbd = p.querySelector(".os-kbd") as HTMLElement;
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;width:40ch;font:inherit";
    p.appendChild(probe);
    const ch = probe.getBoundingClientRect().width / 40;
    probe.remove();
    const line = Number.parseFloat(getComputedStyle(label).lineHeight);
    return {
      lines: Math.round(label.getBoundingClientRect().height / line),
      width: p.getBoundingClientRect().width,
      maxWidth: ch * 40,
      kbdRects: kbd.getClientRects().length,
      kbdLines: Math.round(kbd.getBoundingClientRect().height / line),
    };
  });
  expect(m.lines).toBe(2);
  expect(m.width).toBeLessThanOrEqual(m.maxWidth + 1);
  expect(m.kbdRects).toBe(1);
  expect(m.kbdLines).toBeLessThanOrEqual(1);
  await shoot(page, info, "tooltip");
});

test("tooltip_visible_above_open_dialog", async ({ page }) => {
  await openSpecimen(page, "Tooltip");
  await page.getByRole("button", { name: "Open dialog" }).click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "End session" }).hover();
  const panel = dialog.locator(PANEL);
  await expect(panel).toBeVisible();
  const r = await panel.evaluate((p) => {
    const b = p.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return {
      inside: !!hit && p.contains(hit),
      fits:
        b.left >= 0 &&
        b.top >= 0 &&
        b.right <= document.documentElement.clientWidth &&
        b.bottom <= document.documentElement.clientHeight,
    };
  });
  expect(r.inside).toBe(true);
  expect(r.fits).toBe(true);
});

test("tooltip_keyboard_path_focus_shows_esc_hides", async ({ page }) => {
  await openSpecimen(page, "Tooltip");
  await pressTab(page);
  const first = page.locator(":focus");
  await expect(page.locator(PANEL)).toContainText("Change preset");
  await page.keyboard.press("Escape");
  await expect(page.locator(PANEL)).toHaveCount(0);
  await expect(first).toBeFocused();
  await pressTab(page);
  await expect(page.locator(PANEL)).toContainText("Jump to section");
});

test("tooltip_not_shown_on_programmatic_focus", async ({ page }) => {
  await openSpecimen(page, "Tooltip");
  await page.mouse.click(2, 2);
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>("button[aria-keyshortcuts]")?.focus();
  });
  await page.waitForTimeout(400);
  await expect(page.locator(PANEL)).toHaveCount(0);

  // Focus restored by script when a dialog closes shows nothing either.
  await page.getByRole("button", { name: "Open dialog" }).click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>("button[aria-keyshortcuts]")?.focus();
  });
  await page.waitForTimeout(400);
  await expect(page.locator(PANEL)).toHaveCount(0);
});
