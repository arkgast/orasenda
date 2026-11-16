import { expect, type Page, test } from "@playwright/test";
import { openApp } from "./support/app.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";

// Compact (stacked), the default window and a spacious one.
const SIZES = [
  { width: 480, height: 480 },
  { width: 640, height: 480 },
  { width: 900, height: 600 },
  { width: 1440, height: 900 },
] as const;

async function openBoard(page: Page, scenario: string, size: { width: number; height: number }) {
  await openApp(page, scenario, size);
  await page.keyboard.press("Meta+3");
  await expect(page.getByRole("heading", { name: "Board", level: 1 })).toBeAttached();
}

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  for (const scenario of ["boardWeek", "boardOver", "boardLong"]) {
    test(`board_${scenario}_never_scrolls_sideways_${at}`, async ({ page }) => {
      await openBoard(page, scenario, size);
      await expect(
        page.getByRole("button", { name: /^Write the intro|^A task title/ }),
      ).toBeVisible();
      const widths = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        main: (document.querySelector("main") as HTMLElement).scrollWidth,
        mainBox: (document.querySelector("main") as HTMLElement).clientWidth,
      }));
      expect(widths.page).toBeLessThanOrEqual(size.width);
      expect(widths.main).toBeLessThanOrEqual(widths.mainBox);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        size.height,
      );
    });
  }

  test(`board_targets_are_hit_min_${at}`, async ({ page }) => {
    await openBoard(page, "boardWeek", size);
    expect(await smallTargets(page.getByRole("main"))).toEqual([]);
  });

  test(`board_focus_ring_is_visible_${at}`, async ({ page }) => {
    await openBoard(page, "boardWeek", size);
    await page.keyboard.press("Tab");
    const card = page.getByRole("button", { name: /^Write the intro/ });
    await card.focus();
    // Below layout-tight-height the card folds dots, due date and tags into one line (#589).
    await expectFocusRingVisible(card);
    await page.keyboard.press("Meta+n");
    // Focusing the field scrolls the stacked region back up; the ring is judged once it settles.
    const field = page.getByRole("textbox", { name: "New task" });
    await expect(field).toBeFocused();
    await expect(async () => expectFocusRingVisible(field)).toPass();
  });

  if (at === "640x480") {
    test("full_card_ring_fits_640x480", async ({ page }) => {
      await openBoard(page, "boardWeek", size);
      const card = page.getByRole("button", { name: /^Write the intro/ });
      await card.focus();
      await expectFocusRingVisible(card);
      expect(await card.locator("[data-slot=task-card-fold]").count()).toBe(1);
    });
  }

  test(`board_empty_and_unreadable_fit_${at}`, async ({ page }) => {
    await openBoard(page, "boardEmpty", size);
    await expect(page.getByText("No tasks yet.")).toBeVisible();
    await openBoard(page, "boardUnreadable", size);
    await expect(page.getByText("The board couldn't be loaded. Try again.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      size.width,
    );
  });
}

test("board_default_window_opens_three_columns_and_folds_done", async ({ page }) => {
  await openBoard(page, "boardWeek", { width: 900, height: 600 });
  for (const name of ["Backlog", "Today", "Doing"]) {
    await expect(page.getByRole("region", { name })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Done, 2 tasks" })).toBeVisible();
  const widths = await page.evaluate(() =>
    ["backlog", "today", "doing"].map(
      (lane) => document.getElementById(`board-col-${lane}`)?.getBoundingClientRect().width ?? 0,
    ),
  );
  const [backlog, today, doing] = widths as [number, number, number];
  // Today and Doing are the wide centre; Backlog stays a readable list.
  expect(today).toBeGreaterThan(backlog);
  expect(doing).toBeGreaterThan(backlog);
  expect(backlog).toBeGreaterThanOrEqual(200);
});

test("board_add_task_works_at_the_smallest_regular_window_with_a_running_task", async ({
  page,
}) => {
  await openBoard(page, "boardWeek", { width: 640, height: 480 });
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("textbox", { name: "New task" })).toBeFocused();
});

test("board_columns_keep_a_space_2_gap_and_the_done_strip_its_ring", async ({ page }) => {
  await openBoard(page, "boardWeek", { width: 900, height: 600 });
  const boxes = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[id^=board-col-]"))
      .map((el) => el.getBoundingClientRect())
      .map((r) => ({ left: r.left, right: r.right }))
      .sort((a, b) => a.left - b.left),
  );
  const gap = await page.evaluate(
    () =>
      Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-2")) *
      (getComputedStyle(document.documentElement).getPropertyValue("--space-2").endsWith("rem")
        ? Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
        : 1),
  );
  if (process.env.DEBUG_GAPS) console.log(JSON.stringify({ boxes, gap }));
  for (let i = 1; i < boxes.length; i++) {
    expect(
      (boxes[i] as { left: number }).left - (boxes[i - 1] as { right: number }).right,
    ).toBeGreaterThanOrEqual(gap - 0.5);
  }
  const done = page.getByRole("button", { name: "Done, 2 tasks" });
  await done.focus();
  await expectFocusRingVisible(done);
});

