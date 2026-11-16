import { expect, test } from "@playwright/test";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { openSpecimen } from "./support/specimen.ts";

const WINDOWS = [
  { w: 360, h: 240 },
  { w: 640, h: 480 },
] as const;

for (const { w, h } of WINDOWS) {
  test(`task_picker_fits_a_${w}x${h}_window`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openSpecimen(page, "TaskPicker");
    const frame = page.locator('[data-state="task-picker-bottom"]');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const rest = frame.getByRole("button", { name: "Add a task" });
    const box = await rest.boundingBox();
    expect(box?.height, "rest height").toBeGreaterThanOrEqual(44);
    await rest.focus();
    await expectFocusRingVisible(rest);
    await rest.press("Enter");
    const input = frame.getByRole("combobox");
    await expect(input).toBeFocused();
    await expect(frame.locator("[data-slot=task-picker-panel]")).toHaveCount(0);
    await input.press("ArrowDown");
    const panel = frame.locator("[data-slot=task-picker-panel]");
    await expect(panel).toBeVisible();
    const p = await panel.boundingBox();
    if (!p) throw new Error("no panel box");
    expect(p.x, "left").toBeGreaterThanOrEqual(0);
    expect(p.y, "top").toBeGreaterThanOrEqual(0);
    expect(p.x + p.width, "right").toBeLessThanOrEqual(w + 0.5);
    expect(p.y + p.height, "bottom").toBeLessThanOrEqual(h + 0.5);
    // Opened above the input when the room below is under two rows.
    const i = await input.boundingBox();
    expect(i && p.y + p.height <= i.y + 0.5, "above the input").toBe(true);
    await expect(frame.locator("[data-slot=task-picker-option]").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(rest).toBeFocused();
    await expectFocusRingVisible(rest);
  });
}

test("task_picker_add_row_is_hit_min_and_truncates", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 480 });
  await openSpecimen(page, "TaskPicker");
  const frame = page.locator('[data-state="task-picker-create-360"]');
  await frame.getByRole("button", { name: "Add a task" }).click();
  const input = frame.getByRole("combobox");
  const long =
    "a very long new task title that cannot fit on one line of this narrow panel ".repeat(2);
  await input.fill(long);
  const row = frame.locator("[data-slot=task-picker-create]");
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(row).toContainText("Selected");
  const box = await row.boundingBox();
  expect(box?.height, "add row height").toBeGreaterThanOrEqual(44);
  const text = row.locator(".truncate");
  const overflow = await text.evaluate((el) => ({
    clipped: el.scrollWidth > el.clientWidth,
    ellipsis: getComputedStyle(el).textOverflow,
  }));
  expect(overflow.clipped, "long query is clipped").toBe(true);
  expect(overflow.ellipsis).toBe("ellipsis");
  const p = await frame.locator("[data-slot=task-picker-panel]").boundingBox();
  if (!p || !box) throw new Error("no box");
  expect(box.x + box.width, "row inside panel").toBeLessThanOrEqual(p.x + p.width + 0.5);
  // Same inset (mx-1 = space-1 from the panel edge) and 2px active bar as a task row.
  const inset = await row.evaluate((el) => {
    const panel = el.closest("[data-slot=task-picker-panel]");
    return panel ? el.getBoundingClientRect().x - panel.getBoundingClientRect().x : -1;
  });
  expect(inset, "inset from panel edge").toBeGreaterThan(0);
  const bar = await row.evaluate((el) => getComputedStyle(el).borderInlineStartWidth);
  expect(bar).toBe("2px");
});
