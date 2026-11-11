import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { pressTab } from "./support/specimen.ts";

const SIZES = [
  { width: 360, height: 240 },
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
];

/** The focused element's label (its name, or its text); `null` once focus has left the page's content. */
async function focusedName(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    return el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
  });
}

/** Every stop, the rail's included, shows its whole ring. */
async function checkRing(page: Page): Promise<void> {
  await expectFocusRingVisible(page.locator(":focus"));
}

// Tab order (spec C): Pages (compact) or the rail, the summary (C5), the status action, then the controls.
for (const size of SIZES) {
  test(`today_focus_ring_each_stop_idle_${size.width}x${size.height}`, async ({ page }) => {
    await openApp(page, "startError", size);
    await page.getByRole("button", { name: "Start focus" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: /isn't responding/ })
      .waitFor();
    await page.mouse.click(1, 1);

    const stops: string[] = [];
    for (let i = 0; i < 12; i++) {
      await pressTab(page);
      const name = await focusedName(page);
      if (name === null || stops.includes(name)) break;
      stops.push(name);
      await checkRing(page);
    }
    const at = (needle: RegExp) => stops.findIndex((s) => needle.test(s));
    if (size.width < 640 || size.height < 480) expect(stops[0]).toMatch(/Pages/);
    expect(at(/^Preset /), `${stops}`).toBeGreaterThanOrEqual(0);
    expect(at(/^Preset /)).toBeLessThan(at(/Try again/));
    expect(at(/Try again/)).toBeLessThan(at(/Start focus|Start/));
    expect(at(/Start/)).toBeLessThan(at(/Just 2 minutes/));
  });

  test(`today_focus_ring_each_stop_running_${size.width}x${size.height}`, async ({ page }) => {
    await openApp(page, "running", size);
    await page.mouse.click(1, 1);
    const stops: string[] = [];
    for (let i = 0; i < 12; i++) {
      await pressTab(page);
      const name = await focusedName(page);
      if (name === null || stops.includes(name)) break;
      stops.push(name);
      await checkRing(page);
    }
    const summary = stops.findIndex((s) => /^Preset /.test(s));
    const pause = stops.findIndex((s) => /Pause session/.test(s));
    const end = stops.findIndex((s) => /End session/.test(s));
    expect(summary, `${stops}`).toBeGreaterThanOrEqual(0);
    expect(summary).toBeLessThan(pause);
    expect(pause, `${stops}`).toBeGreaterThanOrEqual(0);
    expect(pause).toBeLessThan(end);
  });
}
