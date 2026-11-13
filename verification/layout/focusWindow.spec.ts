import { expect, type Page, test } from "@playwright/test";
import { APP_URL } from "./support/app.ts";
import { overflows } from "./support/fits.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";
import { digitsInsideRing } from "./support/ring.ts";
import { pressTab } from "./support/specimen.ts";

// The Focus window page (`layout.html?surface=focus`), as the real page against mockIPC.
// Each state is a scenario; "ended" is the idle scenario plus the end milestone the harness sends.
const SIZES = [
  { w: 1280, h: 720, layout: "ring" },
  { w: 1920, h: 1080, layout: "ring" },
  { w: 390, h: 844, layout: "ring" },
  { w: 1440, h: 900, layout: "ring" },
  { w: 1000, h: 440, layout: "strip" },
  { w: 360, h: 240, layout: "stackedStrip" },
] as const;
const STATES = [
  { name: "focus", scenario: "running", primary: /Pause session/ },
  { name: "paused", scenario: "paused", primary: /Resume session/ },
  { name: "idle", scenario: "idle", primary: /Start focus/ },
  { name: "ended", scenario: "ended", primary: /Start focus/ },
  { name: "break", scenario: "breakShort", primary: /Pause break/ },
  { name: "warning", scenario: "warning", primary: /Pause session/ },
  { name: "autoStep", scenario: "autoStep", primary: /Pause session/ },
  { name: "intent", scenario: "intentSet", primary: /Pause session/ },
  { name: "offer", scenario: "keepGoing", primary: /Keep going/ },
] as const;
// The menu bar above and the Dock below, as a real display reports them. A 360x240 window is
// smaller than any display's visible frame, so it has no inset case (recorded in the PR body).
const INSETS = { top: 24, right: 0, bottom: 64, left: 0 };

async function openFocus(
  page: Page,
  scenario: string,
  size: { w: number; h: number },
  insets: boolean,
): Promise<void> {
  await page.setViewportSize({ width: size.w, height: size.h });
  const query = new URLSearchParams({ scenario, surface: "focus", displays: "2" });
  if (insets) {
    query.set("insets", [INSETS.top, INSETS.right, INSETS.bottom, INSETS.left].join(","));
  }
  await page.goto(`${APP_URL}/layout.html?${query}`);
  await page.getByRole("region", { name: "Full-screen focus" }).waitFor();
  await page
    .getByRole("button", {
      name: /Start focus|Pause session|Resume session|Pause break|Keep going/,
    })
    .waitFor();
  if (scenario === "ended") {
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { __layoutEmitEnded?: unknown }).__layoutEmitEnded ===
        "function",
    );
    await page.evaluate(() =>
      (window as unknown as { __layoutEmitEnded(): void }).__layoutEmitEnded(),
    );
    await expect(page.getByRole("status")).toHaveText("Session ended.");
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

