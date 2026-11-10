import type { ReactElement } from "react";

// Placeholder glyphs until the icon set lands (T7). Paths are the design system's own.
function glyph(d: ReactElement): ReactElement {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {d}
    </svg>
  );
}
export const Pause = (): ReactElement => glyph(<path d="M7.5 4.5v11M12.5 4.5v11" />);
export const Play = (): ReactElement => glyph(<path d="M7 4.5l8 5.5-8 5.5z" />);
export const Stop = (): ReactElement => glyph(<rect x="5" y="5" width="10" height="10" rx="1.5" />);
export const Menu = (): ReactElement => glyph(<path d="M4 6h12M4 10h12M4 14h12" />);
export const Shrink = (): ReactElement =>
  glyph(<path d="M4 8V4h4M16 12v4h-4M4 4l5 5M16 16l-5-5" />);
