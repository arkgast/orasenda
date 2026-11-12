// The mode shapes: a state shape, not an icon. Internal (not exported from index.ts). Hidden from
// VoiceOver: the word beside it carries the state, never the shape or colour alone.
import type { ReactElement } from "react";

export type ModeShapeMode =
  | "focus"
  | "break"
  | "routine"
  | "personal"
  | "warning"
  | "shallow"
  | "overflow"
  | "paused"
  | "idle";

export function ModeShape({ mode }: { mode?: ModeShapeMode }): ReactElement {
  return (
    <svg
      className="size-icon-sm flex-none"
      fill="currentColor"
      viewBox="0 0 10 10"
      aria-hidden="true"
      focusable="false"
    >
      {mode === "break" ? (
        <path d="M5 0a5 5 0 0 1 0 10z" />
      ) : mode === "routine" || mode === "personal" ? (
        <rect x={0.5} y={0.5} width={9} height={9} rx={2.5} />
      ) : mode === "warning" ? (
        <path d="M5 0.5 9.6 9.5H0.4z" />
      ) : mode === "paused" ? (
        <path d="M1 1h3v8H1zM6 1h3v8H6z" />
      ) : mode === "shallow" || mode === "overflow" || mode === "idle" ? (
        <circle cx={5} cy={5} r={4} fill="none" stroke="currentColor" strokeWidth={1.5} />
      ) : (
        <circle cx={5} cy={5} r={5} />
      )}
    </svg>
  );
}
