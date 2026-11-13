import { expect, type Page, test } from "@playwright/test";
import { APP_URL } from "./support/app.ts";
import { overflows } from "./support/fits.ts";
import { expectFocusRingVisible } from "./support/focusRing.ts";
import { smallTargets } from "./support/hitTargets.ts";
import { animatedElements } from "./support/motion.ts";
import { pressTab } from "./support/specimen.ts";

// The capture panel's page (`layout.html?surface=capture`) at the panel's window size: `panel-width`
// (420) wide and CAPTURE_HEIGHT high (windows/capture.rs HEIGHT). The page cannot ask Rust to resize,
// so every state of the pad has to fit that window. Light and dark come from the projects.
const SIZE = { width: 420, height: 520 } as const;

const LONG =
  "Remember to email the landlord about the lease, ask whether the deposit can be returned in two parts, and check the notice period in the contract before the end of the month.";

async function openCapture(page: Page, scenario = "idle"): Promise<void> {
  await page.setViewportSize(SIZE);
  await page.goto(
    `${APP_URL}/layout.html?${new URLSearchParams({ scenario, surface: "capture" })}`,
  );
  await page.getByRole("dialog", { name: "Capture a thought" }).waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

const field = (page: Page) => page.getByRole("textbox", { name: "Thought" });

async function expectFits(page: Page): Promise<void> {
  const scroll = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
  }));
  expect(scroll.w, "no horizontal scroll").toBeLessThanOrEqual(SIZE.width);
  expect(scroll.h, "no vertical scroll").toBeLessThanOrEqual(SIZE.height);
  const dialog = page.getByRole("dialog", { name: "Capture a thought" });
  const box = await dialog.boundingBox();
  expect(box, "the pad is laid out").not.toBeNull();
  if (!box) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(SIZE.width + 0.5);
  expect(box.y + box.height, "the whole pad is inside the window").toBeLessThanOrEqual(
    SIZE.height + 0.5,
  );
  // The pad itself does not scroll: nothing is cut off inside it.
  // A text area scrolls its own text; that is its job, not a cut-off.
  const cutOff = (await overflows(dialog)).filter((line) => !line.includes(" textarea"));
  expect(cutOff, "nothing overflows").toEqual([]);
  // The kind choices are native radios inside 44px labels; the label is the target, so measure it.
  const small = (await smallTargets(page.locator("body"))).filter(
    (line) => !line.startsWith('input ""') && !line.startsWith('span ""'),
  );
  expect(small, "targets are 44px").toEqual([]);
  for (const label of await dialog.locator('label[data-slot="choice"]').all()) {
    expect((await label.boundingBox())?.height ?? 0, "kind labels are 44px").toBeGreaterThanOrEqual(
      44,
    );
  }
}

const STATES = [
  {
    name: "empty",
    scenario: "idle",
    prepare: async () => {},
  },
  {
    name: "typed",
    scenario: "idle",
    prepare: async (page: Page) => {
      await field(page).fill("Call the dentist");
    },
  },
  {
    name: "long",
    scenario: "idle",
    prepare: async (page: Page) => {
      await field(page).fill(`${LONG} ${LONG}`);
      await page.getByRole("radio", { name: "External" }).check();
    },
  },
  {
    name: "saving",
    scenario: "captureSaving",
    prepare: async (page: Page) => {
      await field(page).fill("Call the dentist");
      await page.getByRole("button", { name: "Save to Inbox" }).click();
      await page.getByRole("button", { name: /Saving/ }).waitFor();
    },
  },
  {
    name: "failed",
    scenario: "captureError",
    prepare: async (page: Page) => {
      await field(page).fill(`${LONG} ${LONG}`);
      await page.getByRole("radio", { name: "External" }).check();
      await page.getByRole("button", { name: "Save to Inbox" }).click();
      await page.getByText("Your note is still here. Try saving again.").waitFor();
    },
  },
] as const;

for (const state of STATES) {
  test(`capture_window_fits_${SIZE.width}x${SIZE.height}_${state.name}`, async ({ page }) => {
    await openCapture(page, state.scenario);
    await state.prepare(page);
    await expectFits(page);
  });
}

test("capture_window_text_is_focused_and_the_focus_ring_shows", async ({ page }) => {
  await openCapture(page);
  await expect(field(page)).toBeFocused();
  await expectFocusRingVisible(field(page));
  // Tab walks the pad: the two kinds, then Save (disabled while empty, so the stop after the
  // kinds leaves the pad for the browser chrome only when nothing else is focusable).
  await field(page).fill("A thought");
  for (const name of ["Internal", "Save to Inbox"]) {
    await pressTab(page);
    await expect(
      page.getByRole("radio", { name }).or(page.getByRole("button", { name })),
    ).toBeFocused();
  }
  await expectFocusRingVisible(page.getByRole("button", { name: "Save to Inbox" }));
});

test("capture_window_kind_starts_internal", async ({ page }) => {
  await openCapture(page);
  await expect(page.getByRole("radio", { name: "Internal" })).toBeChecked();
  await expect(page.getByText("This came from your own mind.")).toBeVisible();
});

// The reduced-motion project only: nothing on the panel animates or transitions.
test("capture_window_no_motion_reduced", async ({ page }, info) => {
  test.skip(info.project.name !== "light-reduced-motion", "reduced motion only");
  await openCapture(page);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
    true,
  );
  expect(await animatedElements(page)).toEqual([]);
});
