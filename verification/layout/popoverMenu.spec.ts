import { expect, type Page, test } from "@playwright/test";
import { expectVisibleFits } from "./support/fitsVisible.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { animatedElements } from "./support/motion.ts";
import { shoot } from "./support/shots.ts";
import { frames, openSpecimen, pressTab } from "./support/specimen.ts";

const PANEL = '[data-slot="popover-menu"]';

const FORMS = [
  {
    shot: "popover-menu-today",
    trigger: "Classic · ends 15:20, Change preset",
    menu: "Preset",
    expectSep: true,
  },
  {
    shot: "popover-menu-read-only",
    trigger: "Preset while a session runs",
    menu: "Classic · 25 / 5",
    expectSep: true,
  },
  {
    shot: "popover-menu-focus-window",
    trigger: "Preset for the next session",
    menu: "Preset for the next session",
    expectSep: false,
  },
  {
    shot: "popover-menu-checkbox",
    trigger: "Checkbox rows",
    menu: "Checkbox rows",
    expectSep: false,
  },
] as const;

/** Opens a menu and waits until focus has moved into it, so the next key reaches the menu. */
async function openMenu(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.locator(`${PANEL} [role^="menuitem"]:focus`)).toHaveCount(1);
}

const token = (page: Page, name: string): Promise<number> =>
  page.evaluate(
    (n) => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)),
    name,
  );

test("popover_menu_fits_at_360", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openSpecimen(page, "PopoverMenu");
  for (const frame of await frames(page).all()) await expectVisibleFits(frame);
  const space2 = await token(page, "--space-2");
  for (const form of FORMS) {
    await openMenu(page, form.trigger);
    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible();
    await expectVisibleFits(panel);
    const r = await panel.evaluate((p) => {
      const b = p.getBoundingClientRect();
      return {
        left: b.left,
        right: b.right,
        top: b.top,
        bottom: b.bottom,
        vw: document.documentElement.clientWidth,
        vh: document.documentElement.clientHeight,
        wide: p.scrollWidth > p.clientWidth,
      };
    });
    expect(r.left).toBeGreaterThanOrEqual(space2 - 1);
    expect(r.right).toBeLessThanOrEqual(r.vw - space2 + 1);
    expect(r.top).toBeGreaterThanOrEqual(space2 - 1);
    expect(r.bottom).toBeLessThanOrEqual(r.vh - space2 + 1);
    expect(r.wide).toBe(false);
    const sep = await panel.evaluate((p) => {
      const hr = p.querySelector("[role=separator]");
      return {
        has: !!hr,
        hr: hr ? hr.getBoundingClientRect().width : 0,
        list: p.clientWidth,
      };
    });
    // A form with a link row must keep its separator: a missing hr fails here, it is not skipped.
    expect(sep.has, `${form.shot} separator`).toBe(form.expectSep);
    if (form.expectSep) {
      expect(sep.hr).toBeGreaterThan(0);
      expect(Math.abs(sep.hr - sep.list)).toBeLessThanOrEqual(1);
    }
    await shoot(page, info, form.shot);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  }
});

test("popover_menu_rows_meet_hit_min", async ({ page }) => {
  await openSpecimen(page, "PopoverMenu");
  const hitMin = await token(page, "--hit-min");
  expect(hitMin).toBeGreaterThan(0);
  for (const form of FORMS) {
    await openMenu(page, form.trigger);
    const sizes = await page.locator(`${PANEL} [role^="menuitem"]`).evaluateAll((rows) =>
      rows.map((r) => {
        const b = r.getBoundingClientRect();
        return { w: b.width, h: b.height };
      }),
    );
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) {
      expect(s.w).toBeGreaterThanOrEqual(hitMin);
      expect(s.h).toBeGreaterThanOrEqual(hitMin);
    }
    await page.keyboard.press("Escape");
  }
});

test("popover_menu_keyboard_path", async ({ page }) => {
  await openSpecimen(page, "PopoverMenu");
  await page.mouse.click(2, 2);
  const trigger = page.getByRole("button", { name: "Classic · ends 15:20, Change preset" });
  await pressTab(page);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  const panel = page.locator(PANEL);
  await expect(panel).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const checked = page.locator('[role=menuitemradio][aria-checked="true"]');
  await expect(checked).toBeFocused();
  await expectFocusRingVisible(checked);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitemradio", { name: /Deep Block/ })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Timer settings…" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(checked).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Deep Block · ends 15:20, Change preset" }),
  ).toBeFocused();
  await expect(page.getByRole("button", { name: /Change preset/ })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByText("Deep Block chosen.")).toBeVisible();
  const quickMs = await token(page, "--duration-quick");
  expect(quickMs).toBeGreaterThan(0);
  await page.waitForTimeout(quickMs + 250);
  await expect(page.locator("[data-slot=tooltip]")).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Change preset/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  await pressTab(page);
  await expect(panel).toHaveCount(0);
  const next = page.getByRole("button", { name: "Preset while a session runs" });
  await expect(next).toBeFocused();
});

