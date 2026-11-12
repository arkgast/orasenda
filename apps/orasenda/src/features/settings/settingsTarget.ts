/** The *Keep going automatically* checkbox's id (CadenceRows). */
const KEEP_GOING_ID = "keep-going-auto";

/**
 * Brings the "Keep going" row into view and focuses its checkbox. False when the row isn't on
 * the page, so the caller can fall back to the Timer section.
 */
export function focusKeepGoing(root: HTMLElement): boolean {
  const box = root.querySelector<HTMLElement>(`#${KEEP_GOING_ID}`);
  if (!box) return false;
  box.closest('[data-slot="settings-row"]')?.scrollIntoView?.({ block: "center" });
  box.focus({ preventScroll: true });
  return true;
}
