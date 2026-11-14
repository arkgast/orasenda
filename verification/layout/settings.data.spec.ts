import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";

const SIZES = [
  { width: 360, height: 640 },
  { width: 900, height: 600 },
];

async function expectFits(page: Page, size: { width: number; height: number }) {
  const m = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
    region: (() => {
      const el = document.querySelector("[data-slot=scroll-region]");
      return el ? el.scrollWidth - el.clientWidth : 0;
    })(),
  }));
  expect(m.w, "no sideways scroll").toBeLessThanOrEqual(size.width);
  expect(m.h, "no document scroll").toBeLessThanOrEqual(size.height);
  expect(m.region, "the pane does not scroll sideways").toBeLessThanOrEqual(0);
}

async function expectTargets(page: Page, selector = "[data-slot=settings-row] button") {
  const small = await page.locator(selector).evaluateAll((buttons) =>
    buttons
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { name: el.textContent, w: r.width, h: r.height };
      })
      .filter((b) => b.w < 44 || b.h < 44),
  );
  expect(small, "targets are at least 44px").toEqual([]);
}

// The Playwright projects run every test in the light, dark and reduced-motion themes.
for (const size of SIZES) {
  {
    const at = `${size.width}x${size.height}`;

    test(`settings_data_rows_fit_${at}`, async ({ page }) => {
      await openApp(page, "yourDataLong", size, { page: "settings", pane: "Your data" });
      await page.getByRole("button", { name: "Import data…" }).click();
      await expect(page.locator("[data-slot=settings-row] [role=status]")).toHaveText(
        /newer Orasenda/,
      );
      await expectFits(page, size);
      await expectTargets(page);
      const labels = await page.locator("[data-slot=settings-row-label]").allTextContents();
      expect(labels).toEqual(["Stored", "Data folder", "Move data", "Start over"]);
      const last = page.getByRole("button", { name: "Delete all data…" });
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeVisible();
      expect(await page.locator('[data-variant="primary"]').count()).toBe(0);
    });

    test(`settings_data_dialog_fits_${at}`, async ({ page }) => {
      await openApp(page, "yourData", size, { page: "settings", pane: "Your data" });
      await page.getByRole("button", { name: "Delete all data…" }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await expectTargets(page, "[role=alertdialog] button");
      const box = await dialog.boundingBox();
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(size.width);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Delete all data…" })).toBeFocused();
    });
  }
}

test("settings_data_unavailable_disables_export_and_import", async ({ page }) => {
  await openApp(page, "yourDataUnavailable", SIZES[1], { page: "settings", pane: "Your data" });
  await expect(page.getByText("Unavailable until Orasenda can open its data.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export data…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Import data…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Show in Finder" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Delete all data…" })).toBeEnabled();
});
