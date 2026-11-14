import { expect, type Page } from "@playwright/test";

/** The app's dev server (playwright.config.ts): `layout.html` renders the real App against mockIPC. */
export const APP_URL = "http://localhost:4180";

/**
 * Opens `layout.html?scenario=<name>` at `size` and waits until the page has settled: the bundled
 * fonts are loaded and the page's own content is up (Today's action or notice, Settings' fields).
 * `opts.page: "settings"` opens Settings through the rail (on General); `opts.pane` then picks
 * that pane in the Settings nav with the keyboard.
 */
export async function openApp(
  page: Page,
  scenario: string,
  size: { width: number; height: number },
  opts: { page?: string; pane?: string } = {},
): Promise<void> {
  await page.setViewportSize(size);
  const query = new URLSearchParams({ scenario });
  if (opts.page) query.set("page", opts.page);
  await page.goto(`${APP_URL}/layout.html?${query}`);
  if (opts.page === "settings") {
    const nav = page.getByRole("navigation", { name: "Settings" });
    await nav.waitFor();
    const pane = opts.pane ?? "General";
    if (pane !== "General") {
      // By keyboard: a click would leave the page in pointer mode, and a later programmatic
      // focus then shows no focus ring (:focus-visible).
      await nav.getByRole("button", { name: pane, exact: true }).focus();
      await page.keyboard.press("Enter");
    }
    const heading = page.getByRole("heading", { level: 2, name: pane, exact: true });
    await heading.waitFor();
    // The keyboard pick moves focus to the heading; let that settle before a test walks Tab.
    if (pane !== "General") await expect(heading).toBeFocused();
  } else {
    await page
      .getByRole("button", { name: /Start focus|Starting|Pause|Resume/ })
      .or(page.getByText("Timer unavailable."))
      .first()
      .waitFor();
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
