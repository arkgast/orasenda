import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";

const SIZES = [
  { width: 1440, height: 900 },
  { width: 900, height: 600 },
  { width: 640, height: 480 },
] as const;

async function openSheet(page: Page, size: { width: number; height: number }) {
  await openApp(page, "boardWeek", size);
  await page.keyboard.press("Meta+3");
  const card = page.getByRole("button", { name: /^Write the intro/ });
  await card.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: /^Write the intro/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test(`board_detail_sheet_fits_and_stacks_${at}`, async ({ page }) => {
    const dialog = await openSheet(page, size);
    await expect(dialog.getByRole("textbox", { name: "Title" })).toBeFocused();
    const m = await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const lefts = [...el.querySelectorAll("select")].map((f) =>
        Math.round(f.getBoundingClientRect().left),
      );
      return {
        width: r.width,
        right: r.right,
        bottom: r.bottom,
        columns: new Set(lefts).size,
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(m.right).toBeLessThanOrEqual(size.width);
    expect(m.bottom).toBeLessThanOrEqual(size.height);
    expect(m.sideways).toBeLessThanOrEqual(0);
    // The sheet body is wider than container-sheet-stack at all three sizes.
    expect(m.columns).toBe(2);
  });

  test(`board_detail_sheet_targets_and_focus_${at}`, async ({ page }) => {
    const dialog = await openSheet(page, size);
    // A chip's box (14px) sits inside a full-height label, and a tag's remove mark grows its hit area
    // with a pseudo-element; their own specs judge those two. Everything else is hit-min.
    const small = (await smallTargets(dialog)).filter(
      (line) => !line.startsWith('input ""') && !line.includes("Remove tag"),
    );
    expect(small).toEqual([]);
    await expectFocusRingVisible(dialog.getByRole("textbox", { name: "Title" }));
    // WebKit gives a date field :focus but never :focus-visible: its ring must still show.
    const due = dialog.getByLabel("Due");
    await due.focus();
    await expectFocusRingVisible(due);
  });

  test(`board_detail_breakdown_notice_is_visible_${at}`, async ({ page }) => {
    const dialog = await openSheet(page, size);
    const estimate = dialog.getByRole("spinbutton", { name: "Estimate" });
    await estimate.focus();
    for (const _ of [1, 2, 3]) await page.keyboard.press("ArrowUp");
    const notice = dialog.getByText("This looks big. Could it be a few smaller tasks?");
    await expect(notice).toBeVisible();
    const m = await notice.evaluate((el) => {
      const panel = el.closest("[data-slot=dialog-content]") as HTMLElement;
      const due = document.querySelector("input[type=date]") as HTMLElement;
      const n = el.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      // It sits above the Due field, so it lands next to the Estimate that raised it.
      return {
        gap: due.getBoundingClientRect().top - n.bottom,
        top: n.top,
        bottom: n.bottom,
        panelTop: p.top,
        panelBottom: p.bottom,
      };
    });
    expect(m.gap).toBeGreaterThan(0);
    expect(m.top).toBeGreaterThanOrEqual(m.panelTop);
    expect(m.bottom).toBeLessThanOrEqual(m.panelBottom);
  });

  test(`board_detail_scrolled_focus_ring_is_not_clipped_${at}`, async ({ page }) => {
    const dialog = await openSheet(page, size);
    // From the top of the scroll to the last field, then back: the ring clears the panel edge.
    const notes = dialog.getByRole("textbox", { name: "Notes" });
    await notes.focus();
    await expect(() => expectFocusRingVisible(notes)).toPass();
    const priority = dialog.getByRole("combobox", { name: "Priority" });
    await priority.focus();
    await expect(() => expectFocusRingVisible(priority)).toPass();
  });

  test(`board_detail_escape_returns_focus_to_the_card_${at}`, async ({ page }) => {
    await openSheet(page, size);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Write the intro/ })).toBeFocused();
  });
}
