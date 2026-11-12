import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";

// #321: in the ring and stackedStrip layouts the controls, the time and the top row's summary
// share one centre line, the centre of the page box Today fills (right of the nav rail).
const SIZES = [
  { width: 360, height: 240 },
  { width: 640, height: 480 },
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const STATES = ["idle", "running"] as const;

type Centres = { layout: string; column: number; controls: number; time: number; summary: number };

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
    return {
      layout: q(".today").dataset.layout ?? "",
      column: mid(column),
      controls: (left + right) / 2,
      time: mid(q(".today-time").firstElementChild?.getBoundingClientRect() as DOMRect),
      summary: mid(q('[data-slot="today-summary"]').getBoundingClientRect()),
    };
  });
}

for (const size of SIZES) {
  for (const scenario of STATES) {
    test(`today_controls_centred_${size.width}x${size.height}_${scenario}`, async ({ page }) => {
      await openApp(page, scenario, size);
      const c = await centres(page);
      if (c.layout === "strip") {
        // Unchanged: the controls column sits at the end of the window.
        expect(c.controls, "strip controls stay at the end").toBeGreaterThan(c.column);
        return;
      }
      expect(
        Math.abs(c.controls - c.time),
        `controls vs time ${JSON.stringify(c)}`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(c.controls - c.column),
        `controls vs window ${JSON.stringify(c)}`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(c.summary - c.column),
        `summary vs window ${JSON.stringify(c)}`,
      ).toBeLessThanOrEqual(1);
    });
  }
}
