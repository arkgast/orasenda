import { expect, type Locator, type Page, test } from "@playwright/test";
import { overflows } from "./support/fits.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";
import { animatedElements } from "./support/motion.ts";
import { shoot } from "./support/shots.ts";
import { openSpecimen, pressTab } from "./support/specimen.ts";

const MODES = ["focus", "paused", "idle", "break", "warning", "ended"] as const;
const SIZES = [
  { w: 1280, h: 720, layout: "ring" },
  { w: 1920, h: 1080, layout: "ring" },
  { w: 1000, h: 440, layout: "strip" },
  { w: 360, h: 240, layout: "stackedStrip" },
  { w: 390, h: 844, layout: "ring" },
  { w: 1440, h: 900, layout: "ring" },
] as const;

const frame = (page: Page, mode: string, w: number, h: number): Locator =>
  page.locator(`[data-frame][data-state="full-screen-focus-${mode}-${w}x${h}"]`);
const section = (f: Locator): Locator => f.locator("[data-slot=full-screen-focus]");

test("full_screen_focus_ring_at_phone_desktop_and_big_frames", async ({ page }, info) => {
  await openSpecimen(page, "FullScreenFocus");
  for (const { w, h, layout } of SIZES.filter((s) => s.layout === "ring")) {
    for (const mode of MODES) {
      const f = frame(page, mode, w, h);
      await expect(section(f), `${mode} ${w}x${h}`).toHaveAttribute("data-layout", layout);
      const ring = await f.locator("[data-slot=timer-ring]").boundingBox();
      expect(ring, `${mode} ${w}x${h} ring`).not.toBeNull();
      if (!ring) continue;
      expect(Math.abs(ring.width - ring.height), "round").toBeLessThanOrEqual(1);
      // The time track is 460 at 1280x720; at 1920x1080 the ring stops at timer-full-size. The phone
      // and xl frames only need a ring that fits, which the overflow check below holds.
      if (w === 1280 || w === 1920)
        expect(ring.width, `${mode} ${w}x${h} ring size`).toBeCloseTo(w === 1280 ? 460 : 560, -1);
      const over = (await overflows(f)).filter((line) => !line.includes("sr-only"));
      expect(over, `${mode} ${w}x${h}`).toEqual([]);
    }
  }
  await shoot(page, info, "full-screen-focus");
});

test("controls_centred_below_ring", async ({ page }) => {
  await openSpecimen(page, "FullScreenFocus");
  for (const { w, h } of SIZES.filter((s) => s.w >= 1280 && s.layout === "ring")) {
    const f = frame(page, "focus", w, h);
    const ring = await f.locator("[data-slot=timer-ring]").boundingBox();
    const view = await section(f).boundingBox();
    const pause = await f.getByRole("button", { name: "Pause session" }).boundingBox();
    const end = await f.getByRole("button", { name: "End session" }).boundingBox();
    if (!(ring && view && pause && end)) throw new Error(`${w}x${h}: missing box`);
    const middle = (ring.y + ring.height + view.y + view.height) / 2;
    expect(Math.abs(pause.y + pause.height / 2 - middle), `${w}x${h} centred`).toBeLessThanOrEqual(
      1,
    );
    // space-8 (64px) between the two.
    expect(end.x - (pause.x + pause.width), `${w}x${h} gap`).toBeCloseTo(64, 0);
  }
});

test("hint_row_keeps_height", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openSpecimen(page, "FullScreenFocus");
  for (const { w, h } of SIZES) {
    const shown = await frame(page, "hint-visible", w, h)
      .locator("[data-slot=full-screen-focus-caption]")
      .boundingBox();
    const faded = frame(page, "hint-faded", w, h).locator("[data-slot=full-screen-focus-caption]");
    const box = await faded.boundingBox();
    expect(box?.height, `${w}x${h} height`).toBeCloseTo(shown?.height ?? -1, 0);
    expect(box?.height, `${w}x${h} 18px`).toBeCloseTo(18, 0);
    await expect(faded).toHaveCSS("opacity", "0");
    await expect(faded).toHaveCSS("transition-duration", "1.6s");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const calm = frame(page, "hint-faded", 1280, 720).locator(
    "[data-slot=full-screen-focus-caption]",
  );
  await expect(calm).toHaveCSS("transition-duration", "0s");
});