test("board_scrolled_card_keeps_its_ring_900x600", async ({ page }) => {
  await openBoard(page, "boardWeek", { width: 900, height: 600 });
  const first = page
    .getByRole("region", { name: "Backlog" })
    .getByRole("button", { name: /^(?!More)/ })
    .first();
  await first.focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowDown");
  await expectFocusRingVisible(page.locator(":focus"));
});

test("board_long_title_fits_640x480", async ({ page }) => {
  await openBoard(page, "boardLongTitle", { width: 640, height: 480 });
  const card = page.getByRole("button", { name: /^Plan the whole/ });
  await card.focus();
  const problem = await card.evaluate((node) => {
    let port: HTMLElement | null = node.parentElement;
    while (port && !/(auto|scroll)/.test(getComputedStyle(port).overflowY))
      port = port.parentElement;
    if (!port) return "no scrollport";
    const c = node.getBoundingClientRect();
    const p = port.getBoundingClientRect();
    return c.top >= p.top && c.bottom <= p.bottom
      ? ""
      : `card ${c.top}-${c.bottom} outside ${p.top}-${p.bottom}`;
  });
  expect(problem).toBe("");
  await expectFocusRingVisible(card);
});

test("board_tab_from_card_leaves_the_columns", async ({ page }) => {
  await openBoard(page, "boardWeek", { width: 900, height: 600 });
  await page.getByRole("button", { name: /^Write the intro/ }).focus();
  await page.keyboard.press("Tab");
  const inCards = await page.evaluate(
    () => document.activeElement?.closest("[data-task-id]") != null,
  );
  expect(inCards).toBe(false);
});

for (const size of [
  { width: 1440, height: 900 },
  { width: 900, height: 600 },
  { width: 640, height: 480 },
]) {
  test(`board_shift_f10_opens_the_card_menu_and_esc_returns_to_the_card_${size.width}`, async ({
    page,
  }) => {
    await openBoard(page, "boardWeek", size);
    const card = page.getByRole("button", { name: /^Write the intro/ });
    await card.focus();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(card).toBeFocused();
  });
}

// Pointer drag: the dashed slot in a regular and a compact board, and a real mouse drop.
for (const size of [
  { width: 900, height: 600 },
  { width: 480, height: 480 },
]) {
  test(`board_drag_slot_is_hit_min_tall_and_fits_${size.width}`, async ({ page }) => {
    await openBoard(page, "boardDrag", size);
    const from = await page.getByRole("button", { name: /^Backlog task 1/ }).boundingBox();
    const over = await page.getByRole("button", { name: /^Backlog task 3/ }).boundingBox();
    if (!from || !over) throw new Error("cards are not on the page");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 20, { steps: 4 });
    await page.mouse.move(over.x + over.width / 2, over.y + over.height * 0.8, { steps: 6 });
    await expect(page.getByText("Moving Backlog task 1. Esc puts it back.")).toBeVisible();
    const slot = page.locator('[data-slot="kanban-column-drop"]');
    await expect(slot).toBeVisible();
    const hit = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.height = "var(--hit-min)";
      document.body.append(probe);
      const height = probe.getBoundingClientRect().height;
      probe.remove();
      return height;
    });
    // The slot opens over duration-calm; its height is judged once it has settled.
    await expect
      .poll(async () => (await slot.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(hit - 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      size.width,
    );
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(slot).toHaveCount(0);
    await expect(page.getByText("Backlog task 1 stayed in Backlog.")).toBeVisible();
  });
}

test("board_drag_moves_card_between_columns", async ({ page }) => {
  await openBoard(page, "boardDrag", { width: 900, height: 600 });
  const card = await page.getByRole("button", { name: /^Write the intro/ }).boundingBox();
  const doing = await page.getByRole("button", { name: /^Fix the sync bug/ }).boundingBox();
  if (!card || !doing) throw new Error("cards are not on the page");
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await page.mouse.move(card.x + card.width / 2 + 20, card.y + card.height / 2 + 20, { steps: 4 });
  await page.mouse.move(doing.x + doing.width / 2, doing.y + doing.height + 30, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText("Moved Write the intro to Doing.")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Doing" }).getByRole("button", { name: /^Write the intro/ }),
  ).toBeVisible();
});
