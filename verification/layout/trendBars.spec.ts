import { expect, test } from "@playwright/test";
import { openSpecimen } from "./support/specimen.ts";

const FRAMES = [
  "trend-bars-week-360",
  "trend-bars-week-1440",
  "trend-bars-weeks-goal-360",
  "trend-bars-weeks-goal-1440",
  "trend-bars-months-360",
  "trend-bars-months-1440",
  "trend-bars-all-empty-360",
];

for (const theme of ["light", "dark"] as const) {
  test(`trend_bars_hold_their_layout_${theme}`, async ({ page }) => {
    await openSpecimen(page, "TrendBars", { theme });
    for (const state of FRAMES) {
      const r = await page.locator(`[data-state='${state}']`).evaluate((frame) => {
        const box = (el: Element) => el.getBoundingClientRect();
        const cols = [...frame.querySelectorAll("[data-slot=trend-bar]")];
        const labels = cols.map((c) => box(c.lastElementChild as Element));
        const overlap = labels.some(
          (l, i) => i > 0 && l.left < (labels[i - 1] as DOMRect).right - 0.5,
        );
        const plot = box(frame.querySelector("[data-slot=trend-bars-plot] > div > div") as Element);
        const stubTouchesFill = cols.some((c) => {
          const fill = c.querySelector("[data-slot=trend-bar-fill]");
          if (!fill) return false;
          const f = box(fill);
          return [...c.querySelectorAll("[data-slot=trend-bar-stub]")].some((s) => {
            const b = box(s);
            return b.right > f.left + 0.01 && b.left < f.right - 0.01;
          });
        });
        const goal = frame.querySelector("[data-slot=trend-bars-goal]");
        const fr = box(frame);
        const goalInside = !goal || box(goal).bottom <= fr.bottom;
        const focusable = frame.querySelectorAll("a,button,input,[tabindex]").length;
        const fig = frame.querySelector("figure") as Element;
        return {
          overlap,
          stubTouchesFill,
          goalInside,
          focusable,
          plotHeight: plot.height,
          figInside: box(fig).bottom <= fr.bottom && box(fig).right <= fr.right + 0.5,
        };
      });
      expect(r.overlap, state).toBe(false);
      expect(r.stubTouchesFill, state).toBe(false);
      expect(r.goalInside, state).toBe(true);
      expect(r.figInside, state).toBe(true);
      expect(r.focusable, state).toBe(0);
      expect(r.plotHeight, state).toBe(120);
    }
  });
}
