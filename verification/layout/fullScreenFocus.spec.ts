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

test("full_screen_focus_two_line_intent_fits_every_frame", async ({ page }) => {
  await openSpecimen(page, "FullScreenFocus");
  for (const { w, h, layout } of SIZES) {
    for (const mode of MODES) {
      const f = frame(page, mode, w, h);
      // The ring's idle name is "No session" without the intent: the intent is a hidden line after the ring.
      const quiet = layout === "ring" && (mode === "idle" || mode === "ended");
      const name = quiet
        ? await f.locator("[data-slot=full-screen-focus-ring] > .sr-only").first().textContent()
        : await f.locator("[role=timer]").getAttribute("aria-label");
      expect(name, `${mode} ${w}x${h} name`).toContain("Finish the chapter 3 outline");
      const task = f.locator("[data-slot=timer-ring-task], [data-slot=timer-strip-task]");
      if (layout === "stackedStrip") {
        // The window minimum has no room for the line: it is hidden, and still whole in the name.
        await expect(task, `${mode} ${w}x${h}`).toBeHidden();
        continue;
      }
      await expect(task, `${mode} ${w}x${h}`).toBeVisible();
      const lines = await task.evaluate((el) => {
        const lh = Number.parseFloat(getComputedStyle(el).lineHeight);
        return el.getBoundingClientRect().height / lh;
      });
      expect(lines, `${mode} ${w}x${h} lines`).toBeLessThanOrEqual(2.01);
      const inside = await task.evaluate((el) => {
        const t = el.getBoundingClientRect();
        const p = el.closest("[data-slot=full-screen-focus]")?.getBoundingClientRect();
        return (
          !!p && t.top >= p.top && t.bottom <= p.bottom && t.left >= p.left && t.right <= p.right
        );
      });
      expect(inside, `${mode} ${w}x${h} inside`).toBe(true);
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
  const dialog = page.getByRole("dialog", { name: "Leave full screen?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Stay in full screen" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
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

test("full_screen_focus_esc_opens_the_dialog_while_the_leave_tooltip_shows", async ({ page }) => {
  await openSpecimen(page, "FullScreenFocus");
  const f = frame(page, "focus", 1280, 720);
  await section(f).focus();
  await pressTab(page);
  await expect(f.getByRole("button", { name: "Leave full screen" })).toBeFocused();
  await expect(page.locator("[data-slot=tooltip]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Leave full screen?" })).toBeVisible();
});

test("focus_views_aria_snapshot", async ({ page }) => {
  await openSpecimen(page, "FullScreenFocus");
  await expect(frame(page, "focus", 1280, 720)).toMatchAriaSnapshot(`
    - region "Full-screen focus":
      - button "Leave full screen"
      - status
      - timer "Focus, 18 minutes 42 seconds remaining, Finish the chapter 3 outline and send the draft to Maya, Wall clock, 09:41"
      - button "Pause session"
      - button "End session"
  `);
  await expect(frame(page, "ended", 1000, 440)).toMatchAriaSnapshot(`
    - region "Full-screen focus":
      - button "Leave full screen"
      - status: Session ended.
      - timer "No session, Finish the chapter 3 outline and send the draft to Maya"
      - button "Start focus"
  `);
});

test("focus_views_no_motion_when_reduced", async ({ page }, info) => {
  test.skip(info.project.name !== "light-reduced-motion", "reduced motion project only");
  await openSpecimen(page, "FullScreenFocus");
  expect(await animatedElements(page)).toEqual([]);
});

const ACTION_MODES = ["plus-ten", "skip-break", "take-break", "keep-going"] as const;

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
});
