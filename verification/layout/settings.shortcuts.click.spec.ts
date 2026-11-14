import { expect, test } from "@playwright/test";
import { openApp } from "./support/app.ts";

// #506: WebKit (Safari, WKWebView) doesn't focus a <button> on a mouse click. The recorder must
// still hear the keys typed after a click, and only one recorder may record at a time. Keys go
// through page.keyboard: locator.press() would focus the field first and hide the bug.

const SIZE = { width: 1440, height: 900 };
const ROW = "#keyboard-startPause";

test("settings_shortcuts_a_clicked_recorder_hears_the_keys", async ({ page }) => {
  await openApp(page, "idle", SIZE, { page: "settings", pane: "Shortcuts" });
  const field = page.locator(`${ROW}-app-field`);
  await field.scrollIntoViewIfNeeded();
  await field.click();
  await expect(field).toHaveAttribute("data-recording", "true");
  await expect(field, "the click gives the field focus").toBeFocused();
  // A plain key reaches the recorder: its polite line asks for a modifier.
  await page.keyboard.press("u");
  await expect(page.locator(`${ROW}-app-field-message`)).toContainText("Add ⌘ or ⌃");
  // A chord is recorded, which ends recording.
  await page.keyboard.press("Control+Shift+KeyY");
  await expect(field).not.toHaveAttribute("data-recording", "true");
});

test("settings_shortcuts_one_recorder_records_at_a_time", async ({ page }) => {
  await openApp(page, "idle", SIZE, { page: "settings", pane: "Shortcuts" });
  const app = page.locator(`${ROW}-app-field`);
  const global = page.locator(`${ROW}-global-field`);
  await app.scrollIntoViewIfNeeded();
  await app.click();
  await expect(app).toHaveAttribute("data-recording", "true");
  await global.click();
  await expect(global).toHaveAttribute("data-recording", "true");
  await expect(app, "starting one recorder stops the other").not.toHaveAttribute(
    "data-recording",
    "true",
  );
  await expect(page.locator('[data-recording="true"]')).toHaveCount(1);
  // Esc ends the one that records.
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-recording="true"]')).toHaveCount(0);
});
