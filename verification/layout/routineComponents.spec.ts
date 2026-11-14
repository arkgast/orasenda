import { expect, test } from "@playwright/test";
import { expectVisibleFits } from "./support/fitsVisible.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";
import { frames, openSpecimen, pressTab } from "./support/specimen.ts";

for (const theme of ["light", "dark"] as const) {
  test(`day_picker_days_meet_hit_min_and_fit_${theme}`, async ({ page }) => {
    await openSpecimen(page, "DayPicker", { theme });
    const all = frames(page);
    expect(await all.count()).toBeGreaterThan(0);
    for (let i = 0; i < (await all.count()); i++) {
      expect(await smallTargets(all.nth(i))).toEqual([]);
      await expectVisibleFits(all.nth(i));
    }
  });

  test(`routine_step_fits_its_frames_${theme}`, async ({ page }) => {
    await openSpecimen(page, "RoutineStep", { theme });
    const all = frames(page);
    expect(await all.count()).toBeGreaterThan(0);
    for (let i = 0; i < (await all.count()); i++) await expectVisibleFits(all.nth(i));
  });
}

test("day_picker_keyboard_focus_rings_each_day", async ({ page }) => {
  await openSpecimen(page, "DayPicker");
  await pressTab(page);
  const active = page.locator(":focus");
  await expect(active).toHaveAttribute("data-slot", "day-picker-day");
  await expectFocusRingVisible(active);
});

test("day_picker_on_and_off_differ_in_more_than_colour", async ({ page }) => {
  await openSpecimen(page, "DayPicker");
  const frame = page.locator('[data-frame][data-state="day-picker-weekdays"]');
  const weight = (name: string) =>
    frame.getByRole("button", { name }).evaluate((el) => getComputedStyle(el).fontWeight);
  expect(Number(await weight("Monday"))).toBeGreaterThan(Number(await weight("Saturday")));
});
