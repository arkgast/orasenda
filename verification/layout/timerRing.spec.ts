import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { expectClampedFits } from "./support/clampedFits.ts";
import { expectFits, overflows } from "./support/fits.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { expectBundledFontsLoaded } from "./support/fonts.ts";
import { smallTargets } from "./support/hitTargets.ts";
import { animatedElements } from "./support/motion.ts";
import { recordRequests } from "./support/network.ts";
import { shoot } from "./support/shots.ts";
import { frames, openSpecimen, pressTab } from "./support/specimen.ts";

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
      const r = el.querySelector("[data-slot=timer-ring]") as HTMLElement;
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
    .locator("[data-frame][data-state^='timer-ring-fluid-'] [data-slot=timer-ring-digits]")
    .evaluateAll((els) => els.map((e) => Number.parseFloat(getComputedStyle(e).fontSize)));
  expect(sizes.length).toBeGreaterThanOrEqual(9);
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(md);
});

test("timer_ring_frames_fit", async ({ page }) => {
  await openSpecimen(page, "TimerRing");
  const all = frames(page);
  for (let i = 0; i < (await all.count()); i++) {
    const frame = all.nth(i);
    const state = (await frame.getAttribute("data-state")) ?? "";
    if (!state.startsWith("timer-ring-")) continue;
    await expectClampedFits(frame, "[data-slot=timer-ring-task]", 2);
  }
});

test("warning_fade_uses_duration_slow", async ({ page }, info) => {
  test.skip(
    info.project.name === "light-reduced-motion",
    "the fade is instant under reduced motion",
  );
  await openSpecimen(page, "TimerRing");
  const slow = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--duration-slow").trim(),
  );
  expect(slow).toBe("1600ms");
  const read = (frame: string, sel: string) =>
    page
      .locator(`[data-state="${frame}"] ${sel}`)
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          props: cs.transitionProperty.split(",").map((s) => s.trim()),
          durations: cs.transitionDuration.split(",").map((s) => s.trim()),
          easing: cs.transitionTimingFunction,
        };
      });
  const arc = await read("timer-ring-fluid-warning", "[data-slot=timer-ring-arc]");
  const stroke = arc.props.indexOf("stroke");
  expect(stroke).toBeGreaterThanOrEqual(0);
  expect(arc.durations[stroke]).toBe("1.6s");
  const offset = arc.props.indexOf("stroke-dashoffset");
  expect(arc.durations[offset]).toBe("0.32s");
  const chip = await read("timer-ring-fluid-warning", "[data-slot=mode-chip]");
  expect(chip.durations.every((d) => d === "1.6s")).toBe(true);
  const focusArc = await read("timer-ring-fluid-focus", "[data-slot=timer-ring-arc]");
  expect(focusArc.durations.every((d) => d === "0.32s")).toBe(true);
  expect(arc.easing).toContain("cubic-bezier(0.45, 0, 0.55, 1)");
});

test("timer_faces_aria_snapshot (TimerRing)", async ({ page }) => {
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

test("timer_faces_no_motion_when_reduced (TimerRing)", async ({ page }, info) => {
  test.skip(info.project.name !== "light-reduced-motion", "reduced motion project only");
  await openSpecimen(page, "TimerRing");
  expect(await animatedElements(page)).toEqual([]);
});

test("playwright_launches_webkit", async ({ browser }) => {
  console.log(`webkit ${browser.version()}`);
  expect(browser.browserType().name()).toBe("webkit");
});

test("seed_states_fit_their_frames", async ({ page }, info) => {
  await openSpecimen(page, "TimerRing");
  const all = frames(page);
  const count = await all.count();
  expect(count).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < count; i++) {
    const frame = all.nth(i);
    const state = await frame.getAttribute("data-state");
    if (state === "seeded-overflow") continue;
    // The viewport slot holds the visually hidden wall-clock span (1x1 clip box by design); its own
    // test below checks the ring, task clamp and page fit.
    if (state === "timer-ring-viewport") continue;
    await expectFits(frame);
  }
  const dir = process.env.ORASENDA_SHOTS;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `seed-${info.project.name}.png`), fullPage: true });
  }
});

