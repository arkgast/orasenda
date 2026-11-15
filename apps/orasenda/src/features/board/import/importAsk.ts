/**
 * The last `importAsked` value the Board acted on. It outlives the page, so a remount with the
 * value it already opened for never opens the sheet again.
 */
let consumed = 0;

/** True once per new value: the caller opens the sheet. */
export function takeImportAsk(asked: number | undefined): boolean {
  if (asked === undefined || asked === consumed) return false;
  consumed = asked;
  return true;
}

/** Tests start from a clean slate. */
export function resetImportAsk(): void {
  consumed = 0;
}
