import { expect, type Page, test } from "@playwright/test";
import { APP_URL } from "./support/app.ts";
import { overflows } from "./support/fits.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";
import { animatedElements } from "./support/motion.ts";
import { pressTab } from "./support/specimen.ts";

// The floater page (`layout.html?surface=floater`) at the three floater sizes (floating-timer.md),
// in the states D renders: running, paused, deep (1:29:59), idle and ended. Break and warning
// belong to E's last task. Light and dark come from the projects; one project is reduced motion.
const SIZES = [
  { width: 280, height: 56 },
  { width: 280, height: 64 },
  { width: 360, height: 96 },
] as const;

const STATES = [
  { scenario: "running", group: "Floating timer, Focus", first: "Pause session" },
  { scenario: "paused", group: "Floating timer, Paused", first: "Resume session" },
  { scenario: "deepRunning", group: "Floating timer, Focus", first: "Pause session" },
  { scenario: "idle", group: "Floating timer, No session", first: "Start focus" },
  { scenario: "ended", group: "Floating timer, Session ended", first: "Start focus" },
] as const;

async function openFloater(
  page: Page,
  scenario: string,
  group: string,
  size: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(size);
  await page.goto(
    `${APP_URL}/layout.html?${new URLSearchParams({ scenario, surface: "floater" })}`,
  );
  if (scenario === "ended") {
    // The ended milestone is an event the page takes once it listens (deterministic here).
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { __layoutEmitEnded?: unknown }).__layoutEmitEnded ===
        "function",
    );
    await page.getByRole("button", { name: "Start focus" }).waitFor();
    await page.evaluate(() =>
      (window as unknown as { __layoutEmitEnded: () => void }).__layoutEmitEnded(),
    );
  }
  await page.getByRole("group", { name: group }).waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

for (const size of SIZES) {
  for (const { scenario, group, first } of STATES) {
    test(`floater_window_fits_${size.width}x${size.height}_${scenario}`, async ({ page }) => {
      await openFloater(page, scenario, group, size);

      // No scroll, in either direction.
      const scroll = await page.evaluate(() => ({
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
      }));
      expect(scroll.w, "no horizontal scroll").toBeLessThanOrEqual(size.width);
      expect(scroll.h, "no vertical scroll").toBeLessThanOrEqual(size.height);

      // Everything inside the viewport: the panel and every control.
      const inside = await page.evaluate(({ width, height }) => {
        const out: string[] = [];
        const nodes = document.querySelectorAll("[data-slot=floating-timer], button");
        for (const el of Array.from(nodes)) {
          const r = el.getBoundingClientRect();
          if (r.left < 0 || r.top < 0 || r.right > width + 0.5 || r.bottom > height + 0.5) {
            out.push(
              `${el.getAttribute("aria-label") ?? el.getAttribute("data-slot")}: ${r.left},${r.top},${r.right},${r.bottom}`,
            );
          }
        }
        return out;
      }, size);
      expect(inside, "everything is inside the window").toEqual([]);
      const spill = (await overflows(page.locator("main"))).filter(
        (line) => !line.includes("sr-only"),
      );
      expect(spill, "nothing overflows").toEqual([]);

      // Targets are at least hit-min (44 x 44).
      expect(await smallTargets(page.locator("body")), "targets are 44px").toEqual([]);

      // The drag region is the body, and there is no End or Close inside the panel.
      await expect(page.getByRole("group", { name: group })).toHaveAttribute(
        "data-tauri-drag-region",
        "",
      );
      await expect(page.getByRole("button", { name: /^(end|stop|close)/i })).toHaveCount(0);

      // The focus ring shows at each stop: the first action, then Open Orasenda.
      await pressTab(page);
      await expect(page.getByRole("button", { name: first })).toBeFocused();
      await expectFocusRingVisible(page.getByRole("button", { name: first }));
      await pressTab(page);
      await expect(page.getByRole("button", { name: "Open Orasenda" })).toBeFocused();
      await expectFocusRingVisible(page.getByRole("button", { name: "Open Orasenda" }));
    });
  }
}

// The reduced-motion project only: nothing on the floater animates or transitions.
for (const { scenario, group } of STATES) {
  test(`floater_no_motion_reduced_${scenario}`, async ({ page }, info) => {
    test.skip(info.project.name !== "light-reduced-motion", "reduced motion only");
    await openFloater(page, scenario, group, { width: 280, height: 64 });
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
      true,
    );
    expect(await animatedElements(page)).toEqual([]);
  });
}
