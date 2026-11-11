import { expect, test } from "@playwright/test";
import { APP_URL, openApp } from "./support/app.ts";

const SIZES = [
  { width: 360, height: 240 },
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
];
const PANEL = '[data-slot="popover-menu"]';

// With the popover open (the harness's `popover=1`), the panel stays inside the window and the
// document does not scroll, idle and running.
for (const scenario of ["idle", "running"]) {
  for (const size of SIZES) {
    test(`today_popover_fits_${scenario}_${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto(`${APP_URL}/layout.html?scenario=${scenario}&popover=1`);
      const panel = page.locator(PANEL);
      await panel.waitFor();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const box = await panel.boundingBox();
      if (!box) throw new Error("the popover has no box");
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      const scrolls = await page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollHeight > root.clientHeight || root.scrollWidth > root.clientWidth;
      });
      expect(scrolls).toBe(false);
    });
  }
}

test("today_popover_opens_from_the_keyboard", async ({ page }) => {
  await openApp(page, "idle", { width: 900, height: 600 });
  await page.getByRole("button", { name: /^Preset Classic/ }).press("Enter");
  await expect(page.getByRole("menu", { name: "Preset for the next session" })).toBeVisible();
});
