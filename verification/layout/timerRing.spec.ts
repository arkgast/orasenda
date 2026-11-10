import { expect, type Page, test } from "@playwright/test";
import { overflows } from "./support/fits.ts";
import { animatedElements } from "./support/motion.ts";
import { shoot } from "./support/shots.ts";
import { frames, openSpecimen } from "./support/specimen.ts";

const px = (page: Page, name: string) =>
  page.evaluate(
    (n) => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)),
    name,
  );

const fluid = (page: Page) => page.locator("[data-frame][data-state^='timer-ring-fluid-']");

test("fluid_ring_diameter_clamped_in_160_to_1200_containers", async ({ page }, info) => {
  await openSpecimen(page, "TimerRing");
  const min = await px(page, "--timer-min-size");
  const max = await px(page, "--timer-full-size");
  const count = await fluid(page).count();
  expect(count).toBeGreaterThanOrEqual(6);
  for (let i = 0; i < count; i++) {
    const frame = fluid(page).nth(i);
    const { fw, fh, w, h, state } = await frame.evaluate((el) => {
      const r = el.querySelector(".os-timer") as HTMLElement;
      const b = r.getBoundingClientRect();
      return {
        fw: el.clientWidth,
        fh: el.clientHeight,
        w: b.width,
        h: b.height,
        state: el.getAttribute("data-state"),
      };
    });
    const want = Math.min(Math.max(Math.min(fw, fh), min), max);
    expect(Math.abs(w - h), `${state} is round`).toBeLessThanOrEqual(1);
    expect(Math.abs(w - want), `${state} diameter`).toBeLessThanOrEqual(1);
    expect(w).toBeGreaterThanOrEqual(min - 1);
    expect(w).toBeLessThanOrEqual(max + 1);
  }
  await shoot(page, info, "timer-ring");
});

test("fluid_ring_digits_at_least_timer_md", async ({ page }) => {
  await openSpecimen(page, "TimerRing");
  const md = await px(page, "--type-timer-md-font-size");
  expect(md).toBe(28);
  const sizes = await page
    .locator("[data-frame][data-state^='timer-ring-fluid-'] .os-timer-digits")
    .evaluateAll((els) => els.map((e) => Number.parseFloat(getComputedStyle(e).fontSize)));
  expect(sizes.length).toBeGreaterThanOrEqual(9);
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(md);
});

test("timer_ring_frames_fit", async ({ page }) => {
  await openSpecimen(page, "TimerRing");
  const all = frames(page);
  for (let i = 0; i < (await all.count()); i++) {
    // The clamped task box reports its hidden lines as scroll overflow; its visible box must be two lines at most.
    const reported = await overflows(all.nth(i));
    expect(reported.filter((l) => !l.includes(".os-sr-only") && !l.includes("div.os-timer-task"))).toEqual([]);
    const task = all.nth(i).locator(".os-timer-task");
    if ((await task.count()) > 0) {
      const h = await task.evaluate((el) => ({
        box: el.clientHeight,
        line: Number.parseFloat(getComputedStyle(el).lineHeight),
      }));
      expect(h.box).toBeLessThanOrEqual(h.line * 2 + 1);
    }
  }
});

test("warning_fade_uses_duration_slow", async ({ page }, info) => {
  test.skip(info.project.name === "light-reduced-motion", "the fade is instant under reduced motion");
  await openSpecimen(page, "TimerRing");
  const slow = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--duration-slow").trim(),
  );
  expect(slow).toBe("1600ms");
  const read = (frame: string, sel: string) =>
    page.locator(`[data-state="${frame}"] ${sel}`).first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        props: cs.transitionProperty.split(",").map((s) => s.trim()),
        durations: cs.transitionDuration.split(",").map((s) => s.trim()),
        easing: cs.transitionTimingFunction,
      };
    });
  const arc = await read("timer-ring-fluid-warning", ".os-timer-warning .prog");
  const stroke = arc.props.indexOf("stroke");
  expect(stroke).toBeGreaterThanOrEqual(0);
  expect(arc.durations[stroke]).toBe("1.6s");
  const offset = arc.props.indexOf("stroke-dashoffset");
  expect(arc.durations[offset]).toBe("0.32s");
  const chip = await read("timer-ring-fluid-warning", ".os-chip");
  expect(chip.durations.every((d) => d === "1.6s")).toBe(true);
  const focusArc = await read("timer-ring-fluid-focus", ".os-timer .prog");
  expect(focusArc.durations.every((d) => d === "0.32s")).toBe(true);
  expect(arc.easing).toContain("cubic-bezier(0.45, 0, 0.55, 1)");
});

test("timer_ring_aria_snapshot", async ({ page }) => {
  await openSpecimen(page, "TimerRing");
  const task = "Finish the chapter 3 outline and send the draft to Maya before the review";
  await expect(page.locator("[data-state='timer-ring-numeric-idle']")).toMatchAriaSnapshot(`
    - timer "No session"
  `);
  await expect(page.locator("[data-state='timer-ring-numeric-focus']")).toMatchAriaSnapshot(`
    - timer "Focus, 18 minutes 42 seconds remaining"
  `);
  await expect(page.locator("[data-state='timer-ring-fluid-focus']")).toMatchAriaSnapshot(`
    - timer "Focus, 18 minutes 42 seconds remaining, ${task}"
  `);
  await expect(page.locator("[data-state='timer-ring-fluid-break']")).toMatchAriaSnapshot(`
    - timer "Break, 4 minutes 10 seconds remaining, ${task}"
  `);
  await expect(page.locator("[data-state='timer-ring-fluid-paused']")).toMatchAriaSnapshot(`
    - timer "Paused, 12 minutes 16 seconds remaining, ${task}"
  `);
  await expect(page.locator("[data-state='timer-ring-fluid-warning']")).toMatchAriaSnapshot(`
    - timer "Almost up, 1 minute 48 seconds remaining, ${task}"
  `);
  await expect(page.locator("[data-state='timer-ring-fluid-idle']")).toMatchAriaSnapshot(`
    - timer "No session"
  `);
});

test("timer_ring_no_motion_when_reduced", async ({ page }, info) => {
  test.skip(info.project.name !== "light-reduced-motion", "reduced motion project only");
  await openSpecimen(page, "TimerRing");
  expect(await animatedElements(page)).toEqual([]);
});
