import { Input } from "@orasenda/ui";
import { type KeyboardEvent, type ReactElement, useRef, useState } from "react";

/** The most characters an intent holds; Rust refuses more (`invalidIntent`). */
export const INTENT_MAX = 120;

/**
 * How the field closed. `save` is the text to send: `null` clears the intent, `undefined` sends
 * nothing (Esc, or no change). `refocus` is whether focus returns to the status row's button: not
 * after a blur, which means focus went somewhere else on purpose.
 */
export type IntentDone = { save: string | null | undefined; refocus: boolean };

type Props = {
  /** The saved intent. */
  value: string | null;
  onDone(done: IntentDone): void;
};

/**
 * The one-line field that replaces the status row's content: Return or blur saves, an empty Return
 * clears, Esc restores the saved text. It closes at most once, whatever fires next.
 */
export function IntentField({ value, onDone }: Props): ReactElement {
  const [draft, setDraft] = useState(value ?? "");
  const closed = useRef(false);

  const close = (save: string | null | undefined, refocus: boolean) => {
    if (closed.current) return;
    closed.current = true;
    onDone({ save, refocus });
  };
  const typed = () => {
    const text = draft.trim();
    if (text === (value ?? "")) return undefined;
    return text === "" ? null : text;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      close(typed(), true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(undefined, true);
    }
  };

  return (
    <div data-slot="intent-field" className="today-intent">
      <Input
        // The person just asked for this field, so focus goes to it.
        autoFocus
        label="What will be done?"
        maxLength={INTENT_MAX}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => close(typed(), false)}
      />
    </div>
  );
}
