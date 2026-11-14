import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { SIZES as TODAY_SIZES } from "./support/today.ts";

// #321: in the ring and stackedStrip layouts the controls, the time and the top row's summary
// share one centre line, the centre of the page box Today fills (right of the nav rail). In a compact
// window the summary is centred between Pages and the two focus buttons instead.
const SIZES = [
  { width: 360, height: 240 },
  { width: 640, height: 480 },
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const STATES = ["idle", "running"] as const;

type Centres = {
  layout: string;
  column: number;
  controls: number;
  time: number;
  summary: number;
  cell: number;
  compact: boolean;
  controlsLeft: number;
  controlsRight: number;
  timeRight: number;
  todayRight: number;
};

/** Horizontal centres in CSS px. The controls are the union of their buttons: what the eye sees. */
async function centres(page: Page): Promise<Centres> {
  return page.evaluate(() => {
    const mid = (r: DOMRect) => r.left + r.width / 2;
    const q = (s: string) => document.querySelector(s) as HTMLElement;
    const buttons = [...q(".today-controls").querySelectorAll("button")].map((b) =>
      b.getBoundingClientRect(),
    );
    const left = Math.min(...buttons.map((b) => b.left));
    const right = Math.max(...buttons.map((b) => b.right));
    const column = q(".app-column").getBoundingClientRect();
    const today = q(".today").getBoundingClientRect();
    const timeBox = q(".today-time").firstElementChild?.getBoundingClientRect() as DOMRect;
    return {
      controlsLeft: left,
      controlsRight: right,
      timeRight: timeBox.right,
      todayRight: today.right,
      layout: q(".today").dataset.layout ?? "",
      column: mid(column),
      controls: (left + right) / 2,
      time: mid(q(".today-time").firstElementChild?.getBoundingClientRect() as DOMRect),
      summary: mid(q('[data-slot="preset-summary"] button').getBoundingClientRect()),
      cell: mid(q(".today-summary").getBoundingClientRect()),
      compact: q(".today").dataset.compact !== undefined,
    };
  });
}

const expectedLayout = (size: { width: number; height: number }) =>
  TODAY_SIZES.find((t) => t.width === size.width && t.height === size.height)?.layout;

for (const size of SIZES) {
  for (const scenario of STATES) {
    test(`today_controls_centred_${size.width}x${size.height}_${scenario}`, async ({ page }) => {
      await openApp(page, scenario, size);
      const c = await centres(page);
      expect(c.layout, "layout").toBe(expectedLayout(size));
      expect(c.layout).not.toBe("strip");
      const near = (a: number, b: number, what: string) =>
        expect(Math.abs(a - b), `${what} ${JSON.stringify(c)}`).toBeLessThanOrEqual(1);
      near(c.controls, c.time, "controls vs time");
      near(c.controls, c.column, "controls vs window");
      if (c.compact) {
        // H4b: two buttons end the top row, so the summary is centred in its own cell, not on the window.
        near(c.summary, c.cell, "summary vs its cell");
      } else {
        near(c.summary, c.column, "summary vs window");
        near(c.summary, c.time, "summary vs time");
      }
    });
  }
}

const STRIPS = [
  { width: 800, height: 300 },
  { width: 1024, height: 400 },
] as const;

for (const size of STRIPS) {
  for (const scenario of STATES) {
    test(`today_controls_at_end_${size.width}x${size.height}_${scenario}`, async ({ page }) => {
      await openApp(page, scenario, size);
      const c = await centres(page);
      expect(c.layout, "layout").toBe("strip");
      expect(Math.abs(c.controlsRight - c.todayRight), JSON.stringify(c)).toBeLessThanOrEqual(1);
      expect(c.controlsLeft, JSON.stringify(c)).toBeGreaterThanOrEqual(c.timeRight);
    });
  }
}
