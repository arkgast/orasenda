// The icon set: Lucide geometry (ISC licence, (c) Lucide Contributors; parts (c) Cole Bemis, MIT,
// Feather) redrawn on a 20-unit grid at a 1.5 stroke with round caps and joins. One inline table,
// no dependency. Always hidden from VoiceOver: the word beside an icon carries the meaning.
import type { ReactElement } from "react";
import { cn } from "../../lib/utils";

/** Every icon name. The union derives from this list and the table is typed by it, so a name cannot be missing or extra. */
export const ICON_NAMES = [
  "play",
  "pause",
  "stop",
  "expand",
  "collapse",
  "window",
  "menu",
  "chevron",
  "close",
  "back",
  "alert",
  "info",
  "pages",
  "jump",
  "today",
  "board",
  "calendar",
  "routines",
  "review",
  "settings",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const GLYPHS: Record<IconName, ReactElement> = {
  play: <path d="M5.5 3.5L16 10L5.5 16.5Z" />,
  pause: (
    <>
      <rect x="4.5" y="3.5" width="3.5" height="13" rx="1" />
      <rect x="12" y="3.5" width="3.5" height="13" rx="1" />
    </>
  ),
  stop: <rect x="3.5" y="3.5" width="13" height="13" rx="2" />,
  expand: <path d="M12 3.5h4.5V8M8 16.5H3.5V12M16.5 3.5l-5 5M3.5 16.5l5-5" />,
  collapse: <path d="M3.5 11.5h5v5M16.5 8.5h-5v-5M11.5 8.5l5-5M3.5 16.5l5-5" />,
  window: (
    <>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <path d="M2.5 7.5h15M5.5 3.5v4M8.5 3.5v4" />
    </>
  ),
  menu: <path d="M3.5 5h13M3.5 10h13M3.5 15h13" />,
  chevron: <path d="M5 7.5l5 5 5-5" />,
  close: <path d="M15 5L5 15M5 5l10 10" />,
  back: <path d="M10 15.5L4.5 10L10 4.5M15.5 10H4.5" />,
  alert: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6.5v4M10 13.5h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 13.5v-4M10 6.5h.01" />
    </>
  ),
  pages: (
    <>
      <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
    </>
  ),
  jump: <path d="M3.5 5h.01M3.5 10h.01M3.5 15h.01M7 5h9.5M7 10h9.5M7 15h9.5" />,
  today: (
    <>
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.34 4.34l1.42 1.42M14.24 14.24l1.42 1.42M4.34 15.66l1.42-1.42M14.24 5.76l1.42-1.42" />
    </>
  ),
  board: (
    <>
      <rect x="2.5" y="2.5" width="15" height="15" rx="2" />
      <path d="M6.5 6v6.5M10 6v3.5M13.5 6v8" />
    </>
  ),
  calendar: (
    <>
      <rect x="2.5" y="3.5" width="15" height="14" rx="2" />
      <path d="M2.5 8h15M6.5 2v3M13.5 2v3" />
    </>
  ),
  routines: (
    <path d="M14 2.5l3 3-3 3M2.5 10V9A3.5 3.5 0 0 1 6 5.5h11M6 17.5l-3-3 3-3M17.5 10v1A3.5 3.5 0 0 1 14 14.5H3" />
  ),
  review: <path d="M2.5 2.5v13a2 2 0 0 0 2 2h13M6.5 14v-2.5M10.5 14V4.5M14.5 14V7.5" />,
  settings: (
    <>
      <path d="M10.18 2h-.35a1.6 1.6 0 0 0-1.6 1.6v.14a1.6 1.6 0 0 1-.8 1.38l-.34.2a1.6 1.6 0 0 1-1.6 0l-.12-.06a1.6 1.6 0 0 0-2.18.58l-.18.3a1.6 1.6 0 0 0 .58 2.18l.12.08a1.6 1.6 0 0 1 .8 1.38v.41a1.6 1.6 0 0 1-.8 1.39l-.12.07a1.6 1.6 0 0 0-.58 2.18l.18.3a1.6 1.6 0 0 0 2.18.58l.12-.06a1.6 1.6 0 0 1 1.6 0l.34.2a1.6 1.6 0 0 1 .8 1.38v.14a1.6 1.6 0 0 0 1.6 1.6h.35a1.6 1.6 0 0 0 1.6-1.6v-.14a1.6 1.6 0 0 1 .8-1.38l.34-.2a1.6 1.6 0 0 1 1.6 0l.12.06a1.6 1.6 0 0 0 2.18-.58l.18-.31a1.6 1.6 0 0 0-.58-2.18l-.12-.06a1.6 1.6 0 0 1-.8-1.39v-.4a1.6 1.6 0 0 1 .8-1.39l.12-.07a1.6 1.6 0 0 0 .58-2.18l-.18-.3a1.6 1.6 0 0 0-2.18-.58l-.12.06a1.6 1.6 0 0 1-1.6 0l-.34-.2a1.6 1.6 0 0 1-.8-1.38V3.6a1.6 1.6 0 0 0-1.6-1.6z" />
      <circle cx="10" cy="10" r="2.5" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  /** "lg" (20px, the default) or "md" (14px: the field and notice alert glyphs). */
  size?: "md" | "lg";
}

/** A 20-unit line icon. It takes its colour from the text around it and is hidden from VoiceOver. */
export function Icon({ name, size = "lg" }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("flex-none", size === "md" ? "size-icon-md" : "size-icon-lg")}
    >
      {GLYPHS[name]}
    </svg>
  );
}
