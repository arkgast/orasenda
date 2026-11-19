import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "./button";
import { Input } from "./input";
import { Stepper } from "./stepper";

export interface ColumnEditorProps {
  name: string;
  /** The limit stepper; null hides it. `zeroLabel` is what 0 reads, and 0 then saves `null`. */
  limit: { value: number; min: number; max: number; zeroLabel?: string } | null;
  /** The service's words for a refused save; shown under the name until the name changes. */
  error?: string;
  /** The other columns' names; a name already here (any case) is refused. */
  taken: readonly string[];
  canAdd: true | { reason: string };
  /** `null` hides Remove (built-in columns). */
  canRemove: true | { reason: string } | null;
  onSave: (value: { name: string; limit: number | null }) => void;
  onCancel: () => void;
  onAdd: () => void;
  onRemove: () => void;
}

const MAX_NAME = 24;

function check(name: string, taken: readonly string[]): string | undefined {
  const text = name.trim();
  if ([...text].length < 1 || [...text].length > MAX_NAME)
    return `Use 1 to ${MAX_NAME} characters.`;
  if (taken.some((other) => other.trim().toLowerCase() === text.toLowerCase()))
    return "Another column has that name.";
  return undefined;
}

/** The editor that replaces a column's header: name, limit, add after and remove. */
export function ColumnEditor({
  name: initialName,
  limit,
  error,
  taken,
  canAdd,
  canRemove,
  onSave,
  onCancel,
  onAdd,
  onRemove,
}: ColumnEditorProps): ReactElement {
  const [name, setName] = useState(initialName);
  const [value, setValue] = useState(limit?.value ?? 0);
  const [errorFor, setErrorFor] = useState(initialName);
  const latest = useRef(initialName);
  latest.current = name;
  const field = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  const addId = useId();
  const removeId = useId();

  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  // A new `error` is the host's answer to the last save: the editor listens again, and the
  // refusal belongs to the name it was given for.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when `error` changes only
  useEffect(() => {
    settled.current = false;
    setErrorFor(latest.current);
  }, [error]);

  const problem = check(name, taken);
  const shown = problem ?? (name === errorFor ? error : undefined);

  const save = () => {
    if (problem || settled.current) return;
    settled.current = true;
    const none = limit === null || (value === 0 && limit.zeroLabel !== undefined);
    onSave({ name: name.trim(), limit: none ? null : value });
  };
  const cancel = () => {
    if (settled.current) return;
    settled.current = true;
    onCancel();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    } else if (event.key === "Enter" && !(event.target as HTMLElement).closest("button")) {
      event.preventDefault();
      save();
    }
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
      return;
    if (problem) cancel();
    else save();
  };

  const dimmed = (reason: { reason: string } | true, id: string) =>
    reason === true ? {} : { "aria-disabled": true as const, "aria-describedby": id };
  // A press on anything but the text fields must not move focus out of the editor first, or WebKit
  // would save on blur.
  const keepFocus = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target as HTMLElement).closest("input, [role=spinbutton]")) event.preventDefault();
  };

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: a named group; Enter, Esc and focus leaving bubble up from the controls inside, and a form would submit
    // biome-ignore lint/a11y/useSemanticElements: a form would submit
    <div
      role="group"
      aria-label="Edit column"
      data-slot="column-editor"
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onMouseDown={keepFocus}
      className="flex min-w-0 flex-col gap-2"
    >
      <Input
        ref={field}
        label="Column name"
        maxLength={MAX_NAME}
        helper={shown ? undefined : `1 to ${MAX_NAME} characters.`}
        value={name}
        error={shown}
        autoComplete="off"
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      {limit ? (
        <Stepper
          label="Limit"
          value={value}
          min={limit.min}
          max={limit.max}
          zeroLabel={limit.zeroLabel}
          onChange={setValue}
        />
      ) : null}
      <div className="flex min-w-0 flex-col gap-2">
        <Button variant="quiet" onClick={onAdd} {...dimmed(canAdd, addId)}>
          Add column after
        </Button>
        {canAdd === true ? null : (
          <p
            id={addId}
            data-slot="column-editor-reason"
            className="m-0 text-caption text-ink-muted"
          >
            {canAdd.reason}
          </p>
        )}
        {canRemove === null ? null : (
          <>
            <Button variant="quiet" onClick={onRemove} {...dimmed(canRemove, removeId)}>
              Remove column
            </Button>
            {canRemove === true ? null : (
              <p
                id={removeId}
                data-slot="column-editor-reason"
                className="m-0 text-caption text-ink-muted"
              >
                {canRemove.reason}
              </p>
            )}
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={save}>
          Save
        </Button>
        <Button variant="quiet" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