test("popover_menu_shift_tab_closes_and_focuses_trigger", async ({ page }) => {
  await openSpecimen(page, "PopoverMenu");
  const trigger = page.getByRole("button", { name: "Classic · ends 15:20, Change preset" });
  await openMenu(page, "Classic · ends 15:20, Change preset");
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(PANEL)).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("popover_menu_one_esc_closes_menu_while_a_tooltip_shows_elsewhere", async ({ page }) => {
  await openSpecimen(page, "PopoverMenu");
  await page.mouse.click(2, 2);
  const other = page.getByRole("button", { name: "Checkbox rows", exact: true });
  await other.hover();
  await expect(page.locator("[data-slot=tooltip]")).toHaveCount(1);
  const name = "Preset for the next session";
  const trigger = page.getByRole("button", { name, exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(`${PANEL} [role^="menuitem"]:focus`)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(PANEL)).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("popover_menu_placed_against_trigger_inside_open_dialog", async ({ page }, info) => {
  await openSpecimen(page, "PopoverMenu");
  await page.getByRole("button", { name: "Open a dialog" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const trigger = dialog.getByRole("button", { name: "Preset in the dialog" });
  await trigger.click();
  const panel = dialog.locator(PANEL);
  await expect(panel).toBeVisible();
  const space1 = await token(page, "--space-1");
  const r = await page.evaluate(() => {
    const p = document.querySelector('[data-slot="popover-menu"]') as HTMLElement;
    const t = document.querySelector(
      '[data-slot="dialog-content"] button[aria-haspopup="menu"]',
    ) as HTMLElement;
    const b = p.getBoundingClientRect();
    const tb = t.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + Math.min(b.height / 2, 40));
    return {
      inDialog: !!p.closest('[data-slot="dialog-content"]'),
      inside: !!hit && p.contains(hit),
      side: p.getAttribute("data-side") === "top" ? "above" : "below",
      b: { l: b.left, t: b.top, r: b.right, bt: b.bottom },
      tb: { l: tb.left, t: tb.top, r: tb.right, bt: tb.bottom },
    };
  });
  expect(r.inDialog).toBe(true);
  expect(r.inside).toBe(true);
  if (r.side === "below") {
    expect(Math.abs(r.b.t - (r.tb.bt + space1))).toBeLessThanOrEqual(1);
  } else {
    expect(r.side).toBe("above");
    expect(Math.abs(r.b.bt - (r.tb.t - space1))).toBeLessThanOrEqual(1);
  }
  const overlap = r.b.l < r.tb.r && r.b.r > r.tb.l && r.b.t < r.tb.bt && r.b.bt > r.tb.t;
  expect(overlap).toBe(false);
  await shoot(page, info, "popover-menu-dialog");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("popover_menu_flips_inside_viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 480 });
  await openSpecimen(page, "PopoverMenu");
  const space2 = await token(page, "--space-2");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const trigger = page.getByRole("button", { name: "Preset at the bottom" });
  await trigger.click();
  const panel = page.locator(PANEL);
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-side", "top");
  const r = await page.evaluate(() => {
    const b = (
      document.querySelector('[data-slot="popover-menu"]') as HTMLElement
    ).getBoundingClientRect();
    const t = (
      document.querySelector('[aria-haspopup="menu"][aria-expanded="true"]') as HTMLElement
    ).getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, ttop: t.top, vh: document.documentElement.clientHeight };
  });
  expect(r.bottom).toBeLessThanOrEqual(r.ttop);
  expect(r.top).toBeGreaterThanOrEqual(space2 - 1);
  expect(r.bottom).toBeLessThanOrEqual(r.vh - space2 + 1);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Preset at the end" }).scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Preset at the end" }).click();
  await expect(panel).toBeVisible();
  const edge = await panel.evaluate((p) => ({
    right: p.getBoundingClientRect().right,
    left: p.getBoundingClientRect().left,
    vw: document.documentElement.clientWidth,
  }));
  expect(edge.right).toBeLessThanOrEqual(edge.vw - space2 + 1);
  expect(edge.left).toBeGreaterThanOrEqual(space2 - 1);
});

test("popover_menu_aria_snapshot", async ({ page }) => {
  await openSpecimen(page, "PopoverMenu");
  await openMenu(page, "Classic · ends 15:20, Change preset");
  await expect(page.locator(PANEL)).toMatchAriaSnapshot(`
    - menu "Preset":
      - menuitemradio "Classic 25 / 5" [checked]
      - menuitemradio "Deep Block 90 / 15"
      - menuitemradio "Short 15 / 3"
      - menuitemradio "Custom 50 / 10"
      - separator
      - menuitem "Timer settings…"
  `);
  await page.keyboard.press("Escape");

  await openMenu(page, "Preset while a session runs");
  await expect(page.locator(PANEL)).toMatchAriaSnapshot(`
    - menu "Classic · 25 / 5":
      - menuitemradio "Classic 25 / 5" [checked] [disabled]
      - menuitemradio "Deep Block 90 / 15" [disabled]
      - menuitemradio "Short 15 / 3" [disabled]
      - menuitemradio "Custom 50 / 10" [disabled]
      - separator
      - menuitem "Timer settings…"
  `);
  await expect(page.getByRole("menu")).toHaveAccessibleDescription(
    "Presets can change between sessions.",
  );
  await page.keyboard.press("Escape");

  await openMenu(page, "Checkbox rows");
  await expect(page.locator(PANEL)).toMatchAriaSnapshot(`
    - menu "Checkbox rows":
      - menuitemcheckbox "First option" [checked]
      - menuitemcheckbox "Second option"
      - menuitemcheckbox "Unavailable option" [disabled]
  `);
  await page.keyboard.press("Escape");
  await expect(page.locator(PANEL)).toHaveCount(0);
});

test("popover_menu_no_motion_when_reduced", async ({ page }, info) => {
  test.skip(info.project.name !== "light-reduced-motion", "reduced motion project only");
  await openSpecimen(page, "PopoverMenu");
  for (const form of FORMS) {
    await openMenu(page, form.trigger);
    await expect(page.locator(PANEL)).toBeVisible();
    expect(await animatedElements(page)).toEqual([]);
    await page.locator(`${PANEL} [role^="menuitem"]`).nth(1).hover();
    expect(await animatedElements(page)).toEqual([]);
    await page.keyboard.press("Escape");
  }
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`popover_menu_fits_and_places_at_${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openSpecimen(page, "PopoverMenu");
    const space2 = await token(page, "--space-2");
    const popoverWidth = await token(page, "--popover-width");
    for (const form of FORMS) {
      await openMenu(page, form.trigger);
      const panel = page.locator(PANEL);
      await expectVisibleFits(panel);
      const r = await panel.evaluate((p) => {
        const b = p.getBoundingClientRect();
        return {
          left: b.left,
          right: b.right,
          top: b.top,
          bottom: b.bottom,
          width: b.width,
          vw: document.documentElement.clientWidth,
          vh: document.documentElement.clientHeight,
        };
      });
      expect(r.left).toBeGreaterThanOrEqual(space2 - 1);
      expect(r.right).toBeLessThanOrEqual(r.vw - space2 + 1);
      expect(r.top).toBeGreaterThanOrEqual(space2 - 1);
      expect(r.bottom).toBeLessThanOrEqual(r.vh - space2 + 1);
      expect(Math.abs(r.width - popoverWidth)).toBeLessThanOrEqual(1);
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
    }
  });
}

test("popover_menu_stays_inside_a_short_window", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 240 });
  await openSpecimen(page, "PopoverMenu");
  const space2 = await token(page, "--space-2");
  let anyScrolls = false;
  for (const form of FORMS) {
    await openMenu(page, form.trigger);
    const panel = page.locator(PANEL);
    const r = await panel.evaluate((p) => {
      const b = p.getBoundingClientRect();
      return {
        top: b.top,
        bottom: b.bottom,
        vh: document.documentElement.clientHeight,
        scrolls: p.scrollHeight > p.clientHeight,
      };
    });
    expect(r.top).toBeGreaterThanOrEqual(space2 - 1);
    expect(r.bottom).toBeLessThanOrEqual(r.vh - space2 + 1);
    if (r.scrolls) {
      anyScrolls = true;
      await page.keyboard.press("End");
      const last = panel.locator('[role^="menuitem"]').last();
      await expect(last).toBeFocused();
      const lb = await last.evaluate((e) => {
        const b = e.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, vh: document.documentElement.clientHeight };
      });
      expect(lb.top).toBeGreaterThanOrEqual(0);
      expect(lb.bottom).toBeLessThanOrEqual(lb.vh);
    }
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  }
  expect(anyScrolls).toBe(true);
});
