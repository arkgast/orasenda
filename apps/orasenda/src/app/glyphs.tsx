// Interim glyphs for the shell and Today, drawn from Lucide's geometry (ISC licence) on a 20-unit
// grid at a 1.5 stroke with round caps and joins. T7's icon set replaces this file.
import type { ReactElement, ReactNode } from "react";

function Glyph({ children }: { children: ReactNode }): ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Lucide "pause". */
export function PauseGlyph(): ReactElement {
  return (
    <Glyph>
      <rect x="11.67" y="3.33" width="3.33" height="13.33" rx="0.83" />
      <rect x="5" y="3.33" width="3.33" height="13.33" rx="0.83" />
    </Glyph>
  );
}

/** Lucide "play". */
export function PlayGlyph(): ReactElement {
  return (
    <Glyph>
      <path d="M5 2.5 16.67 10 5 17.5z" />
    </Glyph>
  );
}

/** Lucide "square": End session. */
export function EndGlyph(): ReactElement {
  return (
    <Glyph>
      <rect x="2.5" y="2.5" width="15" height="15" rx="1.67" />
    </Glyph>
  );
}

/** Lucide "layout-grid": Pages. */
export function PagesGlyph(): ReactElement {
  return (
    <Glyph>
      <rect x="2.5" y="2.5" width="5.83" height="5.83" rx="0.83" />
      <rect x="11.67" y="2.5" width="5.83" height="5.83" rx="0.83" />
      <rect x="11.67" y="11.67" width="5.83" height="5.83" rx="0.83" />
      <rect x="2.5" y="11.67" width="5.83" height="5.83" rx="0.83" />
    </Glyph>
  );
}

/** Lucide "chevron-down". */
export function ChevronGlyph(): ReactElement {
  return (
    <Glyph>
      <path d="m5 7.5 5 5 5-5" />
    </Glyph>
  );
}

/** Lucide "list": Jump to section. */
export function JumpGlyph(): ReactElement {
  return (
    <Glyph>
      <path d="M2.5 4.17h.01M2.5 10h.01M2.5 15.83h.01M6.67 4.17H17.5M6.67 10H17.5M6.67 15.83H17.5" />
    </Glyph>
  );
}