test("seeded_overflow_is_reported", async ({ page }) => {
  await openSpecimen(page, "TimerRing");
  const reported = await overflows(page.locator('[data-frame][data-state="seeded-overflow"]'));
  expect(reported.length).toBeGreaterThan(0);
});

test("bundled_fonts_loaded_for_every_family_and_weight", async ({ page }) => {
  await openSpecimen(page, "TimerRing");
  await expectBundledFontsLoaded(page);
});

test("no_request_leaves_the_specimen_server", async ({ page, baseURL }) => {
  const requests = recordRequests(page);
  await openSpecimen(page, "TimerRing");
  await expectBundledFontsLoaded(page);
  const origin = new URL(baseURL ?? "").origin;
  const seen = requests();
  expect(seen.length).toBeGreaterThan(0);
  for (const url of seen) {
    expect(url.origin, url.href).toBe(origin);
    expect(url.hostname).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  }
});

test("seed_focusables_meet_hit_min", async ({ page }) => {
  await openSpecimen(page, "TimerRing");
  expect(await smallTargets(page.locator("body"))).toEqual([]);
});

test("seed_focus_ring_visible_and_unclipped", async ({ page }) => {
  await openSpecimen(page, "TimerRing");
  const focusable = page.locator(
    "button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
  );
  const count = await focusable.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await pressTab(page);
    const active = page.locator(":focus");
    await expect(active).toHaveCount(1);
    await expectFocusRingVisible(active);
  }
});

test("reduced_motion_leaves_no_transition_or_animation", async ({ page }, info) => {
  test.skip(info.project.name !== "light-reduced-motion", "reduced motion project only");
  await openSpecimen(page, "TimerRing");
  expect(await animatedElements(page)).toEqual([]);
});

test("theme_query_applies_the_dark_tokens", async ({ page }, info) => {
  test.skip(info.project.name !== "light", "light scheme project only");
  const surface = async (theme: "light" | "dark") => {
    await openSpecimen(page, "TimerRing", { theme });
    return page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--surface").trim(),
    );
  };
  const light = await surface("light");
  const dark = await surface("dark");
  expect(light).not.toBe("");
  expect(dark).not.toBe(light);
});

test("seed_aria_snapshot", async ({ page }) => {
  await openSpecimen(page, "TimerRing");
  await expect(page.locator("[data-state='timer-ring-focus']")).toMatchAriaSnapshot(`
    - timer "Focus, 25:00 remaining"
  `);
  await expect(page.locator("[data-state='inline-notice-row-attention']")).toMatchAriaSnapshot(`
    - status: Focus didn't start. Custom focus needs 5 to 180 minutes.
    - button "Open Settings to change custom minutes": Open Settings
  `);
});

test.describe("viewport slot", () => {
  for (const [w, h] of [
    [390, 844],
    [1440, 900],
  ] as const) {
    test(`fluid_ring_follows_a_${w}x${h}_viewport`, async ({ page }, info) => {
      await page.setViewportSize({ width: w, height: h });
      await openSpecimen(page, "TimerRing");
      const min = await px(page, "--timer-min-size");
      const max = await px(page, "--timer-full-size");
      const slot = page.locator("[data-state='timer-ring-viewport']");
      const m = await slot.evaluate((el) => {
        const b = (
          el.querySelector("[data-slot=timer-ring]") as HTMLElement
        ).getBoundingClientRect();
        return { fw: el.clientWidth, fh: el.clientHeight, w: b.width, h: b.height };
      });
      const want = Math.min(Math.max(Math.min(m.fw, m.fh), min), max);
      expect(Math.abs(m.w - m.h), "round").toBeLessThanOrEqual(1);
      expect(Math.abs(m.w - want), "diameter").toBeLessThanOrEqual(1);
      await expectClampedFits(slot, "[data-slot=timer-ring-task]", 2);
      // Other specimen frames are fixed-width and may scroll the page; the slot itself must fit.
      const inView = await slot.evaluate(
        (el) => el.getBoundingClientRect().right <= window.innerWidth,
      );
      expect(inView, "slot fits the viewport width").toBe(true);
      await shoot(page, info, `timer-ring-${w}x${h}`);
    });
  }
});
