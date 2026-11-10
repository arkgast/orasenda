// The inline glyphs today's bundle shares: the mode shapes, the alert glyph and the play glyph.
// Internal (not exported from index.ts); replaced by Icon in T7. Each is hidden from VoiceOver:
// the word beside it carries the state, never the shape or colour alone.
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
    <svg className="os-shape" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
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

export function AlertGlyph(): ReactElement {
  return (
    <svg className="os-glyph" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <circle cx={7} cy={7} r={5.75} />
      <path d="M7 4v3.5" />
      <circle className="os-glyph-fill" cx={7} cy={9.9} r={0.5} />
    </svg>
  );
}

export function PlayGlyph(): ReactElement {
  return (
    <svg className="os-start-glyph" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M6.5 4.6v10.8a.9.9 0 0 0 1.37.77l8.6-5.4a.9.9 0 0 0 0-1.54l-8.6-5.4A.9.9 0 0 0 6.5 4.6z" />
    </svg>
  );
}
