import { expect, test } from "@playwright/test";
import { smallTargets } from "./support/hitTargets.ts";
import { frames, openSpecimen } from "./support/specimen.ts";

test("stepper_fits_every_frame_down_to_271_and_meets_hit_min", async ({ page }) => {
  await openSpecimen(page, "Stepper");
  const all = frames(page);
  for (let i = 0; i < (await all.count()); i++) {
    const frame = all.nth(i);
    const box = await frame.boundingBox();
    const overflow = await frame.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, await frame.getAttribute("data-state")).toBeLessThanOrEqual(0);
    expect(box?.width).toBeGreaterThan(0);
    expect(await smallTargets(frame)).toEqual([]);
  }
});
