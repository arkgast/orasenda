import { expect, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { animatedElements } from "./support/motion.ts";

const SIZES = [
  { width: 360, height: 240 },
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
];
const SCENARIOS = ["idle", "running", "paused", "ended", "startError"];

// The reduced-motion project only: under it nothing on Today animates or transitions.
for (const size of SIZES) {
  for (const scenario of SCENARIOS) {
    test(`today_no_motion_reduced_${size.width}x${size.height}_${scenario}`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== "light-reduced-motion", "reduced motion only");
      await openApp(page, scenario, size);
      expect(
        await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
      ).toBe(true);
      expect(await animatedElements(page)).toEqual([]);
    });
  }
}
