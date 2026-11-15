import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";

const SIZES = [
  { width: 1440, height: 900 },
  { width: 900, height: 600 },
  { width: 640, height: 480 },
] as const;

async function openSheet(
  page: Page,
  size: { width: number; height: number },
  scenario = "boardWeek",
) {
  await openApp(page, scenario, size);
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
    // The sheet body is wider than container-sheet-stack except at 640: one column there.
    expect(m.columns).toBe(size.width === 640 ? 1 : 2);
    // An empty save line takes no room: the Title field sits one title-to-field gap under the heading.
    const gap = await dialog.evaluate((el) => {
      const h = el.querySelector("h2")?.getBoundingClientRect();
      const f = el.querySelector("label")?.getBoundingClientRect();
      return h && f ? f.top - h.bottom : Number.NaN;
    });
    expect(gap).toBeLessThanOrEqual(24.5);
    // The actions row is pinned: Done is on screen without scrolling.
    await expect(dialog.getByRole("button", { name: "Done" })).toBeInViewport({ ratio: 1 });
  });

  test(`board_detail_sheet_targets_and_focus_${at}`, async ({ page }) => {
    const dialog = await openSheet(page, size);
    // smallTargets measures a chip through its label and a tag's remove mark through its ::before.
    expect(await smallTargets(dialog)).toEqual([]);
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

async function expectFitsWithoutOuterScroll(page: Page, size: { width: number; height: number }) {
  const dialog = page.getByRole("dialog", { name: /^Write the intro/ });
  const m = await dialog.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const root = document.documentElement;
    return {
      right: r.right,
      bottom: r.bottom,
      sideways: root.scrollWidth - root.clientWidth,
      down: root.scrollHeight - root.clientHeight,
    };
  });
  expect(m.right).toBeLessThanOrEqual(size.width);
  expect(m.bottom).toBeLessThanOrEqual(size.height);
  expect(m.sideways).toBeLessThanOrEqual(0);
  expect(m.down).toBeLessThanOrEqual(0);
  await expect(dialog.getByRole("button", { name: "Done" })).toBeInViewport({ ratio: 1 });
}

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test(`board_detail_full_task_fits_and_is_reachable_${at}`, async ({ page }) => {
    const dialog = await openSheet(page, size, "boardFullTask");
    await expectFitsWithoutOuterScroll(page, size);
    expect(await smallTargets(dialog)).toEqual([]);
    await expectFocusRingVisible(dialog.getByRole("textbox", { name: "Title" }));
    // The far ends of the scrolling body keep their ring: the last tag's remove mark and the last item.
    const remove = dialog.getByRole("button", { name: /^Remove tag/ }).last();
    await remove.focus();
    await expect(() => expectFocusRingVisible(remove)).toPass();
    const last = dialog.getByRole("checkbox").last();
    await last.focus();
    await expect(() => expectFocusRingVisible(last)).toPass();
    await expectFitsWithoutOuterScroll(page, size);
  });

  test(`board_detail_full_task_notes_ring_${at}`, async ({ page }) => {
    const dialog = await openSheet(page, size, "boardFullTask");
    const notes = dialog.getByRole("textbox", { name: "Notes" });
    await notes.focus();
    await expect(() => expectFocusRingVisible(notes)).toPass();
  });

  // Tab scrolls the sheet body so the focused field keeps its whole ring in view (#612).
  test(`board_detail_full_task_tab_to_notes_ring_${at}`, async ({ page }) => {
    const dialog = await openSheet(page, size, "boardFullTask");
    await dialog.getByRole("checkbox").last().focus();
    const notes = dialog.getByRole("textbox", { name: "Notes" });
    for (let i = 0; i < 8; i++) {
      if (await notes.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(notes).toBeFocused();
    await expectFocusRingVisible(notes);
  });

  test(`board_detail_full_task_tab_walk_keeps_ring_${at}`, async ({ page }) => {
    const dialog = await openSheet(page, size, "boardFullTask");
    const body = dialog.locator('[data-slot="dialog-sheet-body"]');
    // Plain Tab (WebKit skips buttons) then Alt+Tab (reaches them), each way; every body stop keeps its ring.
    const walk = async (key: string) => {
      const stops = new Set<string>();
      for (let i = 0; i < 40; i++) {
        if ((await body.locator(":focus").count()) === 1) {
          await expectFocusRingVisible(page.locator(":focus"));
          stops.add(
            await page.locator(":focus").evaluate((el) => {
              const label = el.getAttribute("aria-label") ?? el.labels?.[0]?.textContent;
              return `${label ?? el.tagName}#${[...document.querySelectorAll(el.tagName)].indexOf(el)}`;
            }),
          );
        }
        await page.keyboard.press(key);
      }
      return stops;
    };
    for (const key of ["Tab", "Shift+Tab", "Alt+Tab", "Alt+Shift+Tab"]) {
      const stops = await walk(key);
      expect(stops.size, key).toBeGreaterThanOrEqual(4);
    }
  });

  test(`board_detail_save_failure_is_said_in_words_${at}`, async ({ page }) => {
    const dialog = await openSheet(page, size, "boardSaveFails");
    const priority = dialog.getByRole("combobox", { name: "Priority" });
    await priority.selectOption({ index: 1 });
    const line = dialog.getByText("That didn't save. Try again.");
    await expect(line).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Try again saving" })).toBeVisible();
    await expectFitsWithoutOuterScroll(page, size);
    expect(await smallTargets(dialog)).toEqual([]);
    // The line is present, and the Title field sits one gap (16px) under it.
    const gap = await dialog.evaluate((el) => {
      const text = [...el.querySelectorAll("*")].find((n) =>
        [...n.childNodes].some((c) => c.textContent === "That didn't save. Try again."),
      );
      let box = text ?? null;
      while (box && Number.parseFloat(getComputedStyle(box).marginBottom) === 0)
        box = box.parentElement;
      const input = [...el.querySelectorAll("input")].find(
        (i) => i.labels?.[0]?.textContent === "Title",
      );
      const field = input?.labels?.[0]?.getBoundingClientRect();
      return box && field ? field.top - box.getBoundingClientRect().bottom : Number.NaN;
    });
    expect(gap).toBeCloseTo(16, 0);
    const retry = dialog.getByRole("button", { name: "Try again saving" });
    await retry.focus();
    await expectFocusRingVisible(retry);
  });

  test(`board_detail_empty_title_error_is_said_in_words_${at}`, async ({ page }) => {
    const dialog = await openSheet(page, size, "boardFullTask");
    const title = dialog.getByRole("textbox", { name: "Title" });
    await title.fill("");
    await title.blur();
    await expect(
      dialog.getByText("A task needs a title. Still using Write the intro."),
    ).toBeVisible();
    await expect(dialog.getByText("The title wasn't saved.")).toBeVisible();
    await expectFitsWithoutOuterScroll(page, size);
    expect(await smallTargets(dialog)).toEqual([]);
    await title.focus();
    await expectFocusRingVisible(title);
  });
}
