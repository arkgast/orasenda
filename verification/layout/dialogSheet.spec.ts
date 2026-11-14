import { expect, test } from "@playwright/test";
import { openSpecimen } from "./support/specimen.ts";

const SIZES = [
  { width: 1440, height: 900, columns: 2 },
  { width: 900, height: 600, columns: 2 },
  { width: 640, height: 480, columns: 2 },
  { width: 390, height: 844, columns: 1 },
];

for (const size of SIZES) {
  test(`dialog_sheet_fits_at_${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openSpecimen(page, "Dialog");
    await page.getByRole("button", { name: "Open a task sheet" }).click();
    const dialog = page.getByRole("dialog", { name: "Write the report" });
    await expect(dialog).toBeVisible();
    const m = await dialog.evaluate((el) => {
      const root = getComputedStyle(document.documentElement);
      const r = el.getBoundingClientRect();
      const fields = [...el.querySelectorAll("select")]
        .map((f) => Math.round(f.getBoundingClientRect().left))
        .filter((x, i, a) => a.indexOf(x) === i);
      return {
        width: r.width,
        left: r.left,
        sheet: Number.parseFloat(root.getPropertyValue("--sheet-width")),
        space3: Number.parseFloat(root.getPropertyValue("--space-3")),
        columns: fields.length,
        fields,
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(m.width).toBeLessThanOrEqual(m.sheet + 0.5);
    expect(m.left).toBeGreaterThanOrEqual(m.space3 - 0.5);
    expect(m.columns, JSON.stringify(m.fields)).toBe(size.columns);
    expect(m.sideways).toBeLessThanOrEqual(0);
  });
}
