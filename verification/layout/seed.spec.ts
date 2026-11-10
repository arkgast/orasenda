import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { expectFits, overflows } from "./support/fits.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { expectBundledFontsLoaded } from "./support/fonts.ts";
import { smallTargets } from "./support/hitTargets.ts";
import { animatedElements } from "./support/motion.ts";
import { recordRequests } from "./support/network.ts";
import { frames, openSpecimen, pressTab } from "./support/specimen.ts";

test("playwright_launches_webkit", async ({ browser }) => {
  console.log(`webkit ${browser.version()}`);
  expect(browser.browserType().name()).toBe("webkit");
});

test("seed_states_fit_their_frames", async ({ page }, info) => {
  await openSpecimen(page, "Seed");
  const all = frames(page);
  const count = await all.count();
  expect(count).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < count; i++) {
    const frame = all.nth(i);
    if ((await frame.getAttribute("data-state")) === "seeded-overflow") continue;
    await expectFits(frame);
  }
  const dir = process.env.ORASENDA_SHOTS;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `seed-${info.project.name}.png`), fullPage: true });
  }
});

test("seeded_overflow_is_reported", async ({ page }) => {
  await openSpecimen(page, "Seed");
  const reported = await overflows(page.locator('[data-frame][data-state="seeded-overflow"]'));
  expect(reported.length).toBeGreaterThan(0);
});

test("bundled_fonts_loaded_for_every_family_and_weight", async ({ page }) => {
  await openSpecimen(page, "Seed");
  await expectBundledFontsLoaded(page);
});

test("no_request_leaves_the_specimen_server", async ({ page, baseURL }) => {
  const requests = recordRequests(page);
  await openSpecimen(page, "Seed");
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
  await openSpecimen(page, "Seed");
  expect(await smallTargets(page.locator("body"))).toEqual([]);
});

test("seed_focus_ring_visible_and_unclipped", async ({ page }) => {
  await openSpecimen(page, "Seed");
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
  await openSpecimen(page, "Seed");
  expect(await animatedElements(page)).toEqual([]);
});

test("theme_query_applies_the_dark_tokens", async ({ page }, info) => {
  test.skip(info.project.name !== "light", "light scheme project only");
  const surface = async (theme: "light" | "dark") => {
    await openSpecimen(page, "Seed", { theme });
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
  await openSpecimen(page, "Seed");
  await expect(page.locator("body")).toMatchAriaSnapshot(`
    - paragraph: timer-ring-focus
    - timer "Focus, 25:00 remaining"
    - paragraph: inline-notice-row-attention
    - status: Focus didn't start. Custom focus needs 5 to 180 minutes.
    - button "Open Settings to change custom minutes": Open Settings
    - paragraph: seeded-overflow
  `);
});
