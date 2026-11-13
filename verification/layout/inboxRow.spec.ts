import { expect, test } from "@playwright/test";
import { openSpecimen } from "./support/specimen.ts";

for (const theme of ["light", "dark"] as const) {
  test(`inbox_row_long_text_wraps_${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await openSpecimen(page, "InboxRow", { theme });
    for (const [state, width] of [
      ["inbox-row-long-360", 360],
      ["inbox-row-long-900", 900],
    ] as const) {
      const frame = page.locator(`[data-state="${state}"]`);
      const row = frame.locator('[data-slot="inbox-row"]');
      const text = row.locator("p").first();
      expect((await text.textContent())?.length, state).toBe(1000);
      const box = await row.boundingBox();
      expect(box?.width, state).toBeLessThanOrEqual(width + 0.5);
      // Nothing scrolls sideways, and the full text shows: the paragraph is taller than one line.
      expect(
        await row.evaluate((el) => el.scrollWidth - el.clientWidth),
        state,
      ).toBeLessThanOrEqual(0);
      expect(
        await text.evaluate((el) => el.scrollWidth - el.clientWidth),
        state,
      ).toBeLessThanOrEqual(0);
      const textBox = await text.boundingBox();
      expect(textBox?.height, state).toBeGreaterThan(60);
      const button = row.getByRole("button");
      const target = await button.boundingBox();
      expect(target?.width, state).toBeGreaterThanOrEqual(44);
      expect(target?.height, state).toBeGreaterThanOrEqual(44);
      const textColumn = await text.locator("xpath=..").boundingBox();
      expect(
        (target?.x ?? 0) - ((textColumn?.x ?? 0) + (textColumn?.width ?? 0)),
        `${state} text-to-button gap`,
      ).toBeGreaterThanOrEqual(8);
      const rowBox = await row.boundingBox();
      expect((target?.x ?? 0) + (target?.width ?? 0), state).toBeLessThanOrEqual(
        (rowBox?.x ?? 0) + (rowBox?.width ?? 0) + 0.5,
      );
    }
  });
}

test("inbox_row_kind_words_visible", async ({ page }) => {
  await openSpecimen(page, "InboxRow");
  await expect(page.locator('[data-state="inbox-row-internal"]')).toContainText("Internal");
  await expect(page.locator('[data-state="inbox-row-external"]')).toContainText("External");
});
