import type { ReactElement, ReactNode } from "react";

export interface WellnessNoteProps {
  children?: ReactNode;
  as?: "span" | "p";
}

/** The persistent disclaimer next to wellness content. Default copy says it is not medical advice. */
export function WellnessNote(props: WellnessNoteProps): ReactElement {
  const Tag = props.as ?? "span";
  return (
    <Tag
      data-slot="wellness-note"
      role="note"
      className="m-0 inline-flex items-center gap-2 text-body-sm text-ink-muted"
    >
      <svg
        viewBox="0 0 14 14"
        aria-hidden="true"
        focusable="false"
        strokeWidth={1.5}
        className="size-icon-md flex-none fill-none stroke-current"
      >
        <circle cx={7} cy={7} r={6} />
        <path d="M7 6v4M7 4.2v.1" />
      </svg>
      {props.children || "Wellness suggestion, not medical advice."}
    </Tag>
  );
}