test("full_screen_focus_strip_in_strip_frame", async ({ page }) => {
  await openSpecimen(page, "FullScreenFocus");
  for (const { w, h, layout } of SIZES.filter((s) => s.layout !== "ring")) {
    for (const mode of MODES) {
      const f = frame(page, mode, w, h);
      await expect(section(f), `${mode} ${w}x${h}`).toHaveAttribute("data-layout", layout);
      await expect(f.locator("[data-slot=timer-strip]")).toHaveCount(1);
      await expect(f.locator("[data-slot=timer-ring]")).toHaveCount(0);
      const over = (await overflows(f)).filter((line) => !line.includes("sr-only"));
      expect(over, `${mode} ${w}x${h}`).toEqual([]);
    }
  }
});

test("full_screen_focus_has_no_task_slot_in_any_frame", async ({ page }) => {
  await openSpecimen(page, "FullScreenFocus");
  for (const { w, h } of SIZES) {
    for (const mode of MODES) {
      const f = frame(page, mode, w, h);
      await expect(f.locator("[data-slot$=-task]"), `${mode} ${w}x${h}`).toHaveCount(0);
      const name = await f.locator("[role=timer]").getAttribute("aria-label");
      expect(name, `${mode} ${w}x${h} name`).not.toContain("Finish the chapter");
    }
  }
});

test("full_screen_focus_controls_are_hit_min", async ({ page }) => {
  await openSpecimen(page, "FullScreenFocus");
  for (const { w, h } of SIZES)
    for (const mode of MODES)
      expect(await smallTargets(frame(page, mode, w, h)), `${mode} ${w}x${h}`).toEqual([]);
});

test("full_screen_focus_keyboard_path", async ({ page }) => {
  await openSpecimen(page, "FullScreenFocus");
  const f = frame(page, "focus", 1280, 720);
  await section(f).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(section(f)).toBeFocused();
  for (const name of ["Leave full screen", "Pause session", "End session"]) {
    await pressTab(page);
    await expect(f.getByRole("button", { name })).toBeFocused();
  }
  const idle = frame(page, "idle", 1280, 720);
  await section(idle).focus();
  for (const name of ["Leave full screen", "Start focus"]) {
    await pressTab(page);
    await expect(idle.getByRole("button", { name })).toBeFocused();
  }
});

test("full_screen_focus_focus_ring_is_not_clipped", async ({ page }) => {
  await openSpecimen(page, "FullScreenFocus");
  const f = frame(page, "focus", 360, 240);
  await section(f).focus();
  for (const name of ["Leave full screen", "Pause session"]) {
    await pressTab(page);
    const button = f.getByRole("button", { name });
    await expect(button).toBeFocused();
    await expectFocusRingVisible(button);
  }
});

