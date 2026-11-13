import { expect, test } from "@playwright/test";
import { shoot } from "./support/shots.ts";
import { openSpecimen } from "./support/specimen.ts";

const NAME = /Start or pause focus from anywhere/;

test("shortcut_recorder_keyboard_path", async ({ page }, info) => {
  await openSpecimen(page, "ShortcutRecorder");
  const live = page.locator('[data-state="shortcut-recorder-live"]');
  const field = live.getByRole("button", { name: NAME });
  await field.focus();
  await expect(field).toHaveAccessibleName(/Change/);
  await page.keyboard.press("Enter");
  await expect(field).toHaveAccessibleName(/Type keys, Esc cancels/);
  // Esc cancels and keeps the old keys.
  await page.keyboard.press("Escape");
  await expect(live).toContainText("Keys ⌃⌥F");
  await expect(field).toHaveAccessibleName(/Change/);
  // Space starts; a modifier alone records nothing; a chord records.
  await page.keyboard.press("Space");
  await page.keyboard.press("Shift");
  await expect(live).toContainText("Keys ⌃⌥F");
  await page.keyboard.press("Control+Shift+KeyP");
  await expect(live).toContainText("Keys ⌃⇧P");
  await expect(field).toHaveAccessibleName(/Control-Shift-P/);
  await shoot(page, info, "shortcut-recorder-recorded");
  // Delete turns it off.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Backspace");
  await expect(live).toContainText("Shortcut is off");
  await expect(field).toHaveAccessibleName(/None/);
  // Restore default.
  await live.getByRole("button", { name: "Restore default" }).click();
  await expect(live).toContainText("Keys ⌃⌥F");
});

test("shortcut_recorder_conflict_within_panel_width", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSpecimen(page, "ShortcutRecorder");
  const frame = page.locator('[data-state="shortcut-recorder-conflict"]');
  const root = frame.locator('[data-slot="shortcut-recorder"]');
  const line = frame.locator('[data-slot="field-error"]');
  await expect(line).toBeVisible();
  const panel = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.width = "var(--panel-width)";
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });
  expect(panel).toBeGreaterThan(0);
  for (const box of [await root.boundingBox(), await line.boundingBox()]) {
    expect(box?.width).toBeLessThanOrEqual(panel + 0.5);
  }
  const frameBox = await frame.boundingBox();
  const lineBox = await line.boundingBox();
  expect((lineBox?.x ?? 0) + (lineBox?.width ?? 0)).toBeLessThanOrEqual(
    (frameBox?.x ?? 0) + (frameBox?.width ?? 0) + 0.5,
  );
  await shoot(page, info, "shortcut-recorder-conflict");
});

test("shortcut_recorder_field_meets_hit_min_and_field_width", async ({ page }) => {
  await openSpecimen(page, "ShortcutRecorder");
  const field = page
    .locator('[data-state="shortcut-recorder-idle"]')
    .getByRole("button", { name: NAME });
  const box = await field.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(220);
});

test("shortcut_recorder_content_fits_each_frame", async ({ page }) => {
  await openSpecimen(page, "ShortcutRecorder");
  for (const name of ["live", "idle", "recording", "conflict", "off", "warning"]) {
    const frame = page.locator(`[data-state="shortcut-recorder-${name}"]`);
    const fit = await frame.evaluate((el) => {
      const outer = el.getBoundingClientRect();
      let bottom = 0;
      for (const child of Array.from(el.children)) {
        bottom = Math.max(bottom, child.getBoundingClientRect().bottom);
      }
      return outer.bottom - bottom;
    });
    expect(fit, name).toBeGreaterThanOrEqual(-0.5);
  }
});

