import { expect, type Locator, type Page, test } from "@playwright/test";
import { overflows } from "./support/fits.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";
import { animatedElements } from "./support/motion.ts";
import { shoot } from "./support/shots.ts";
import { openSpecimen, pressTab } from "./support/specimen.ts";

const WALLPAPERS = ["light", "mid", "dark"] as const;
const STATES = [
  "running",
  "paused",
  "warning",
  "idle",
  "ended",
  "deep",
  "break",
  "skip-break",
  "break-warning",
  "break-paused",
  "keep-going",
] as const;
const SIZES = [
  [280, 56],
  [280, 64],
  [360, 96],
] as const;

const frame = (page: Page, wall: string, state: string, w: number, h: number): Locator =>
  page.locator(`[data-frame][data-state="floating-timer-${wall}-${state}-${w}x${h}"]`);

test("floating_timer_fits_every_size_and_state", async ({ page }, info) => {
  await openSpecimen(page, "FloatingTimer");
  for (const wall of WALLPAPERS)
    for (const [w, h] of SIZES)
      for (const state of STATES) {
        const f = frame(page, wall, state, w, h);
        const label = `${wall} ${state} ${w}x${h}`;
        const over = (await overflows(f)).filter((line) => !line.includes("sr-only"));
        expect(over, label).toEqual([]);
        const box = await f.locator("[data-slot=floating-timer]").boundingBox();
        const outer = await f.boundingBox();
        expect(box, label).not.toBeNull();
        if (!box || !outer) continue;
        expect(box.width, label).toBeLessThanOrEqual(outer.width + 1);
        expect(box.height, label).toBeLessThanOrEqual(outer.height + 1);
      }
  await shoot(page, info, "floating-timer");
});

test("floating_timer_buttons_meet_hit_min_at_280x56", async ({ page }) => {
  await openSpecimen(page, "FloatingTimer");
  for (const wall of WALLPAPERS)
    for (const state of STATES)
      expect(await smallTargets(frame(page, wall, state, 280, 56)), `${wall} ${state}`).toEqual([]);
});

