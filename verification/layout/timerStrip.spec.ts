import { expect, test } from "@playwright/test";
import { expectVisibleFits } from "./support/fitsVisible.ts";
import { animatedElements } from "./support/motion.ts";
import { shoot } from "./support/shots.ts";
import { frames, openSpecimen } from "./support/specimen.ts";

const MODES = ["focus", "paused", "idle", "break", "warning"];
const WIDTHS = [360, 640, 1440];

async function checkFrame(page: import("@playwright/test").Page, state: string) {
  const frame = page.locator(`[data-frame][data-state="${state}"]`);
  await expect(frame, state).toHaveCount(1);
  await expect(frame.locator("[data-slot=timer-strip-task]"), state).toHaveCount(0);
  await expectVisibleFits(frame);
  const md = Number.parseFloat(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--type-timer-md-font-size"),
    ),
  );
  const digits = frame.locator("[data-slot=timer-strip-digits]");
  if ((await digits.count()) > 0) {
    const size = await digits.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    expect(size, `${state} digits`).toBeGreaterThanOrEqual(md);
  }
}

test("timer_strip_fits_at_360_640_1440", async ({ page }, info) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openSpecimen(page, "TimerStrip");
  for (const w of WIDTHS) for (const m of MODES) await checkFrame(page, `timer-strip-${w}-${m}`);
  await shoot(page, info, "timer-strip");
});

test("stacked_strip_fits_at_360", async ({ page }) => {
  await openSpecimen(page, "TimerStrip");
  const cases: Array<[string, string]> = [
    ["focus", "Focus, 18 minutes 42 seconds remaining"],
    ["paused", "Paused, 12 minutes 16 seconds remaining"],
    ["idle", "No session, 25 min"],
    ["break", "Break, 4 minutes 10 seconds remaining"],
    ["warning", "Almost up, 1 minute 48 seconds remaining"],
  ];
  for (const [mode, name] of cases) {
    // The stacked form has the same name as the wide one: the mode word and the time.
    const state = `timer-strip-stacked-360-${mode}`;
    await checkFrame(page, state);
    await expect(page.locator(`[data-state="${state}"]`)).toMatchAriaSnapshot(`
      - timer "${name}"
    `);
    // The frame is Today's 52px time track; the strip must be no taller.
    const h = await page
      .locator(`[data-state="${state}"] [data-slot=timer-strip]`)
      .evaluate((el) => ({
        strip: el.getBoundingClientRect().height,
        frame: el.parentElement?.getBoundingClientRect().height ?? 0,
      }));
    expect(h.frame).toBe(52);
    expect(h.strip).toBeLessThanOrEqual(h.frame);
  }
});

test("timer_strip_warning_fade_uses_duration_slow", async ({ page }, info) => {
  test.skip(
    info.project.name === "light-reduced-motion",
    "the fade is instant under reduced motion",
  );
  await openSpecimen(page, "TimerStrip");
  const read = (sel: string) =>
    page
      .locator(`[data-state="timer-strip-640-warning"] ${sel}`)
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          props: cs.transitionProperty.split(",").map((s) => s.trim()),
          durations: cs.transitionDuration.split(",").map((s) => s.trim()),
        };
      });
  const chip = await read("[data-slot=mode-chip]");
  expect(chip.durations.every((d) => d === "1.6s")).toBe(true);
  const fill = await read("[data-slot=timer-strip-fill-color]");
  const i = fill.props.findIndex(
    (p) => p === "background-color" || p === "background" || p === "all",
  );
  expect(i).toBeGreaterThanOrEqual(0);
  // A single listed duration applies to every property.
  expect(fill.durations[i % fill.durations.length]).toBe("1.6s");
});

test("timer_faces_aria_snapshot (TimerStrip)", async ({ page }) => {
  await openSpecimen(page, "TimerStrip");
  const cases: Array<[string, string]> = [
    ["focus", "Focus, 18 minutes 42 seconds remaining"],
    ["paused", "Paused, 12 minutes 16 seconds remaining"],
    ["idle", "No session, 25 min"],
    ["break", "Break, 4 minutes 10 seconds remaining"],
    ["warning", "Almost up, 1 minute 48 seconds remaining"],
  ];
  for (const [mode, name] of cases) {
    await expect(page.locator(`[data-state="timer-strip-360-${mode}"]`)).toMatchAriaSnapshot(`
      - timer "${name}"
    `);
  }
});

test("timer_faces_no_motion_when_reduced (TimerStrip)", async ({ page }, info) => {
  test.skip(info.project.name !== "light-reduced-motion", "reduced motion project only");
  await openSpecimen(page, "TimerStrip");
  expect(await animatedElements(page)).toEqual([]);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`timer_strip_keeps_its_shape_at_${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openSpecimen(page, "TimerStrip");
    expect(await frames(page).count()).toBeGreaterThan(0);
    // The specimen's 1440 frame is wider than a phone viewport, so the page itself may scroll.
    for (const w of WIDTHS) {
      const state = `timer-strip-${w}-focus`;
      const m = await page.locator(`[data-state="${state}"]`).evaluate((frame) => {
        const strip = frame.querySelector("[data-slot=timer-strip]") as HTMLElement;
        const bar = frame.querySelector("[data-slot=timer-strip-bar]") as HTMLElement;
        return {
          frame: frame.getBoundingClientRect().width,
          strip: strip.getBoundingClientRect().width,
          bar: bar.getBoundingClientRect().height,
        };
      });
      expect(m.strip, state).toBeLessThanOrEqual(m.frame + 1);
      expect(m.bar, `${state} bar box is 10px`).toBeGreaterThanOrEqual(9);
      expect(m.bar).toBeLessThanOrEqual(11);
    }
  });
}
