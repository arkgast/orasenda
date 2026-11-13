import { expect, test } from "@playwright/test";
import { openSpecimen } from "./support/specimen.ts";

for (const theme of ["light", "dark"] as const) {
  test(`shortcut_list_fits_panel_width_${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await openSpecimen(page, "ShortcutList", { theme });
    const panel = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.width = "var(--panel-width)";
      document.body.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    });
    expect(panel).toBeGreaterThan(0);
    for (const state of ["shortcut-list-panel", "shortcut-list-wide", "shortcut-list-narrow"]) {
      const frame = page.locator(`[data-state="${state}"]`);
      const table = frame.locator('[data-slot="shortcut-list"]');
      const box = await table.boundingBox();
      const frameBox = await frame.boundingBox();
      expect(box?.width, state).toBeLessThanOrEqual(panel + 0.5);
      expect(box?.width, state).toBeLessThanOrEqual((frameBox?.width ?? 0) + 0.5);
      const overflow = await table.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, state).toBeLessThanOrEqual(0);
      const rows = frame.locator('[data-slot="shortcut-list-row"]');
      await expect(rows.first()).toBeVisible();
      expect(await rows.count()).toBeGreaterThan(5);
    }
  });
}

test("shortcut_list_off_is_a_word", async ({ page }) => {
  await openSpecimen(page, "ShortcutList");
  const frame = page.locator('[data-state="shortcut-list-panel"]');
  await expect(frame.getByText("Off", { exact: true }).first()).toBeVisible();
});
