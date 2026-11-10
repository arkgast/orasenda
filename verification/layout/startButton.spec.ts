import { expect, type Locator, type Page, test } from "@playwright/test";
import { overflows } from "./support/fits.ts";
import { expectVisibleFits } from "./support/fitsVisible.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";
import { animatedElements } from "./support/motion.ts";
import { shoot } from "./support/shots.ts";
import { frames, openSpecimen, pressTab } from "./support/specimen.ts";

const frame = (page: Page, state: string) => page.locator(`[data-frame][data-state="${state}"]`);

/** In the compact form the full label is visually hidden in a 1x1 clip box, like .os-sr-only. */
async function expectFitsWithHiddenFull(f: Locator) {
  const reported = await overflows(f);
  expect(
    reported.filter((l) => !l.includes(".os-sr-only") && !l.includes("span.os-start-full")),
  ).toEqual([]);
}

/** The label span a sighted user can read: wider than the 1px sr-only box and not display:none. */
const shown = (page: Page, state: string) =>
  frame(page, state)
    .locator(".os-start-btn")
    .evaluate((btn) =>
      Array.from(btn.querySelectorAll(".os-start-full, .os-start-compact"))
        .filter((s) => s.getBoundingClientRect().width > 1)
        .map((s) => s.textContent),
    );

test("start_button_label_switches_at_400px_content", async ({ page }, info) => {
  await openSpecimen(page, "StartButton");
  expect(await shown(page, "start-button-compact-399")).toEqual(["Start"]);
  expect(await shown(page, "start-button-compact-400")).toEqual(["Start focus"]);
  for (const state of ["start-button-compact-399", "start-button-compact-400"]) {
    await expect(frame(page, state).getByRole("button", { name: "Start focus" })).toHaveCount(1);
    await expectFitsWithHiddenFull(frame(page, state));
  }
  const all = frames(page);
  for (let i = 0; i < (await all.count()); i++) {
    const f = all.nth(i);
    if ((await f.getAttribute("data-state")) === "start-button-compact-399") continue;
    await expectVisibleFits(f);
  }
  await shoot(page, info, "start-button");
});

test("start_button_hit_targets", async ({ page }) => {
  await openSpecimen(page, "StartButton");
  const all = frames(page);
  for (let i = 0; i < (await all.count()); i++) expect(await smallTargets(all.nth(i))).toEqual([]);
});

test("start_button_keyboard_path", async ({ page }) => {
  await openSpecimen(page, "StartButton");
  const press = async (state: string, names: string[]) => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.evaluate((s) => {
      const f = document.querySelector(`[data-state="${s}"]`) as HTMLElement;
      // Put the starting point just before the frame, then use the real key.
      const marker = document.createElement("span");
      marker.tabIndex = -1;
      marker.id = "start-marker";
      f.before(marker);
      marker.focus();
    }, state);
    for (const name of names) {
      await pressTab(page);
      const active = page.locator(":focus");
      await expect(active).toHaveCount(1);
      await expect(active).toHaveAccessibleName(name);
      await expectFocusRingVisible(active);
    }
    await page.evaluate(() => document.getElementById("start-marker")?.remove());
  };
  await press("start-button-default", ["Start focus", "Just 2 minutes"]);
  await press("start-button-compact-399", ["Start focus", "Just 2 minutes"]);
  await press("start-button-unavailable", ["Start focus", "Just 2 minutes"]);
  // Disabled buttons are skipped: the next stop is outside the frame.
  await page.evaluate(() => {
    const f = document.querySelector('[data-state="start-button-disabled"]') as HTMLElement;
    const marker = document.createElement("span");
    marker.tabIndex = -1;
    f.before(marker);
    marker.focus();
  });
  await pressTab(page);
  const inside = await page.evaluate(() =>
    Boolean(document.activeElement?.closest('[data-state="start-button-disabled"]')),
  );
  expect(inside).toBe(false);
});

test("start_button_aria_keyshortcuts", async ({ page }) => {
  await openSpecimen(page, "StartButton");
  const start = (s: string) => frame(page, s).getByRole("button", { name: "Start focus" });
  await expect(start("start-button-single-keys")).toHaveAttribute(
    "aria-keyshortcuts",
    "Space Meta+Enter",
  );
  await expect(start("start-button-single-keys-off")).toHaveAttribute(
    "aria-keyshortcuts",
    "Meta+Enter",
  );
  await expect(start("start-button-default")).not.toHaveAttribute("aria-keyshortcuts");
  await expect(
    frame(page, "start-button-single-keys").getByRole("button", { name: "Just 2 minutes" }),
  ).not.toHaveAttribute("aria-keyshortcuts");
});

test("start_button_aria_snapshot", async ({ page }) => {
  await openSpecimen(page, "StartButton");
  for (const s of [
    "start-button-default",
    "start-button-compact-399",
    "start-button-compact-400",
    "start-button-single-keys",
    "start-button-single-keys-off",
    "start-button-disabled",
  ]) {
    await expect(frame(page, s)).toMatchAriaSnapshot(`
      - button "Start focus"
      - button "Just 2 minutes"
    `);
  }
  await expect(frame(page, "start-button-loading")).toMatchAriaSnapshot(`
    - button "Starting…"
    - button "Just 2 minutes"
  `);
  await expect(frame(page, "start-button-unavailable")).toMatchAriaSnapshot(`
    - paragraph: Focus didn't start. Orasenda's timer isn't responding.
    - button "Start focus"
    - button "Just 2 minutes"
  `);
});

test("start_button_no_motion_when_reduced", async ({ page }, info) => {
  test.skip(info.project.name !== "light-reduced-motion", "reduced motion project only");
  await openSpecimen(page, "StartButton");
  expect(await animatedElements(page)).toEqual([]);
});
