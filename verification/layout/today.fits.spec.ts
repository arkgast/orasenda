import { expect, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { expectTodayFits, provoke, SIZES, STATES } from "./support/today.ts";

// #119 and #120: at the default window, Start stays fully visible after an end and with Deep Work saved.
for (const scenario of ["idle", "ended", "deepWorkChecked"]) {
  test(`today_start_visible_900x600_${scenario}`, async ({ page }) => {
    const size = { width: 900, height: 600 };
    await openApp(page, scenario, size);
    await expectTodayFits(page, size, /Start focus/);
  });
}

test("today_900x600_ended_scenario_renders", async ({ page }) => {
  await openApp(page, "ended", { width: 900, height: 600 });
  await expect(page.getByText("Session ended.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start focus/ })).toBeVisible();
});

test("today_has_no_radios_or_fields", async ({ page }) => {
  await openApp(page, "deepWorkChecked", { width: 900, height: 600 });
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByRole("spinbutton")).toHaveCount(0);
});

// Goal 1 and 2: every size in every state, in the projects' themes.
for (const size of SIZES) {
  for (const { scenario, primary } of STATES) {
    test(`today_fits_${size.width}x${size.height}_${scenario}`, async ({ page }) => {
      await openApp(page, scenario, size);
      await provoke(page, scenario);
      await expect(page.locator(".today")).toHaveAttribute("data-layout", size.layout);
      await expectTodayFits(page, size, primary);
    });
  }

  test(`today_ring_size_${size.width}x${size.height}`, async ({ page }) => {
    test.skip(size.layout !== "ring", "a strip has no ring");
    await openApp(page, "idle", size);
    const ring = await page.locator('[data-slot="timer-ring"]').boundingBox();
    expect(ring?.width, "the ring is square").toBeCloseTo(ring?.height ?? -1, 0);
    expect(ring?.width).toBeGreaterThanOrEqual(160);
    expect(ring?.width).toBeLessThanOrEqual(560);
    // Spacious windows reach the ceiling by themselves.
    if (size.width >= 1280 && size.height >= 800) expect(ring?.width).toBe(560);
  });
}
