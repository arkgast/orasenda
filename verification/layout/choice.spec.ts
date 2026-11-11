import { expect, type Page, test } from "@playwright/test";
import { expectVisibleFits } from "./support/fitsVisible.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { shoot } from "./support/shots.ts";
import { frames, openSpecimen, pressTab } from "./support/specimen.ts";

const frame = (page: Page, state: string) => page.locator(`[data-frame][data-state="${state}"]`);

test("choice_labels_meet_hit_min_and_fit", async ({ page }, info) => {
  await openSpecimen(page, "Choice");
  const hitMin = await page.evaluate(() =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--hit-min").trim(),
    ),
  );
  const labels = page.locator("[data-frame] label[data-slot=choice]");
  expect(await labels.count()).toBeGreaterThan(0);
  const small = await labels.evaluateAll(
    (els, min) =>
      els
        .map((el) => ({ text: el.textContent, h: el.getBoundingClientRect().height }))
        .filter((l) => l.h < (min as number)),
    hitMin,
  );
  expect(small).toEqual([]);
  const all = frames(page);
  for (let i = 0; i < (await all.count()); i++) await expectVisibleFits(all.nth(i));
  await shoot(page, info, "choice");
});

test("choice_radio_and_checkbox_keep_their_shape", async ({ page }) => {
  await openSpecimen(page, "Choice");
  const radius = (state: string) =>
    frame(page, state)
      .locator("input")
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          w: el.getBoundingClientRect().width,
          r: Number.parseFloat(cs.borderTopLeftRadius),
        };
      });
  const dot = await radius("choice-radio");
  const square = await radius("choice-checkbox");
  expect(dot.w).toBe(square.w);
  expect(dot.r).toBeGreaterThan(square.r);
});

test("choice_checked_chip_takes_the_selection_ground", async ({ page }) => {
  await openSpecimen(page, "Choice");
  const ground = (text: string) =>
    page
      .locator("[data-frame] label[data-slot=choice]", { hasText: text })
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await ground("Classic 25/5")).not.toBe(await ground("50/10"));
});

test("choice_keyboard_focus_rings_and_arrows_move", async ({ page }) => {
  await openSpecimen(page, "Choice");
  for (const state of ["choice-radio", "choice-checkbox", "choice-long"]) {
    await page.evaluate((s) => {
      const f = document.querySelector(`[data-state="${s}"]`) as HTMLElement;
      const marker = document.createElement("span");
      marker.tabIndex = -1;
      f.before(marker);
      marker.focus();
    }, state);
    await pressTab(page);
    const active = page.locator(":focus");
    await expect(active).toHaveCount(1);
    await expectFocusRingVisible(active);
  }
  await page.evaluate(() => {
    const f = document.querySelector('[data-state="choice-segmented"]') as HTMLElement;
    const marker = document.createElement("span");
    marker.tabIndex = -1;
    f.before(marker);
    marker.focus();
  });
  await pressTab(page);
  const segment = frame(page, "choice-segmented").locator("label", { hasText: "Today" });
  await expectFocusRingVisible(segment);
  await page.keyboard.press("ArrowRight");
  await expect(
    frame(page, "choice-segmented").getByRole("radio", { name: "This week" }),
  ).toBeChecked();
});