test("floating_timer_fill_is_opaque_and_the_drag_region_lands_on_the_body", async ({ page }) => {
  await openSpecimen(page, "FloatingTimer");
  const body = frame(page, "mid", "running", 280, 64).locator("[data-slot=floating-timer]");
  await expect(body).toHaveAttribute("data-tauri-drag-region", "");
  const fill = await body.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(fill).not.toMatch(/rgba|transparent/);
  expect(await body.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("1px");
  await expect(page.getByRole("button", { name: /close/i })).toHaveCount(0);
});

test("floating_timer_state_word_sits_on_its_own_line_from_88px", async ({ page }) => {
  await openSpecimen(page, "FloatingTimer");
  await expect(
    frame(page, "light", "running", 360, 96).locator("[data-slot=floating-timer-word]"),
  ).toBeVisible();
  await expect(
    frame(page, "light", "running", 280, 64).locator("[data-slot=floating-timer-word]"),
  ).toHaveCount(0);
});

test("floating_timer_state_word_threshold_is_the_window_height", async ({ page }) => {
  await openSpecimen(page, "FloatingTimer");
  const body = page.locator("[data-slot=floating-timer]").first();
  const word = body.locator("[data-slot=floating-timer-word]");
  for (const [h, shown] of [
    [88, true],
    [87, false],
  ] as const) {
    await body.evaluate((el, height) => {
      (el.parentElement as HTMLElement).style.height = `${height}px`;
      (el.parentElement as HTMLElement).style.width = "280px";
    }, h);
    await expect(word, `280x${h}`).toHaveCount(shown ? 1 : 0);
  }
});

test("floating_timer_keyboard_path_and_focus_rings", async ({ page }) => {
  await openSpecimen(page, "FloatingTimer");
  const f = frame(page, "light", "running", 280, 56);
  await f.locator("[data-slot=floating-timer]").focus();
  for (const name of ["Pause session", "Open Orasenda"]) {
    await pressTab(page);
    const button = f.getByRole("button", { name });
    await expect(button).toBeFocused();
    await expectFocusRingVisible(button);
  }
  const idle = frame(page, "light", "idle", 280, 56);
  const start = idle.getByRole("button", { name: "Start focus" });
  await start.focus();
  await expectFocusRingVisible(start);
  await pressTab(page);
  await expect(idle.getByRole("button", { name: "Open Orasenda" })).toBeFocused();
});

test("floating_timer_aria_snapshot", async ({ page }) => {
  await openSpecimen(page, "FloatingTimer");
  await expect(frame(page, "light", "running", 280, 64)).toMatchAriaSnapshot(`
    - group "Floating timer, Focus":
      - timer "Focus, 18 minutes 42 seconds remaining"
      - status
      - button "Pause session"
      - button "Open Orasenda"
  `);
  await expect(frame(page, "light", "ended", 280, 64)).toMatchAriaSnapshot(`
    - group "Floating timer, Session ended":
      - timer "No session"
      - status: Session ended.
      - button "Start focus"
      - button "Open Orasenda"
  `);
});

test("floating_timer_no_motion_when_reduced", async ({ page }, info) => {
  test.skip(info.project.name !== "light-reduced-motion", "reduced motion project only");
  await openSpecimen(page, "FloatingTimer");
  expect(await animatedElements(page)).toEqual([]);
});

test("floating_timer_actions_fit_280x56", async ({ page }) => {
  await openSpecimen(page, "FloatingTimer");
  for (const wall of WALLPAPERS)
    for (const state of ["skip-break", "break-warning", "break-paused", "keep-going"]) {
      const f = frame(page, wall, state, 280, 56);
      const body = f.locator("[data-slot=floating-timer]");
      const box = await body.boundingBox();
      expect(box, `${wall} ${state}`).not.toBeNull();
      // The widest button must end inside the panel, with the hit-min target kept.
      const buttons = await body.getByRole("button").evaluateAll((els) =>
        els.map((el) => {
          const b = el.getBoundingClientRect();
          return { left: b.left, right: b.right, width: b.width, height: b.height };
        }),
      );
      for (const b of buttons) {
        expect(b.height, `${wall} ${state} height`).toBeGreaterThanOrEqual(44);
        expect(b.width, `${wall} ${state} width`).toBeGreaterThanOrEqual(44);
        expect(b.right, `${wall} ${state} right`).toBeLessThanOrEqual(
          (box?.x ?? 0) + (box?.width ?? 0),
        );
      }
    }
  const brk = frame(page, "light", "skip-break", 280, 56);
  await expect(brk.getByRole("button", { name: "Skip break" })).toBeVisible();
  await expect(brk.getByRole("button", { name: "Pause session" })).toHaveCount(0);
  const warn = frame(page, "light", "break-warning", 280, 56);
  await expect(warn.getByRole("button", { name: "Skip break" })).toBeVisible();
  const paused = frame(page, "light", "break-paused", 280, 56);
  await expect(paused.getByRole("button", { name: "Resume break" })).toBeVisible();
  await expect(paused.getByRole("button", { name: "Skip break" })).toHaveCount(0);
  const keep = frame(page, "light", "keep-going", 280, 56);
  await expect(keep.getByRole("button", { name: "Keep going with Steady Focus" })).toBeVisible();
  await expect(keep.getByRole("button", { name: "Start focus" })).toHaveCount(0);
});

test("floating_timer_action_keyboard_path", async ({ page }) => {
  await openSpecimen(page, "FloatingTimer");
  for (const [state, name] of [
    ["skip-break", "Skip break"],
    ["keep-going", "Keep going with Steady Focus"],
  ] as const) {
    const f = frame(page, "light", state, 280, 56);
    const button = f.getByRole("button", { name });
    await button.focus();
    await expectFocusRingVisible(button);
    await pressTab(page);
    await expect(f.getByRole("button", { name: "Open Orasenda" })).toBeFocused();
  }
});
