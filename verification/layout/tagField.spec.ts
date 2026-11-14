import { expect, test } from "@playwright/test";
import { frames, openSpecimen } from "./support/specimen.ts";

test("tag_field_fits_and_remove_hit_areas_never_overlap", async ({ page }) => {
  await openSpecimen(page, "TagField");
  // The remove buttons' hit areas are pseudo-elements wider than their chip, so only the frame's own width is checked.
  const all = frames(page);
  for (let i = 0; i < (await all.count()); i++)
    expect(await all.nth(i).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(
      0,
    );
  const wrapping = page.locator('[data-frame][data-state="tag-field-wrapping"]');
  const rects = await wrapping.locator("[data-slot=tag] button").evaluateAll((els) =>
    els.map((el) => {
      const hit = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--hit-min"),
      );
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      return { l: cx - hit / 2, r: cx + hit / 2, t: cy - hit / 2, b: cy + hit / 2 };
    }),
  );
  expect(rects.length).toBeGreaterThan(2);
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (!a || !b) continue;
      const overlap = a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      expect(overlap, `hit areas ${i} and ${j}`).toBe(false);
    }
});
