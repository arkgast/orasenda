import { expect, test } from "@playwright/test";
import { expectVisibleFits } from "./support/fitsVisible.ts";
import { animatedElements } from "./support/motion.ts";
import { shoot } from "./support/shots.ts";
import { openSpecimen } from "./support/specimen.ts";

const MODES = ["focus", "paused", "idle", "break", "warning"];
const WIDTHS = [360, 640, 1440];

async function checkFrame(page: import("@playwright/test").Page, state: string) {
  const frame = page.locator(`[data-frame][data-state="${state}"]`);
  await expect(frame, state).toHaveCount(1);
  await expectVisibleFits(frame);
  const task = await frame.locator(".os-strip-task").evaluate((el) => {
    const cs = getComputedStyle(el);
    const line = Number.parseFloat(cs.lineHeight);
    return { height: el.getBoundingClientRect().height, line, clamp: cs.webkitLineClamp };
  });
  expect(task.clamp, `${state} clamps to two lines`).toBe("2");
  expect(task.height, `${state} task is two lines`).toBeGreaterThanOrEqual(task.line * 2 - 1);
  expect(task.height).toBeLessThanOrEqual(task.line * 2 + 1);
  const md = Number.parseFloat(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--type-timer-md-font-size"),
    ),
  );
  const digits = frame.locator(".os-strip-digits");
  if ((await digits.count()) > 0) {
    const size = await digits.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    expect(size, `${state} digits`).toBeGreaterThanOrEqual(md);
  }
}

test("timer_strip_fits_at_360_640_1440_with_two_line_intent", async ({ page }, info) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openSpecimen(page, "TimerStrip");
  for (const w of WIDTHS) for (const m of MODES) await checkFrame(page, `timer-strip-${w}-${m}`);
  await shoot(page, info, "timer-strip");
});

test("stacked_strip_fits_at_360", async ({ page }) => {
  await openSpecimen(page, "TimerStrip");
  for (const m of MODES) await checkFrame(page, `timer-strip-stacked-360-${m}`);
});

test("timer_strip_warning_fade_uses_duration_slow", async ({ page }, info) => {
  test.skip(info.project.name === "light-reduced-motion", "the fade is instant under reduced motion");
  await openSpecimen(page, "TimerStrip");
  const read = (sel: string) =>
    page.locator(`[data-state="timer-strip-640-warning"] ${sel}`).first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        props: cs.transitionProperty.split(",").map((s) => s.trim()),
        durations: cs.transitionDuration.split(",").map((s) => s.trim()),
      };
    });
  const chip = await read(".os-chip");
  expect(chip.durations.every((d) => d === "1.6s")).toBe(true);
  const fill = await read(".os-strip-fill");
  const i = fill.props.findIndex((p) => p === "background-color" || p === "background" || p === "all");
  expect(i).toBeGreaterThanOrEqual(0);
  expect(fill.durations[i]).toBe("1.6s");
});

test("timer_strip_aria_snapshot", async ({ page }) => {
  await openSpecimen(page, "TimerStrip");
  const t = "Finish the chapter 3 outline and send the draft to Maya before the review";
  const cases: Array<[string, string]> = [
    ["focus", `Focus, 18 minutes 42 seconds remaining, ${t}`],
    ["paused", `Paused, 12 minutes 16 seconds remaining, ${t}`],
    ["idle", `No session, 25 min, ${t}`],
    ["break", `Break, 4 minutes 10 seconds remaining, ${t}`],
    ["warning", `Almost up, 1 minute 48 seconds remaining, ${t}`],
  ];
  for (const [mode, name] of cases) {
    for (const state of [`timer-strip-640-${mode}`, `timer-strip-stacked-360-${mode}`]) {
      await expect(page.locator(`[data-state="${state}"]`)).toMatchAriaSnapshot(`
        - timer "${name}"
      `);
    }
  }
});

test("timer_strip_no_motion_when_reduced", async ({ page }, info) => {
  test.skip(info.project.name !== "light-reduced-motion", "reduced motion project only");
  await openSpecimen(page, "TimerStrip");
  expect(await animatedElements(page)).toEqual([]);
});
