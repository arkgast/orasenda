import { expect, test } from "@playwright/test";
import { expectFits } from "./support/fits.ts";
import { smallTargets } from "./support/hitTargets.ts";
import { shoot } from "./support/shots.ts";
import { frames, openSpecimen } from "./support/specimen.ts";

const STATES = [
  "full-screen-focus-390x844",
  "full-screen-focus-800x600",
  "full-screen-focus-1440x900",
  "full-screen-focus-paused-1440x900",
];

test("full_screen_focus_fits_and_keeps_ring_round_at_390x844_and_1440x900", async ({
  page,
}, info) => {
  await openSpecimen(page, "FullScreenFocus");
  await expect(frames(page)).toHaveCount(STATES.length);
  for (const state of STATES) {
    const frame = page.locator(`[data-frame][data-state="${state}"]`);
    await expectFits(frame);
    const ring = await frame.locator("[data-slot=timer-ring]").boundingBox();
    const box = await frame.boundingBox();
    expect(ring, state).not.toBeNull();
    if (!ring || !box) continue;
    expect(Math.abs(ring.width - ring.height), `${state} is round`).toBeLessThanOrEqual(1);
    expect(ring.width, `${state} ring fits the width`).toBeLessThanOrEqual(box.width);
    expect(ring.height, `${state} ring fits the height`).toBeLessThanOrEqual(box.height);
    expect(await smallTargets(frame.locator("button")), `${state} hit targets`).toEqual([]);
  }
  await shoot(page, info, "full-screen-focus");
});
