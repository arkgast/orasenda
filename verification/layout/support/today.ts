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
  // Session cadence: the rows and states Today adds (spec E, "Status row").
  { scenario: "warning", primary: /Pause session/ },
  { scenario: "warningAuto", primary: /Pause session/ },
  { scenario: "autoStep", primary: /Pause session/ },
  { scenario: "breakShort", primary: /Pause break/ },
  { scenario: "breakLong", primary: /Pause break/ },
  { scenario: "breakPaused", primary: /Resume break/ },
  { scenario: "breakCap", primary: /Pause break/ },
  { scenario: "keepGoing", primary: /Start focus/ },
  { scenario: "breakOver", primary: /Start focus/ },
  { scenario: "breakEnded", primary: /Start focus/ },
  { scenario: "capLine", primary: /Start focus/ },
  { scenario: "intentSet", primary: /Pause session/ },
  { scenario: "intentPaused", primary: /Resume session/ },
  { scenario: "intentOpen", primary: /Pause session/ },
  { scenario: "hintKeepGoing", primary: /Pause session/ },
] as const;

/** Rows with a second action: at a narrow width the line may take a second line, so the row may grow. */
export const TWO_ACTIONS = new Set([
  "breakShort",
  "breakLong",
  "breakPaused",
  "breakCap",
  "keepGoing",
]);

/** The harness scenario behind a state: `intentOpen` is a running session whose field the test opens. */
export const scenarioOf = (state: string): string => (state === "intentOpen" ? "running" : state);

/** Scenarios whose line shows only after an action (the harness has no click in `openApp`). */
export async function provoke(page: Page, scenario: string): Promise<void> {
  if (scenario === "startError") await page.getByRole("button", { name: "Start focus" }).click();
  if (scenario === "pauseError") await page.getByRole("button", { name: "Pause session" }).click();
  if (scenario === "intentOpen") {
    await page.getByRole("button", { name: "What will be done?" }).click();
    await page.getByRole("textbox", { name: "What will be done?" }).waitFor();
  }
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
  grows = false,
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

  // The open intent field replaces the row; its input is a 44px target (checked below).
  const rowBox = page.locator('[data-slot="inline-notice"]');
  const row = (await rowBox.count()) > 0 ? await rowBox.first().boundingBox() : null;
  // A strip's status is a column beside the time, where a long line may take more height.
  // Two lines of body-sm at most: the row may grow, but not past 88px.
  if (row && (size.layout === "strip" || grows)) {
    expect(row.height).toBeGreaterThanOrEqual(44);
    expect(row.height, "at most two lines").toBeLessThanOrEqual(88);
  } else if (row) expect(row.height, "the status row is 44px").toBe(44);

  expect(await smallTargets(page.locator("body")), "targets are 44px").toEqual([]);
  // The visually hidden h1 is a 1px box on purpose.
  // The open intent field lies over the stacked strip's time on purpose (today.css).
  const overlay =
    size.layout === "stackedStrip" &&
    (await page.locator('[data-slot="intent-field"]').count()) > 0;
  // Only the intent line is clamped on purpose; without a task slot nothing may be.
  const taskSlots = (await page.locator('[data-slot$="-task"]').count()) > 0;
  const spill = (await overflows(page.locator(".today"))).filter(
    // The task line is clamped to two lines on purpose (timer-ring and timer-strip READMEs).
    (line) =>
      !line.includes("sr-only") &&
      !(taskSlots && line.includes("line-clamp-2")) &&
      !(overlay && line.includes("today-status")),
  );
  expect(spill, "nothing overflows").toEqual([]);
}
