import { expect, test } from "@playwright/test";
import { shoot } from "./support/shots.ts";
import { openSpecimen, pressTab } from "./support/specimen.ts";

const PANEL = "[data-slot=tooltip]";

test("tooltip_40ch_two_lines_kbd_unbroken", async ({ page }, info) => {
  await openSpecimen(page, "Tooltip");
  await page.getByRole("button", { name: /Jump to section/ }).hover();
  const panel = page.locator(PANEL);
  await expect(panel).toBeVisible();
  const m = await panel.evaluate((p) => {
    const label = p.querySelector("[data-slot=tooltip-label]") as HTMLElement;
    const kbd = p.querySelector("[data-slot=kbd]") as HTMLElement;
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
  const dialog = page.getByRole("dialog");
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
});

test("tooltip_trigger_focus_restored_after_dialog_shows_nothing", async ({ page }) => {
  await openSpecimen(page, "Tooltip");
  const opener = page.getByRole("button", { name: "Open dialog", exact: true });
  // Reach the opener by keyboard (its tooltip may show), open the dialog; focus leaves the opener.
  await page.mouse.click(2, 2);
  await pressTab(page);
  await pressTab(page);
  await pressTab(page);
  await expect(opener).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.waitForTimeout(400);
  await expect(page.locator(PANEL)).toHaveCount(0);
});

test("tooltip_esc_inside_dialog_hides_tip_and_keeps_dialog", async ({ page }) => {
  await openSpecimen(page, "Tooltip");
  await page.getByRole("button", { name: "Open dialog", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const inner = dialog.getByRole("button", { name: "End session" });
  await inner.focus();
  await pressTab(page);
  await page.keyboard.press("Shift+Alt+Tab");
  await expect(inner).toBeFocused();
  await expect(page.locator(PANEL)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(PANEL)).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(inner).toBeFocused();
});

test("tooltip_inside_native_dialog_is_visible", async ({ page }) => {
  await openSpecimen(page, "Tooltip");
  await page.getByRole("button", { name: "Open native dialog" }).click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Native tip" }).hover();
  const panel = dialog.locator(PANEL);
  await expect(panel).toBeVisible();
  const inside = await panel.evaluate((p) => {
    const b = p.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return !!hit && p.contains(hit);
  });
  expect(inside).toBe(true);
});

test("escape_closes_only_topmost_layer", async ({ page }) => {
  await openSpecimen(page, "Tooltip");
  await page.getByRole("button", { name: "Open native dialog" }).click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  const inner = dialog.getByRole("button", { name: "Native tip" });
  await inner.focus();
  await pressTab(page);
  await page.keyboard.press("Shift+Alt+Tab");
  await expect(inner).toBeFocused();
  await expect(dialog.locator(PANEL)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog.locator(PANEL)).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-cancels", "0");
  await expect(inner).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`tooltip_stays_inside_the_viewport_at_${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openSpecimen(page, "Tooltip");
    await page.getByRole("button", { name: /Jump to section/ }).hover();
    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible();
    const r = await panel.evaluate((p) => {
      const b = p.getBoundingClientRect();
      return {
        left: b.left,
        right: b.right,
        top: b.top,
        bottom: b.bottom,
        vw: document.documentElement.clientWidth,
        vh: document.documentElement.clientHeight,
        lines: Math.round(
          (p.querySelector("[data-slot=tooltip-label]") as HTMLElement).getBoundingClientRect()
            .height / Number.parseFloat(getComputedStyle(p).lineHeight),
        ),
      };
    });
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.right).toBeLessThanOrEqual(r.vw);
    expect(r.bottom).toBeLessThanOrEqual(r.vh);
    expect(r.lines).toBeLessThanOrEqual(2);
  });
}
