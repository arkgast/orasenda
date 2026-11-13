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
  { scenario: "runningDeep", primary: /Pause session/ },
  // Hotkeys and capture: the welcome line and the tips joined to "Session ended.".
  { scenario: "welcome", primary: /Start focus/ },
  { scenario: "tipShortcut", primary: /Start focus/ },
  { scenario: "tipFocusView", primary: /Start focus/ },
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

export type TodaySize = { width: number; height: number; layout?: string };

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Goal 3 for one rendered state: the token gaps between Today's rows (ring) or columns (strip) and rows
 * (stacked strip). Each row is measured by what shows (its buttons, fields and text; the ring by its SVG), not by its container; an empty status row is skipped, so its neighbours are compared
 * directly. Fails with a list such as "ring→controls 4px < 12px at 640x480 running". `DEBUG_GAPS=1` logs every gap.
 */
export async function expectTodayGaps(page: Page, size: TodaySize, state: string): Promise<void> {
  const m = await page.evaluate(() => {
    type B = { top: number; bottom: number; left: number; right: number };
    const union = (rects: Array<B & { width: number; height: number }>): B | null => {
      const seen = rects.filter((r) => r.width > 0 || r.height > 0);
      if (seen.length === 0) return null;
      return {
        top: Math.min(...seen.map((r) => r.top)),
        bottom: Math.max(...seen.map((r) => r.bottom)),
        left: Math.min(...seen.map((r) => r.left)),
        right: Math.max(...seen.map((r) => r.right)),
      };
    };
    const today = document.querySelector(".today");
    const all = (sel: string) => [...(today?.querySelectorAll(sel) ?? [])];
    const rectOf = (el: Element) => el.getBoundingClientRect();
    // The visible boxes: the buttons and fields a person sees, and the text itself (a range), never a container.
    const controls = (root: string) => all(`${root} :is(button, input)`);
    // A tip's spoken twin is sr-only (a 1px clip of the same words): its text is not on screen, so it is not measured.
    const textRect = (el: Element) => {
      const rects: DOMRect[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest(".sr-only")) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        rects.push(range.getBoundingClientRect());
      }
      const joined = union(rects);
      return joined ? { ...joined, width: 1, height: 1 } : new DOMRect();
    };
    const messages = all('.today-status [data-slot="inline-notice-message"]').filter(
      (el) => (el.textContent ?? "").trim() !== "",
    );
    const statusRects = [...messages.map(textRect), ...controls(".today-status").map(rectOf)];
    return {
      compact: today?.hasAttribute("data-compact") ?? false,
      top: union(controls(".today-top").map(rectOf)) ?? union(all(".today-top").map(rectOf)),
      // An empty status row has no message, button or field: it is skipped, not measured.
      status: union(statusRects),
      ring: union(all('[data-slot="timer-ring"] svg').map(rectOf)),
      time:
        union(all('[data-slot="timer-strip"]').map(rectOf)) ??
        union(all(".today-time").map(rectOf)),
      controls:
        union(controls(".today-controls").map(rectOf)) ?? union(all(".today-controls").map(rectOf)),
    };
  });
  const overlay = (await page.locator('[data-slot="intent-field"]').count()) > 0;
  const found: string[] = [];
  const log: string[] = [];
  const check = (name: string, gap: number, min: number) => {
    const line = `${name} ${gap.toFixed(1)}px (min ${min}px) at ${size.width}x${size.height} ${state}`;
    log.push(line);
    if (gap < min - 0.5)
      found.push(`${name} ${gap.toFixed(1)}px < ${min}px at ${size.width}x${size.height} ${state}`);
  };
  const down = (a: Box | null, b: Box | null, name: string, min: number) => {
    if (a && b) check(name, b.top - a.bottom, min);
  };
  const across = (a: Box | null, b: Box | null, name: string, min: number) => {
    if (a && b) check(name, b.left - a.right, min);
  };
  if (size.layout === "ring") {
    const min = m.compact ? 12 : 16;
    const rows: Array<[string, Box | null]> = [
      ["top", m.top],
      ["status", m.status],
      ["ring", m.ring],
      ["controls", m.controls],
    ];
    const present = rows.filter(([, b]) => b !== null);
    for (let i = 0; i + 1 < present.length; i++) {
      down(present[i][1], present[i + 1][1], `${present[i][0]}→${present[i + 1][0]}`, min);
    }
  } else if (size.layout === "strip") {
    across(m.status, m.time, "status→time", 16);
    across(m.time, m.controls, "time→controls", 16);
  } else {
    const rows: Array<[string, Box | null]> = [
      ["top", m.top],
      // The open intent field overlays the time in a stacked strip on purpose, so it has no gap to keep.
      ["status", overlay ? null : m.status],
      ["time", m.time],
      ["controls", m.controls],
    ];
    const present = rows.filter(([, b]) => b !== null);
    for (let i = 0; i + 1 < present.length; i++) {
      down(present[i][1], present[i + 1][1], `${present[i][0]}→${present[i + 1][0]}`, 8);
    }
  }
  if (process.env.DEBUG_GAPS) for (const line of log) console.log(`gap ${line}`);
  expect(found, "the gaps between Today's rows").toEqual([]);
}