test("shortcut_recorder_warning_orders_pick_another_first", async ({ page }, info) => {
  await openSpecimen(page, "ShortcutRecorder");
  const frame = page.locator('[data-state="shortcut-recorder-warning"]');
  const pick = frame.getByRole("button", { name: "Pick another" });
  const use = frame.getByRole("button", { name: "Use anyway" });
  // The later row-warning frame mounts last and holds page focus; the focused node is its own Pick another.
  await expect(
    page
      .locator('[data-state="shortcut-recorder-row-warning"]')
      .getByRole("button", { name: "Pick another" }),
  ).toBeFocused();
  const a = await pick.boundingBox();
  const b = await use.boundingBox();
  expect(a?.x ?? 0).toBeLessThan(b?.x ?? 0);
  expect(a?.height).toBeGreaterThanOrEqual(44);
  expect(b?.height).toBeGreaterThanOrEqual(44);
  await expect(frame.getByText("Other apps use this. Use it everywhere anyway?")).toBeVisible();
  await shoot(page, info, "shortcut-recorder-warning");
});

test("shortcut_recorder_row_has_two_named_recorders_side_by_side", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSpecimen(page, "ShortcutRecorder");
  const frame = page.locator('[data-state="shortcut-recorder-row"]');
  const app = frame.getByRole("button", { name: /Full screen, In Orasenda/ });
  const everywhere = frame.getByRole("button", { name: /Full screen, Everywhere None/ });
  await expect(app).toHaveAccessibleName(/Type keys/);
  await expect(everywhere).toBeVisible();
  const a = await app.boundingBox();
  const b = await everywhere.boundingBox();
  expect(a?.x ?? 0).toBeLessThan(b?.x ?? 0);
  expect(Math.abs((a?.y ?? 0) - (b?.y ?? 0))).toBeLessThan(1);
  await expect(frame.getByRole("button", { name: "Restore default" })).toHaveCount(0);
  // The field keeps its height while recording, and both fields line up at the 3A width.
  const rest = await frame.getByRole("button", { name: /Everywhere/ }).boundingBox();
  expect(a?.height).toBe(rest?.height);
  expect(a?.width ?? 0).toBeLessThanOrEqual(240);
  await shoot(page, info, "shortcut-recorder-row");
});

test("shortcut_recorder_row_warning_fits_frame", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSpecimen(page, "ShortcutRecorder");
  const frame = page.locator('[data-state="shortcut-recorder-row-warning"]');
  await expect(frame.getByRole("button", { name: "Pick another" })).toBeVisible();
  const fit = await frame.evaluate((el) => {
    const outer = el.getBoundingClientRect();
    let bottom = 0;
    for (const child of Array.from(el.querySelectorAll("*"))) {
      bottom = Math.max(bottom, child.getBoundingClientRect().bottom);
    }
    return outer.bottom - bottom;
  });
  expect(fit).toBeGreaterThanOrEqual(-0.5);
  await shoot(page, info, "shortcut-recorder-row-warning");
});

test("shortcut_recorder_message_row_keeps_its_height_at_3a_width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSpecimen(page, "ShortcutRecorder");
  const heights: number[] = [];
  for (const name of ["row-failed", "row-warning"]) {
    const frame = page.locator(`[data-state="shortcut-recorder-${name}"]`);
    for (const row of await frame.locator('[data-slot="shortcut-recorder-message"]').all()) {
      const box = await row.locator("..").boundingBox();
      heights.push(box?.height ?? 0);
    }
  }
  // At rest and with the warning question, the row is the same two lines tall.
  expect(new Set(heights.map((h) => Math.round(h))).size).toBe(1);
  // At 3A width Pick another stacks above Use anyway.
  const frame = page.locator('[data-state="shortcut-recorder-row-warning"]');
  const a = await frame.getByRole("button", { name: "Pick another" }).boundingBox();
  const b = await frame.getByRole("button", { name: "Use anyway" }).boundingBox();
  expect(a?.y ?? 0).toBeLessThan(b?.y ?? 0);
});

test("shortcut_recorder_row_voiceover_line_fits_frame", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSpecimen(page, "ShortcutRecorder");
  const frame = page.locator('[data-state="shortcut-recorder-row-voiceover"]');
  await expect(frame.getByText(/VoiceOver uses this key/)).toBeVisible();
  const fit = await frame.evaluate((el) => {
    let bottom = 0;
    for (const child of Array.from(el.querySelectorAll("*"))) {
      bottom = Math.max(bottom, child.getBoundingClientRect().bottom);
    }
    return el.getBoundingClientRect().bottom - bottom;
  });
  expect(fit).toBeGreaterThanOrEqual(-0.5);
});
