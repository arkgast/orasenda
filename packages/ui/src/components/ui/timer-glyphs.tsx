// The line glyphs the Focus window and the floater put in an IconButton (20-unit grid, 1.5 stroke, round
// caps, as the IconButton wrapper expects). Internal; the Icon set (T7) replaces them. Hidden from VoiceOver:
// the button's label is the name.
import type { ReactElement } from "react";

function line(path: ReactElement): ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  );
}

export const PauseIcon = (): ReactElement => line(<path d="M7.5 4.5v11M12.5 4.5v11" />);
export const PlayIcon = (): ReactElement => line(<path d="M7 4.5l8 5.5-8 5.5z" />);
export const EndIcon = (): ReactElement =>
  line(<rect x="5" y="5" width="10" height="10" rx="1.5" />);
export const LeaveIcon = (): ReactElement =>
  line(<path d="M4 8V4h4M16 12v4h-4M4 4l5 5M16 16l-5-5" />);
export const OpenIcon = (): ReactElement =>
  line(<path d="M8 4.5H4.5v11h11V12M11 4.5h4.5V9M15.5 4.5L9 11" />);

/** The filled play mark on a Start button (a Button, so the glyph is sized and filled here); `small` is the floater pill's icon-md. */
export function StartMark({ small }: { small?: boolean }): ReactElement {
  return (
    <svg
      className={
        small ? "size-icon-md flex-none fill-current" : "size-icon-lg flex-none fill-current"
      }
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6.5 4.6v10.8a.9.9 0 0 0 1.37.77l8.6-5.4a.9.9 0 0 0 0-1.54l-8.6-5.4A.9.9 0 0 0 6.5 4.6z" />
    </svg>
  );
}
