/**
 * A duration token (`--duration-hint`) in milliseconds. It reads "4s" or "1600ms"; anything else is
 * a bug, not a default (is the token CSS loaded?).
 */
export function readDuration(name: string): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const match = /^([0-9]*\.?[0-9]+)(ms|s)$/.exec(raw);
  if (!match) throw new Error(`${name} is not a duration: is the token CSS loaded?`);
  return Number.parseFloat(match[1] as string) * (match[2] === "s" ? 1000 : 1);
}
