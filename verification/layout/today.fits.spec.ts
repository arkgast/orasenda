import { expect, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { digitsInsideRing } from "./support/ring.ts";
import {
  expectTodayFits,
  expectTodayGaps,
  provoke,
  SIZES,
  STATES,
  scenarioOf,
  TWO_ACTIONS,
} from "./support/today.ts";

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
      await openApp(page, scenarioOf(scenario), size);
      await provoke(page, scenario);
      await expect(page.locator(".today")).toHaveAttribute("data-layout", size.layout);
      await expectTodayFits(page, size, primary, TWO_ACTIONS.has(scenario));
    });

    // The layout-specific names are the issue's: one test per size and state, named by what it measures.
    const gapsName =
      size.layout === "strip"
        ? "today_strip_column_gaps"
        : size.layout === "stackedStrip"
          ? "today_stacked_strip_row_gaps"
          : "today_gaps_every_size_and_state";
    test(`${gapsName}_${size.width}x${size.height}_${scenario}`, async ({ page }) => {
      await openApp(page, scenarioOf(scenario), size);
      await provoke(page, scenario);
      await expectTodayGaps(page, size, scenario);
    });
  }

  test(`today_ring_size_${size.width}x${size.height}`, async ({ page }) => {
    test.skip(size.layout !== "ring", "a strip has no ring");
    await openApp(page, "idle", size);
    const ring = await page.locator('[data-slot="timer-ring"]').boundingBox();
    expect(ring?.width, "the ring is square").toBeCloseTo(ring?.height ?? -1, 0);
    expect(ring?.width).toBeGreaterThanOrEqual(160);
    expect(ring?.width).toBeLessThanOrEqual(560);
    // Spacious windows (1440x900 and above, spec C as amended) reach the ceiling by themselves.
    if (size.width >= 1440 && size.height >= 900) expect(ring?.width).toBe(560);
  });
}

// Goal 2: a two-line status row in the ring layout. Only the narrowest ring wraps (at 640 and wider every
// allowed line fits one row), so this holds that case: the row grows, and the gaps still hold.
test("today_two_line_status_row_gaps_360x640", async ({ page }) => {
  const size = { width: 360, height: 640, layout: "ring" };
  await openApp(page, "breakLong", size);
  const row = await page.locator('[data-slot="inline-notice"]').first().boundingBox();
  expect(row?.height, "the line takes two lines").toBeGreaterThan(44);
  await expectTodayGaps(page, size, "breakLong two lines");
});

// Session cadence: the break row names its two actions, and the stacked strip drops the suggestion.
test("today_break_row_actions_and_stacked_strip", async ({ page }) => {
  await openApp(page, "breakShort", { width: 900, height: 600 });
  await expect(
    page.getByRole("button", { name: "Back to focus for 10 more minutes" }),
  ).toBeVisible();
  await expect(page.getByText("Optional: look at something far away.")).toBeVisible();
  await openApp(page, "breakShort", { width: 360, height: 240 });
  await expect(page.getByText("Optional: look at something far away.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Skip break" }).first()).toBeVisible();
});

test("today_intent_shows_in_the_ring_and_not_the_stacked_strip", async ({ page }) => {
  await openApp(page, "intentSet", { width: 900, height: 600 });
  await expect(page.locator('[data-slot="timer-ring-task"]')).toBeVisible();
  await openApp(page, "intentSet", { width: 360, height: 240 });
  await expect(page.locator('[data-slot="timer-strip-task"]')).toHaveCount(0);
});

// Goal 1 on Today: Deep Work's "1:29:59" inside the ring at every ring size. The long face is held to the
// inner square, except where the timer-md floor binds (about 160 to 190px), where it is held to the circle.
test("today_running_deep_digits_inside_ring", async ({ page }) => {
  for (const size of SIZES.filter((s) => s.layout === "ring")) {
    await openApp(page, "runningDeep", size);
    const r = await digitsInsideRing(page, page.locator(".today"));
    const md = await page.evaluate(() =>
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--type-timer-md-font-size"),
      ),
    );
    const label = `${size.width}x${size.height}`;
    expect(md, `${label}: timer-md is read`).toBeGreaterThan(0);
    expect(r.fontSize, `${label}: never below timer-md`).toBeGreaterThanOrEqual(md - 0.5);
    await expect(page.locator("[data-slot=timer-ring-digits]")).toHaveAttribute(
      "data-length",
      "long",
    );
    expect(r.circleProblems, label).toEqual([]);
    if (r.fontSize > md + 0.5) expect(r.problems, label).toEqual([]);
  }
});

// Welcome and tips: the longest tip joined to "Session ended." keeps the 44px row at the smallest window.
test("today_tip_fits_360x240", async ({ page }) => {
  const size = { width: 360, height: 240, layout: "stackedStrip" };
  for (const scenario of ["welcome", "tipShortcut", "tipFocusViewKeys", "tipFocusView"]) {
    await openApp(page, scenario, size);
    if (scenario !== "welcome") {
      await expect(page.getByText(/Session ended\. Tip: /).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Got it" })).toBeVisible();
      const tip = await page
        .locator('.today-status [data-slot="inline-notice-message"] [aria-hidden]')
        .textContent();
      expect((tip ?? "").replace("Session ended. ", "").length, scenario).toBeLessThanOrEqual(65);
    }
    await expectTodayFits(page, size, /Start focus/);
    await expectTodayGaps(page, size, scenario);
  }
});

// In the side-by-side strip a tip would take three lines beside Got it, so it waits.
test("today_tip_waits_in_strip", async ({ page }) => {
  const size = { width: 800, height: 300, layout: "strip" };
  for (const scenario of ["tipShortcut", "tipFocusViewKeys", "tipFocusView"]) {
    await openApp(page, scenario, size);
    await expect(page.getByRole("button", { name: "Got it" }), scenario).toHaveCount(0);
    await expectTodayFits(page, size, /Start focus/);
  }
});
