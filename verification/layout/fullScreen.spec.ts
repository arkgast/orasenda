import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";

// `main` in native full screen, as the real App draws it (layout.html, mockIPC): no nav rail, no
// page header, only the timer. The view's own cases (tracks, strips, tokens) are fullScreenFocus.spec.ts.

const caption = (page: Page) => page.locator("[data-slot=full-screen-focus-caption]");

test("full_screen_has_no_rail_or_header", async ({ page }) => {
  await openApp(page, "fullScreenRunning", { width: 1280, height: 720 });
  await expect(page.getByRole("region", { name: "Full-screen focus" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pages" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  await expect(page.locator("main")).toHaveCount(1);
  // The view fills the window: nothing is left over for a rail.
  const box = await page.getByRole("region", { name: "Full-screen focus" }).boundingBox();
  expect(box).toMatchObject({ x: 0, y: 0, width: 1280, height: 720 });
});

test("full_screen_controls_centred_with_the_gate_gap", async ({ page }) => {
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await openApp(page, "fullScreenRunning", size);
    const ring = await page.locator("[data-slot=timer-ring]").boundingBox();
    const view = await page.getByRole("region", { name: "Full-screen focus" }).boundingBox();
    const pause = await page.getByRole("button", { name: "Pause session" }).boundingBox();
    const end = await page.getByRole("button", { name: "End session" }).boundingBox();
    if (!(ring && view && pause && end)) throw new Error("missing box");
    const middle = (ring.y + ring.height + view.y + view.height) / 2;
    expect(
      Math.abs(pause.y + pause.height / 2 - middle),
      `${size.width} centred`,
    ).toBeLessThanOrEqual(1);
    // space-8 between Pause and End.
    expect(end.x - (pause.x + pause.width), `${size.width} gap`).toBeCloseTo(64, 0);
  }
});

test("full_screen_compact_split_view_width", async ({ page }) => {
  // A Split View tile: narrow (under layout-compact-width) and tall. The view uses its compact layout.
  for (const size of [
    { width: 500, height: 800, layout: "ring" },
    { width: 360, height: 700, layout: "ring" },
  ]) {
    await openApp(page, "fullScreenRunning", size);
    const view = page.getByRole("region", { name: "Full-screen focus" });
    await expect(view, `${size.width}`).toHaveAttribute("data-layout", size.layout);
    const fit = await page.evaluate(() => ({
      over: document.documentElement.scrollWidth > window.innerWidth,
      pause: document.querySelector('[aria-label="Pause session"]')?.getBoundingClientRect().right,
      end: document.querySelector('[aria-label="End session"]')?.getBoundingClientRect().right,
      width: window.innerWidth,
    }));
    expect(fit.over, `${size.width} scrolls sideways`).toBe(false);
    expect(fit.end, `${size.width} End inside`).toBeLessThanOrEqual(fit.width);
    // The compact ring keeps Pause near the time: the narrower gap, not the roomy space-8.
    const pause = await page.getByRole("button", { name: "Pause session" }).boundingBox();
    const end = await page.getByRole("button", { name: "End session" }).boundingBox();
    if (!(pause && end)) throw new Error("missing box");
    expect(end.x - (pause.x + pause.width), `${size.width} gap`).toBeLessThan(64);
  }
});

test("full_screen_hint_keeps_its_row", async ({ page }) => {
  await openApp(page, "fullScreenHint", { width: 1280, height: 720 });
  const row = caption(page);
  await expect(row).toContainText("Esc leaves");
  const shown = await row.boundingBox();
  expect(shown?.height).toBeCloseTo(18, 0);
  // After duration-hint (4 s) and the fade it is hidden from readers, and its row has not moved.
  await expect(row).toHaveAttribute("aria-hidden", "true", { timeout: 8_000 });
  await expect(row).toHaveCSS("opacity", "0", { timeout: 4_000 });
  const faded = await row.boundingBox();
  expect(faded?.height).toBeCloseTo(shown?.height ?? -1, 0);
  expect(faded?.y).toBeCloseTo(shown?.y ?? -1, 0);
});

test("full_screen_without_hints_still_has_the_row", async ({ page }) => {
  await openApp(page, "fullScreenIdle", { width: 1280, height: 720 });
  const row = caption(page);
  await expect(row).toHaveAttribute("aria-hidden", "true");
  expect((await row.boundingBox())?.height).toBeCloseTo(18, 0);
});

test("full_screen_leave_failure_is_one_line", async ({ page }) => {
  await openApp(page, "leaveError", { width: 1280, height: 720 });
  await page.getByRole("button", { name: "Leave full screen" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Orasenda couldn't leave full screen. Try again.",
  );
  await expect(page.getByRole("region", { name: "Full-screen focus" })).toBeVisible();
});
