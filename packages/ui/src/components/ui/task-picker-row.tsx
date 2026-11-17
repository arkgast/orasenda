import type { JSX } from "react";

// Row styling shared by the task and add rows of the TaskPicker panel.
export const ROW =
  "mx-1 flex min-h-hit-min cursor-pointer items-center justify-between gap-3 rounded-sm border-s-2 border-clear px-3 text-body text-ink hover:bg-surface-sunken";
export const ACTIVE = "border-focus bg-selection";

export function SelectedWord(): JSX.Element {
  return (
    <span aria-hidden="true" className="block text-caption text-focus">
      Selected
    </span>
  );
}
