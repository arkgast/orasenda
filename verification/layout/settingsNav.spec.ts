import { expect, test } from "@playwright/test";
import { overflows } from "./support/fits.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";
import { frames, openSpecimen, pressTab } from "./support/specimen.ts";

for (const theme of ["light", "dark"] as const) {
  test(`settings_nav_fits_compact_${theme}`, async ({ page }) => {
    await openSpecimen(page, "SettingsNav", { theme });
    const all = frames(page);
    expect(await all.count()).toBe(4);
    for (let i = 0; i < 4; i++) {
      // The strip scrolls sideways by design; nothing else may overflow.
      const reported = await overflows(all.nth(i));
      expect(
        reported.filter(
          (line) => !(line.startsWith("settings-nav-horizontal") && line.includes(": ul.m-0 (")),
        ),
      ).toEqual([]);
      const small = await smallTargets(all.nth(i));
      expect(small).toEqual([]);
    }
    const vertical = page.locator(
      "[data-state=settings-nav-vertical] [data-slot=settings-nav-item]",
    );
    expect(await vertical.count()).toBe(7);
    const box = await vertical.first().boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });
}

test("settings_nav_edge_buttons_scroll", async ({ page }) => {
  await openSpecimen(page, "SettingsNav");
  const frame = page.locator("[data-state=settings-nav-horizontal-400]");
  const strip = frame.locator("[data-slot=settings-nav-strip]");
  const more = frame.getByRole("button", { name: "More panes" });
  await expect(more).toBeVisible();
  await expect(frame.getByRole("button", { name: "Earlier panes" })).toBeHidden();
  expect(await more.getAttribute("tabindex")).toBe("-1");
  await more.click();
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(frame.getByRole("button", { name: "Earlier panes" })).toBeVisible();
  // At 900 wide everything fits and neither button shows.
  const wide = page.locator("[data-state=settings-nav-horizontal-900]");
  await expect(wide.getByRole("button", { name: "More panes" })).toBeHidden();
});

test("settings_nav_focus_ring", async ({ page }) => {
  await openSpecimen(page, "SettingsNav");
  const frame = page.locator("[data-state=settings-nav-vertical]");
  await pressTab(page);
  const item = frame.locator("[data-slot=settings-nav-item]:focus");
  await expect(item).toHaveCount(1);
  await expectFocusRingVisible(item);
});

test("settings_nav_focus_ring_horizontal", async ({ page }) => {
  await openSpecimen(page, "SettingsNav");
  const frame = page.locator("[data-state=settings-nav-horizontal-400]");
  const items = frame.locator("[data-slot=settings-nav-item]");
  await items.first().focus();
  await page.keyboard.press("ArrowRight");
  await expectFocusRingVisible(frame.locator("[data-slot=settings-nav-item]:focus"));
  await page.keyboard.press("End");
  await expectFocusRingVisible(frame.locator("[data-slot=settings-nav-item]:focus"));
});