test("full_screen_focus_esc_hides_the_leave_tooltip_and_opens_no_dialog", async ({ page }) => {
  await openSpecimen(page, "FullScreenFocus");
  const f = frame(page, "focus", 1280, 720);
  await section(f).focus();
  await pressTab(page);
  await expect(f.getByRole("button", { name: "Leave full screen" })).toBeFocused();
  await expect(page.locator("[data-slot=tooltip]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-slot=tooltip]")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The single Esc reached the view: it left.
  await expect(f.locator("[data-left=true]")).toHaveCount(1);
});

test("focus_views_aria_snapshot", async ({ page }) => {
  await openSpecimen(page, "FullScreenFocus");
  await expect(frame(page, "focus", 1280, 720)).toMatchAriaSnapshot(`
    - region "Full-screen focus":
      - button "Leave full screen"
      - status
      - timer "Focus, 18 minutes 42 seconds remaining, Wall clock, 09:41"
      - button "Pause session"
      - button "End session"
  `);
  await expect(frame(page, "ended", 1000, 440)).toMatchAriaSnapshot(`
    - region "Full-screen focus":
      - button "Leave full screen"
      - status: Session ended.
      - timer "No session"
      - button "Start focus"
  `);
});

test("focus_views_no_motion_when_reduced", async ({ page }, info) => {
  test.skip(info.project.name !== "light-reduced-motion", "reduced motion project only");
  await openSpecimen(page, "FullScreenFocus");
  expect(await animatedElements(page)).toEqual([]);
});

const ACTION_MODES = [
  "plus-ten",
  "skip-break",
  "break-two",
  "break-warning",
  "break-paused",
  "take-break",
  "keep-going",
] as const;

test("full_screen_focus_break_actions_fit_every_frame_without_growing_the_track", async ({
  page,
}) => {
  await openSpecimen(page, "FullScreenFocus");
  for (const { w, h } of SIZES)
    for (const mode of ACTION_MODES) {
      const f = frame(page, mode, w, h);
      const label = `${mode} ${w}x${h}`;
      const over = (await overflows(f)).filter((line) => !line.includes("sr-only"));
      expect(over, label).toEqual([]);
      expect(await smallTargets(f), label).toEqual([]);
      const row = await f.locator("[data-slot=full-screen-focus-controls]").boundingBox();
      expect(row?.height, `${label} track`).toBeCloseTo(52, 0);
      const inside = await f
        .locator("[data-slot=full-screen-focus-controls] [data-slot=button]")
        .evaluateAll((els, rowRect) => {
          const r = rowRect as { x: number; width: number };
          return els.every((el) => {
            const b = el.getBoundingClientRect();
            return b.left >= r.x - 1 && b.right <= r.x + r.width + 1;
          });
        }, row);
      expect(inside, `${label} inside the row`).toBe(true);
    }
});

test("full_screen_focus_break_actions_tab_after_end", async ({ page }) => {
  await openSpecimen(page, "FullScreenFocus");
  const f = frame(page, "plus-ten", 1280, 720);
  await section(f).focus();
  for (const name of [
    "Leave full screen",
    "Pause session",
    "End session",
    "Add 10 minutes of focus",
  ]) {
    await pressTab(page);
    const button = f.getByRole("button", { name });
    await expect(button).toBeFocused();
    await expectFocusRingVisible(button);
  }
  const offer = frame(page, "keep-going", 1280, 720);
  await section(offer).focus();
  for (const name of ["Leave full screen", "Keep going with Steady Focus", "Stop here"]) {
    await pressTab(page);
    await expect(offer.getByRole("button", { name })).toBeFocused();
  }
  await expect(offer.getByRole("button", { name: "Start focus" })).toHaveCount(0);
  await expect(
    frame(page, "skip-break", 1280, 720).getByRole("button", { name: "End break" }),
  ).toBeVisible();
  const two = frame(page, "break-two", 1280, 720);
  await section(two).focus();
  for (const name of [
    "Leave full screen",
    "Pause break",
    "End break",
    "Back to focus for 10 more minutes",
    "Skip break",
  ]) {
    await pressTab(page);
    const button = two.getByRole("button", { name });
    await expect(button).toBeFocused();
    await expectFocusRingVisible(button);
  }
  const warn = frame(page, "break-warning", 1280, 720);
  await expect(warn.getByRole("button", { name: "End break" })).toBeVisible();
  await expect(warn.getByRole("button", { name: "Pause break" })).toBeVisible();
  await expect(
    frame(page, "break-paused", 1280, 720).getByRole("button", { name: "Resume break" }),
  ).toBeVisible();
  // The offer's first action is the one primary.
  await expect(offer.getByRole("button", { name: "Keep going with Steady Focus" })).toHaveAttribute(
    "data-variant",
    "primary",
  );
});

test("full_screen_focus_status_line_stays_one_row", async ({ page }) => {
  await openSpecimen(page, "FullScreenFocus");
  for (const { w, h } of SIZES) {
    const f = frame(page, "status", w, h);
    const line = f.locator("[data-slot=full-screen-focus-status]");
    await expect(line, `${w}x${h}`).toContainText("can't reach the timer");
    const box = await line.boundingBox();
    expect(box?.height, `${w}x${h} one line`).toBeLessThanOrEqual(18.5);
    const fb = await f.boundingBox();
    expect(box && fb, `${w}x${h} boxes`).toBeTruthy();
    expect(box!.x, `${w}x${h} left`).toBeGreaterThanOrEqual(fb!.x - 0.5);
    expect(box!.x + box!.width, `${w}x${h} right`).toBeLessThanOrEqual(fb!.x + fb!.width + 0.5);
    // The status paragraph's own ellipsis (scrollWidth > clientWidth) is expected; nothing else is.
    const own = await line.evaluate(
      (el) =>
        `p.${el.className.split(" ")[0]} (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`,
    );
    const over = (await overflows(f)).filter((l) => !l.includes("sr-only") && !l.includes(own));
    expect(over, `${w}x${h}`).toEqual([]);
  }
});
