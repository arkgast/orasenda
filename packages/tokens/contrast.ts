// WCAG contrast maths for the declared colour pairs (contrast-pairs.json) against tokens.json.
// contrast.test.ts runs it in both themes and covers the maths itself.

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export type Kind = "text" | "mark";
export const THRESHOLD: Record<Kind, number> = { text: 4.5, mark: 3.0 };
const HEX = /^#[0-9a-fA-F]{6}$/;

export class BadInput extends Error {}

// biome-ignore lint/suspicious/noExplicitAny: tokens.json and the pairs file are read loosely
type Loose = any;

export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Compare the exact ratio; rounding is for display only.
export function meets(value: number, kind: Kind): boolean {
  return value >= THRESHOLD[kind];
}

function index(tokens: Loose): Map<string, Loose> {
  const found = new Map<string, Loose>();
  for (const tok of tokens?.color?.tokens ?? []) found.set(tok.name, tok.value);
  return found;
}

function follow(idx: Map<string, Loose>, name: string, theme: Theme, seen: string[] = []): string {
  if (seen.includes(name)) throw new BadInput(`token "${name}" refers to itself`);
  if (!idx.has(name)) throw new BadInput(`unknown token "${name}"`);
  let value = idx.get(name);
  if (value !== null && typeof value === "object") value = value[theme];
  const ref = /^\{([^{}]+)\}$/.exec(String(value));
  if (ref) return follow(idx, ref[1], theme, [...seen, name]);
  if (!HEX.test(String(value))) {
    throw new BadInput(`token "${name}" is "${value}", not a #rrggbb colour`);
  }
  return String(value).toLowerCase();
}

/** Returns [light, dark] hex values for a colour token, following {ref} values. */
export function resolve(tokens: Loose, name: string): [string, string] {
  const idx = index(tokens);
  return [follow(idx, name, "light"), follow(idx, name, "dark")];
}

function hexWall(value: unknown, where: string): string {
  if (typeof value !== "string" || !HEX.test(value)) {
    throw new BadInput(`${where}: wallpaper ${JSON.stringify(value)} is not #rrggbb`);
  }
  return value.toLowerCase();
}

function need(entry: Loose, keys: string[], n: number): void {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new BadInput(`entry ${n} is not an object`);
  }
  for (const key of keys) {
    if (typeof entry[key] !== "string" || !entry[key]) {
      throw new BadInput(`entry ${n} has no string "${key}"`);
    }
  }
  if (entry.kind !== "text" && entry.kind !== "mark") {
    throw new BadInput(`entry ${n} kind must be "text" or "mark"`);
  }
}

/** Returns the report lines and whether any pair failed. Throws BadInput. */
export function check(tokens: Loose, pairs: Loose[]): { lines: string[]; failed: boolean } {
  const lines: string[] = [];
  let failed = false;
  pairs.forEach((entry, n) => {
    if (entry !== null && typeof entry === "object" && "fill" in entry) {
      need(entry, ["fill", "edge", "where"], n);
      if (entry.rule !== "fill-or-edge") {
        throw new BadInput(`entry ${n}: floater rule must be "fill-or-edge"`);
      }
      if (!Array.isArray(entry.wallpaper) || entry.wallpaper.length === 0) {
        throw new BadInput(`entry ${n} has no "wallpaper" list`);
      }
      const fill = resolve(tokens, entry.fill);
      const edge = resolve(tokens, entry.edge);
      for (const wall of entry.wallpaper) {
        const w = hexWall(wall, `entry ${n}`);
        THEMES.forEach((theme, i) => {
          const rf = ratio(fill[i], w);
          const re = ratio(edge[i], w);
          const ok = meets(rf, entry.kind) || meets(re, entry.kind);
          failed ||= !ok;
          lines.push(
            `${ok ? "ok  " : "FAIL"} ${entry.where} on ${wall} (${theme}): ` +
              `fill ${rf.toFixed(2)} / edge ${re.toFixed(2)} (one needs ${THRESHOLD[entry.kind as Kind].toFixed(1)}:1)`,
          );
        });
      }
    } else {
      need(entry, ["fg", "bg", "where"], n);
      const fg = resolve(tokens, entry.fg);
      const bg = resolve(tokens, entry.bg);
      const min = THRESHOLD[entry.kind as Kind];
      const vals = [ratio(fg[0], bg[0]), ratio(fg[1], bg[1])];
      const ok = vals.every((v) => meets(v, entry.kind));
      failed ||= !ok;
      lines.push(
        `${ok ? "ok  " : "FAIL"} ${entry.fg} on ${entry.bg} [${entry.kind} ${min.toFixed(1)}:1] ` +
          `light ${vals[0].toFixed(2)}, dark ${vals[1].toFixed(2)}: ${entry.where}`,
      );
    }
  });
  return { lines, failed };
}
