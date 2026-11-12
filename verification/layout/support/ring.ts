import type { Locator, Page } from "@playwright/test";

export interface DigitsInside {
  /** Empty when the digits box lies inside the ring's inner square. Otherwise, one line per side. */
  problems: string[];
  digits: { w: number; h: number };
  inner: number;
  /** Empty when all four corners of the digits box lie inside the circle's inner edge (radius minus stroke). */
  circleProblems: string[];
  fontSize: number;
}

/**
 * Measures the TimerRing inside `frame` (a locator for any element that contains one). The inner square
 * is the circle's inscribed square (side = diameter / sqrt 2) inset by the stroke on every side. The
 * stroke is the arc's, read in rendered px; a ring with no arc (idle) has no digits and passes.
 * `circleProblems` is the weaker check, the corners against the circle itself. Returns the measurements so a spec can assert `problems` is empty and add its own checks.
 */
export async function digitsInsideRing(page: Page, frame: Locator): Promise<DigitsInside> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return frame.evaluate((root): DigitsInside => {
    const ring = root.querySelector("[data-slot=timer-ring]") as HTMLElement;
    const digits = root.querySelector("[data-slot=timer-ring-digits]") as HTMLElement | null;
    const svg = ring.querySelector("svg") as SVGSVGElement;
    const arc = ring.querySelector("[data-slot=timer-ring-arc]");
    const none = { w: 0, h: 0 };
    if (!digits || !arc)
      return { problems: [], circleProblems: [], digits: none, inner: 0, fontSize: 0 };
    const rb = svg.getBoundingClientRect();
    const scale = rb.width / svg.viewBox.baseVal.width;
    const stroke = Number.parseFloat(arc.getAttribute("stroke-width") ?? "0") * scale;
    const inner = rb.width / Math.SQRT2 - 2 * stroke;
    const cx = rb.left + rb.width / 2;
    const cy = rb.top + rb.height / 2;
    const db = digits.getBoundingClientRect();
    const tol = 0.5;
    const problems: string[] = [];
    const sides: Array<[string, number]> = [
      ["left", cx - inner / 2 - db.left],
      ["right", db.right - (cx + inner / 2)],
      ["top", cy - inner / 2 - db.top],
      ["bottom", db.bottom - (cy + inner / 2)],
    ];
    for (const [name, over] of sides) {
      if (over > tol) problems.push(`digits ${over.toFixed(1)}px past the inner square's ${name}`);
    }
    const radius = rb.width / 2 - stroke;
    const circleProblems: string[] = [];
    for (const [name, x, y] of [
      ["top-left", db.left, db.top],
      ["top-right", db.right, db.top],
      ["bottom-left", db.left, db.bottom],
      ["bottom-right", db.right, db.bottom],
    ] as const) {
      const out = Math.hypot(x - cx, y - cy) - radius;
      if (out > tol)
        circleProblems.push(`digits ${name} corner ${out.toFixed(1)}px outside the circle`);
    }
    return {
      problems,
      circleProblems,
      digits: { w: db.width, h: db.height },
      inner,
      fontSize: Number.parseFloat(getComputedStyle(digits).fontSize),
    };
  });
}