for (const size of SIZES) {
  for (const state of STATES) {
    for (const withInsets of [false, true]) {
      if (withInsets && size.h < 440) continue;
      const label = `${size.w}x${size.h}_${state.name}${withInsets ? "_insets" : ""}`;

      test(`focus_window_fits_${label}`, async ({ page }) => {
        await openFocus(page, state.scenario, size, withInsets);
        const section = page.locator("[data-slot=full-screen-focus]");
        await expect(section).toHaveAttribute("data-layout", size.layout);

        const m = await page.evaluate(() => ({
          w: document.documentElement.scrollWidth,
          h: document.documentElement.scrollHeight,
        }));
        expect(m.h, "no vertical scroll").toBeLessThanOrEqual(size.h);
        expect(m.w, "no horizontal scroll").toBeLessThanOrEqual(size.w);

        // The page fills the window; the content sits inside the insets.
        const inset = withInsets ? INSETS : { top: 0, right: 0, bottom: 0, left: 0 };
        const box = await section.boundingBox();
        expect(box, "the section is on the page").not.toBeNull();
        const b = box as { x: number; y: number; width: number; height: number };
        expect(b.x).toBeCloseTo(inset.left, 0);
        expect(b.y).toBeCloseTo(inset.top, 0);
        expect(b.x + b.width).toBeCloseTo(size.w - inset.right, 0);
        expect(b.y + b.height).toBeCloseTo(size.h - inset.bottom, 0);
        const page0 = await page.locator("[data-slot=focus-page]").boundingBox();
        expect(page0?.width).toBeCloseTo(size.w, 0);
        expect(page0?.height).toBeCloseTo(size.h, 0);

        // Every control is inside the viewport and the insets, at least 44x44.
        const buttons = await page.getByRole("button").all();
        expect(buttons.length).toBeGreaterThan(0);
        for (const button of buttons) {
          const r = await button.boundingBox();
          const name = (await button.getAttribute("aria-label")) ?? (await button.textContent());
          expect(r, `${name} is on the page`).not.toBeNull();
          const c = r as { x: number; y: number; width: number; height: number };
          expect(c.x, `${name} left`).toBeGreaterThanOrEqual(inset.left - 0.5);
          expect(c.y, `${name} top`).toBeGreaterThanOrEqual(inset.top - 0.5);
          expect(c.x + c.width, `${name} right`).toBeLessThanOrEqual(size.w - inset.right + 0.5);
          expect(c.y + c.height, `${name} bottom`).toBeLessThanOrEqual(size.h - inset.bottom + 0.5);
        }
        await expect(page.getByRole("button", { name: state.primary })).toBeVisible();
        expect(await smallTargets(page.locator("body")), "targets are 44px").toEqual([]);
        const over = (await overflows(page.locator("[data-slot=full-screen-focus]"))).filter(
          (line) => !line.includes("sr-only"),
        );
        expect(over).toEqual([]);
      });

      test(`focus_window_focus_ring_${label}`, async ({ page }) => {
        await openFocus(page, state.scenario, size, withInsets);
        await expect(page.locator("[data-slot=full-screen-focus]")).toBeFocused();
        // The README tab order: Leave full screen, the primary button, End (or the preset summary).
        const stops = 3;
        for (let stop = 0; stop < stops; stop++) {
          await pressTab(page);
          const focused = page.locator(":focus");
          await expect(focused.first()).toBeVisible();
          await expectFocusRingVisible(focused.first());
        }
      });
    }
  }
}

// Goal 1 in the Focus window: Deep Work's "1:29:59" inside the ring at every ring size.
test("focus_window_running_deep_digits_inside_ring", async ({ page }) => {
  for (const size of SIZES.filter((s) => s.layout === "ring")) {
    await openFocus(page, "runningDeep", size, false);
    const r = await digitsInsideRing(page, page.locator("[data-slot=full-screen-focus]"));
    const md = await page.evaluate(() =>
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--type-timer-md-font-size"),
      ),
    );
    const label = `${size.w}x${size.h}`;
    expect(md, `${label}: timer-md is read`).toBeGreaterThan(0);
    expect(r.fontSize, `${label}: never below timer-md`).toBeGreaterThanOrEqual(md - 0.5);
    await expect(page.locator("[data-slot=timer-ring-digits]")).toHaveAttribute(
      "data-length",
      "long",
    );
    expect(r.circleProblems, label).toEqual([]);
    if (r.fontSize > md + 0.5) expect(r.problems, label).toEqual([]);
  }
});

// A break with "+10 min" and "Skip break": both show at every size (the fit checks above cover them).
test("focus_window_break_shows_two_actions", async ({ page }) => {
  for (const size of SIZES) {
    await openFocus(page, "breakShort", size, false);
    const controls = page.locator("[data-slot=full-screen-focus-controls]");
    await expect(
      controls.getByRole("button", { name: "Back to focus for 10 more minutes" }),
      `${size.w}x${size.h}`,
    ).toBeVisible();
    await expect(controls.getByRole("button", { name: "Skip break" })).toBeVisible();
  }
});
