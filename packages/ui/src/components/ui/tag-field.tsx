import { type KeyboardEvent, type ReactElement, useId, useState } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";

export interface TagFieldProps {
  label: string;
  tags: readonly string[];
  onChange: (tags: string[]) => void;
  /** Most tags allowed; default 8. */
  max?: number;
  /** Longest tag; default 24 characters. */
  maxLength?: number;
  disabled?: boolean;
  className?: string;
}

/** Adds each candidate in order; returns the new list and the first refusal's line, if any. */
function addAll(
  current: readonly string[],
  candidates: readonly string[],
  max: number,
  maxLength: number,
): { next: string[]; refusal: string } {
  const next = [...current];
  let refusal = "";
  for (const raw of candidates) {
    const tag = raw.trim();
    if (!tag) continue;
    if (tag.length > maxLength) refusal ||= `A tag is up to ${maxLength} characters.`;
    else if (next.some((t) => t.toLowerCase() === tag.toLowerCase()))
      refusal ||= `${tag} is already a tag.`;
    else if (next.length >= max) refusal ||= `A task holds up to ${max} tags.`;
    else next.push(tag);
  }
  return { next, refusal };
}

/** A row of tag chips and a field. Enter or a comma adds a chip; each chip has its own remove button. */
export function TagField({
  label,
  tags,
  onChange,
  max = 8,
  maxLength = 24,
  disabled,
  className,
}: TagFieldProps): ReactElement {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [refusal, setRefusal] = useState("");

  const commit = (candidates: readonly string[], rest: string) => {
    const { next, refusal: line } = addAll(tags, candidates, max, maxLength);
    setRefusal(line);
    // A refused single tag stays in the field so nothing typed is lost.
    setDraft(line && candidates.length === 1 && rest === "" ? (candidates[0] as string) : rest);
    if (next.length !== tags.length) onChange(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (draft.trim()) commit([draft], "");
    }
  };
  return (
    <div data-slot="tag-field" className={cn("flex min-w-0 flex-col gap-2", className)}>
      <label htmlFor={id} data-slot="field-label" className="text-body-sm text-ink">
        {label}
      </label>
      {tags.length > 0 ? (
        <ul data-slot="tag-list" className="m-0 flex list-none flex-wrap gap-2 p-0">
          {tags.map((tag) => (
            <li
              key={tag}
              data-slot="tag"
              className="flex items-center gap-1 rounded-pill border border-line-strong bg-surface-raised py-1 ps-3 pe-1 text-body-sm text-ink"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                disabled={disabled}
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                className={cn(
                  "relative grid size-icon-lg shrink-0 cursor-pointer place-items-center rounded-pill border-0 bg-clear p-0 text-ink-muted hover:text-ink",
                  "before:absolute before:top-1/2 before:left-1/2 before:size-hit-min before:-translate-x-1/2 before:-translate-y-1/2",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  "disabled:cursor-default",
                )}
              >
                <Icon name="close" size="md" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        id={id}
        type="text"
        value={draft}
        disabled={disabled}
        autoComplete="off"
        aria-describedby={refusal ? `${id}-refusal` : undefined}
        placeholder="Add a tag"
        data-slot="tag-input"
        onChange={(event) => {
          const parts = event.target.value.split(",");
          if (parts.length > 1) commit(parts.slice(0, -1), parts[parts.length - 1] as string);
          else {
            setRefusal("");
            setDraft(event.target.value);
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && commit([draft], "")}
        className={cn(
          "block min-h-hit-min w-full min-w-0 rounded-sm border border-line-strong bg-surface-sunken px-3 py-2 font-sans text-body text-ink",
          "placeholder:text-ink-muted hover:border-focus",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          "disabled:cursor-default disabled:border-dashed disabled:text-ink-muted",
        )}
      />
      {refusal ? (
        <p
          id={`${id}-refusal`}
          role="status"
          data-slot="field-error"
          className="m-0 flex items-baseline gap-2 text-body-sm text-ink-muted"
        >
          <Icon name="alert" size="md" />
          {refusal}
        </p>
      ) : null}
    </div>
  );
}
