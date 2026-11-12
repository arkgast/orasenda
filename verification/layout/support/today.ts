import { expect, type Page } from "@playwright/test";
import { overflows } from "./fits.ts";
import { smallTargets } from "./hitTargets.ts";

/** The spec's size set: stackedStrip, ring-compact, strip, the smallest regular window, the default window and spacious. */
export const SIZES = [
  { width: 360, height: 240, layout: "stackedStrip" },
  { width: 360, height: 640, layout: "ring" },
  { width: 480, height: 320, layout: "stackedStrip" },
  { width: 640, height: 480, layout: "ring" },
  { width: 800, height: 300, layout: "strip" },
  { width: 900, height: 600, layout: "ring" },
  { width: 1024, height: 400, layout: "strip" },
  { width: 1280, height: 800, layout: "ring" },
  { width: 1440, height: 900, layout: "ring" },
  { width: 1920, height: 1080, layout: "ring" },
] as const;

/** The state set that Today alone owns (the popover states are the preset summary's). */
export const STATES = [
  { scenario: "idle", primary: /Start focus/ },
  { scenario: "ended", primary: /Start focus/ },
  { scenario: "recovered", primary: /Start focus/ },
  { scenario: "running", primary: /Pause session/ },
  { scenario: "paused", primary: /Resume session/ },
  { scenario: "storeEnded", primary: /Start focus/ },
  { scenario: "startError", primary: /Start focus/ },
  { scenario: "timerUnavailable", primary: /Start focus/ },
  { scenario: "starting", primary: /Starting/ },
  { scenario: "settingsUnavailable", primary: /Start focus/ },
  { scenario: "deepWorkChecked", primary: /Start focus/ },
  { scenario: "pauseError", primary: /Pause session/ },
] as const;

/** Scenarios whose line shows only after an action (the harness has no click in `openApp`). */
export async function provoke(page: Page, scenario: string): Promise<void> {
  if (scenario === "startError") await page.getByRole("button", { name: "Start focus" }).click();
  if (scenario === "pauseError") await page.getByRole("button", { name: "Pause session" }).click();
  if (scenario === "starting") {
    await page.getByRole("button", { name: "Start focus" }).click();
    await page.getByRole("button", { name: "Starting…" }).waitFor();
  }
  if (scenario === "startError" || scenario === "pauseError") {
    await page
      .getByRole("status")
      .filter({ hasText: /isn't responding/ })
      .waitFor();
  }
}

/** Goal 1 for one rendered state: no scroll, the primary action inside the window, a 44px row, targets, no overflow. */
export async function expectTodayFits(
  page: Page,
  size: { width: number; height: number; layout?: string },
  primary: RegExp,
): Promise<void> {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    bodyScroll: [document.body.scrollWidth, document.body.scrollHeight],
  }));
  expect(m.scrollHeight, "no vertical scroll").toBeLessThanOrEqual(size.height);
  expect(m.scrollWidth, "no horizontal scroll").toBeLessThanOrEqual(size.width);

  const box = await page.getByRole("button", { name: primary }).first().boundingBox();
  expect(box, "the primary action is on the page").not.toBeNull();
  const b = box as { x: number; y: number; width: number; height: number };
  expect(b.x, "primary left").toBeGreaterThanOrEqual(0);
  expect(b.y, "primary top").toBeGreaterThanOrEqual(0);
  expect(b.x + b.width, "primary right").toBeLessThanOrEqual(size.width);
  expect(b.y + b.height, "primary bottom").toBeLessThanOrEqual(size.height);

  const row = await page.locator('[data-slot="inline-notice"]').boundingBox();
  // A strip's status is a column beside the time, where a long line may take more height.
  if (size.layout === "strip") expect(row?.height).toBeGreaterThanOrEqual(44);
  else expect(row?.height, "the status row is 44px").toBe(44);

  expect(await smallTargets(page.locator("body")), "targets are 44px").toEqual([]);
  // The visually hidden h1 is a 1px box on purpose.
  const spill = (await overflows(page.locator(".today"))).filter(
    (line) => !line.includes("sr-only"),
  );
  expect(spill, "nothing overflows").toEqual([]);
}
