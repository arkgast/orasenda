import { expect, test } from "@playwright/test";
import { overflows } from "./support/fits.ts";
import { smallTargets } from "./support/hitTargets.ts";
import { shoot } from "./support/shots.ts";
import { frames, openSpecimen } from "./support/specimen.ts";

const STATES = [
  "full-screen-focus-390x844",
  "full-screen-focus-800x600",
  "full-screen-focus-1440x900",
  "full-screen-focus-paused-1440x900",
];

for (const viewport of [
  { width: 390, height: 844 },
  { width: 800, height: 600 },
  { width: 1440, height: 900 },
]) {
  test(`full_screen_focus_fits_and_keeps_ring_round_at_${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await openSpecimen(page, "FullScreenFocus");
    await expect(frames(page)).toHaveCount(STATES.length);
    for (const state of STATES) {
      const frame = page.locator(`[data-frame][data-state="${state}"]`);
      // The visually hidden wall-clock span is clipped on purpose.
      const over = (await overflows(frame)).filter((line) => !line.includes("span.sr-only"));
      expect(over, state).toEqual([]);
      const ring = await frame.locator("[data-slot=timer-ring]").boundingBox();
      const box = await frame.boundingBox();
      expect(ring, state).not.toBeNull();
      if (!ring || !box) continue;
      expect(Math.abs(ring.width - ring.height), `${state} is round`).toBeLessThanOrEqual(1);
      expect(ring.width, `${state} ring fits the width`).toBeLessThanOrEqual(box.width);
      expect(ring.height, `${state} ring fits the height`).toBeLessThanOrEqual(box.height);
      expect(ring.width, `${state} ring is not collapsed`).toBeGreaterThanOrEqual(160);
      const own = state.includes(`${viewport.width}x${viewport.height}`);
      if (own && viewport.width === 1440)
        expect(ring.width, `${state} ring is full size`).toBeCloseTo(560, 0);
      // The margin follows the viewport (sm = 640), so it is checked on the frame made for it: space-4 below, space-8 (64) from sm.
      if (own) {
        const pad = await frame
          .locator("[data-slot=full-screen-focus]")
          .evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingLeft));
        expect(pad, `${state} margin`).toBeCloseTo(viewport.width >= 640 ? 64 : 16, 0);
      }
      expect(await smallTargets(frame.locator("button")), `${state} hit targets`).toEqual([]);
    }
    await shoot(page, info, "full-screen-focus");
  });
}
