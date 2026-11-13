import { expect, test } from "@playwright/test";
import { openSpecimen } from "./support/specimen.ts";

const WIDTHS: Record<string, number> = {
  "data-table-presets-1-360": 360,
  "data-table-presets-12-360": 360,
  "data-table-presets-selection-360": 360,
  "data-table-presets-long-360": 360,
  "data-table-backups-12-360": 360,
  "data-table-backups-1-360": 360,
  "data-table-backups-newer-360": 360,
  "data-table-backups-empty-360": 360,
};

for (const theme of ["light", "dark"] as const) {
  test(`data_table_long_name_wraps_${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1600 });
    await openSpecimen(page, "DataTable", { theme });
    for (const state of Object.keys(WIDTHS)) {
      const f = page.locator(`[data-state="${state}"]`);
      const targets = f.locator('[data-slot="icon-button"], [data-slot="choice"]');
      for (let i = 0; i < (await targets.count()); i++) {
        const box = await targets.nth(i).boundingBox();
        expect(box?.width, state).toBeGreaterThanOrEqual(44);
        expect(box?.height, state).toBeGreaterThanOrEqual(44);
      }
    }
    const frame = page.locator('[data-state="data-table-presets-long-360"]');
    const name = frame.locator("tbody td").first();
    expect(await name.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    expect((await name.boundingBox())?.height).toBeGreaterThan(60);
    // The radio's label is its target (the input inside is the 14px mark).
    for (const slot of ["icon-button", "choice"]) {
      const targets = frame.locator(`[data-slot="${slot}"]`);
      for (let i = 0; i < (await targets.count()); i++) {
        const box = await targets.nth(i).boundingBox();
        expect(box?.width, slot).toBeGreaterThanOrEqual(44);
        expect(box?.height, slot).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test(`data_table_twelve_rows_no_overflow_${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 2400 });
    await openSpecimen(page, "DataTable", { theme });
    for (const [state, width] of Object.entries(WIDTHS)) {
      const frame = page.locator(`[data-state="${state}"]`);
      const table = frame.locator("table, [data-slot='data-table']").first();
      const box = await table.boundingBox();
      expect(box?.width, state).toBeLessThanOrEqual(width + 0.5);
      expect(
        await frame.evaluate((el) => el.scrollWidth - el.clientWidth),
        state,
      ).toBeLessThanOrEqual(0);
    }
    await expect(
      page.locator('[data-state="data-table-backups-12-360"] table > tbody'),
    ).toHaveCount(12);
  });

  test(`data_table_disabled_action_tooltip_${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 2400 });
    await openSpecimen(page, "DataTable", { theme });
    const frame = page.locator('[data-state="data-table-backups-newer-360"]');
    await frame.locator("button:disabled").first().hover({ force: true });
    await expect(page.locator("[data-slot='tooltip']")).toContainText("Restore the backup from");
  });
}
