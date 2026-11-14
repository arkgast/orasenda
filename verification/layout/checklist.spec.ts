import { expect, test } from "@playwright/test";
import { expectVisibleFits } from "./support/fitsVisible.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { frames, openSpecimen, pressTab } from "./support/specimen.ts";

test("checklist_rows_meet_hit_min_fit_and_sit_apart", async ({ page }) => {
  await openSpecimen(page, "Checklist");
  const all = frames(page);
  // A long item text scrolls inside its own field by design, so that frame is left out.
  for (let i = 0; i < (await all.count()); i++) {
    const frame = all.nth(i);
    if ((await frame.getAttribute("data-state")) === "checklist-long-text") continue;
    await expectVisibleFits(frame);
  }
  const items = page.locator('[data-frame][data-state="checklist-items"]');
  const hit = await items
    .locator("[data-slot=checklist-item] label")
    .evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44),
    );
  expect(hit).toEqual([]);
  const gaps = await items.locator("[data-slot=checklist-item]").evaluateAll((rows) =>
    rows.slice(1).map((row, i) => {
      const prev = (rows[i] as HTMLElement).getBoundingClientRect();
      return row.getBoundingClientRect().top - prev.bottom;
    }),
  );
  for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(8);
});

test("checklist_keyboard_focus_rings_show", async ({ page }) => {
  await openSpecimen(page, "Checklist");
  const items = page.locator('[data-frame][data-state="checklist-items"]');
  for (let i = 0; i < 3; i++) {
    await pressTab(page);
    await expectFocusRingVisible(page.locator(":focus"));
  }
});
