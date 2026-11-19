import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "../../lib/utils";
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
  if (text.length < 1 || text.length > MAX_NAME) return `Use 1 to ${MAX_NAME} characters.`;
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
  const [edited, setEdited] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  const addId = useId();
  const removeId = useId();

  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  const problem = check(name, taken);
  const shown = problem ?? (edited ? undefined : error);

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
  // A press on a button must not move focus out of the editor first, or WebKit would save on blur.
  const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();

  return (
    // biome-ignore lint/a11y/useSemanticElements lint/a11y/noStaticElementInteractions lint/a11y/noNoninteractiveElementInteractions: a named group; Enter, Esc and focus leaving bubble up from the controls inside, and a form would submit
    <div
      role="group"
      aria-label="Edit column"
      data-slot="column-editor"
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      className="flex min-w-0 flex-col gap-4"
    >
      <Input
        ref={field}
        label="Name"
        value={name}
        error={shown}
        autoComplete="off"
        onChange={(event) => {
          setName(event.target.value);
          setEdited(true);
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
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onMouseDown={keepFocus} onClick={save}>
          Save
        </Button>
        <Button variant="quiet" onMouseDown={keepFocus} onClick={cancel}>
          Cancel
        </Button>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Button variant="quiet" onMouseDown={keepFocus} onClick={onAdd} {...dimmed(canAdd, addId)}>
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
            <Button
              variant="quiet"
              onMouseDown={keepFocus}
              onClick={onRemove}
              {...dimmed(canRemove, removeId)}
            >
              Remove column
            </Button>
            {canRemove === true ? null : (
              <p
                id={removeId}
                data-slot="column-editor-reason"
                className={cn("m-0 text-caption text-ink-muted")}
              >
                {canRemove.reason}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
