import { type KeyboardEvent, type ReactElement, useEffect, useId, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface ChecklistProps {
  label: string;
  items: readonly ChecklistItem[];
  onToggle: (id: string) => void;
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, text: string) => void;
  /** Most items allowed; default 30. */
  max?: number;
  disabled?: boolean;
  className?: string;
}

const TEXT_MAX = 200;
const FIELD =
  "block min-h-hit-min min-w-0 flex-1 rounded-sm border border-clear bg-clear px-2 py-2 font-sans text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

const BOX =
  "m-0 grid size-icon-md shrink-0 cursor-pointer appearance-none place-content-center rounded-none border-2 border-line-strong bg-surface-raised checked:border-focus checked:bg-focus before:hidden checked:before:block before:h-2 before:w-1 before:-mt-px before:rotate-45 before:border-0 before:border-r-2 before:border-b-2 before:border-solid before:border-on-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-default disabled:border-dashed";

interface RowProps extends Pick<ChecklistProps, "onToggle" | "onRemove" | "onRename" | "disabled"> {
  item: ChecklistItem;
  /** Called with the row's element after a removal so focus can move to a neighbour. */
  onBackspaceEmpty: (id: string, row: HTMLElement) => void;
}

/** One item: a checkbox, an editable text kept as a draft until Enter or blur, and a remove button. */
function Row({
  item,
  onToggle,
  onRemove,
  onRename,
  onBackspaceEmpty,
  disabled,
}: RowProps): ReactElement {
  const [draft, setDraft] = useState(item.text);
  useEffect(() => setDraft(item.text), [item.text]);
  const commit = () => {
    const text = draft.trim();
    if (!text) setDraft(item.text);
    else if (text !== item.text) onRename(item.id, text);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Backspace" && draft === "") {
      event.preventDefault();
      const row = event.currentTarget.closest("li") as HTMLElement;
      onBackspaceEmpty(item.id, row);
    }
  };
  return (
    <li data-slot="checklist-item" data-done={item.done} className="flex items-center gap-1">
      <label className="grid size-hit-min shrink-0 cursor-pointer place-items-center">
        <input
          type="checkbox"
          checked={item.done}
          disabled={disabled}
          aria-label={item.text}
          onChange={() => onToggle(item.id)}
          className={BOX}
        />
      </label>
      <input
        type="text"
        value={draft}
        maxLength={TEXT_MAX}
        disabled={disabled}
        aria-label={`Edit ${item.text}`}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        className={cn(
          FIELD,
          "hover:border-line-strong",
          item.done && "text-ink-muted line-through",
        )}
      />
      <IconButton
        label={`Remove item ${item.text}`}
        icon={<Icon name="close" />}
        disabled={disabled}
        onClick={() => onRemove(item.id)}
      />
    </li>
  );
}

/** A task's checklist: a checkbox per item, a live count, and an add field. Edits go up as they happen. */
export function Checklist({
  label,
  items,
  onToggle,
  onAdd,
  onRemove,
  onRename,
  max = 30,
  disabled,
  className,
}: ChecklistProps): ReactElement {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [refusal, setRefusal] = useState("");
  const addRef = useRef<HTMLInputElement>(null);
  const done = items.filter((item) => item.done).length;

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    if (items.length >= max) {
      setRefusal(`A checklist holds up to ${max} items.`);
      return;
    }
    onAdd(text);
    setDraft("");
    setRefusal("");
  };
  const removeEmpty = (itemId: string, row: HTMLElement) => {
    const previous = row.previousElementSibling?.querySelector<HTMLElement>("input[type=text]");
    onRemove(itemId);
    (previous ?? addRef.current)?.focus();
  };
  return (
    <fieldset
      data-slot="checklist"
      disabled={disabled}
      className={cn("m-0 flex min-w-0 flex-col gap-2 border-0 p-0", className)}
    >
      <legend className="mb-2 p-0 text-body-sm text-ink">{label}</legend>
      <p role="status" data-slot="checklist-count" className="m-0 text-body-sm text-ink-muted">
        {done} of {items.length} done
      </p>
      {items.length > 0 ? (
        <ul data-slot="checklist-items" className="m-0 flex list-none flex-col p-0">
          {items.map((item) => (
            <Row
              key={item.id}
              item={item}
              disabled={disabled}
              onToggle={onToggle}
              onRemove={onRemove}
              onRename={onRename}
              onBackspaceEmpty={removeEmpty}
            />
          ))}
        </ul>
      ) : null}
      <input
        ref={addRef}
        id={id}
        type="text"
        value={draft}
        maxLength={TEXT_MAX}
        aria-label="Add an item"
        aria-describedby={refusal ? `${id}-refusal` : undefined}
        placeholder="Add an item"
        autoComplete="off"
        onChange={(event) => {
          setDraft(event.target.value);
          setRefusal("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
        }}
        className={cn(
          FIELD,
          "w-full flex-none border-line-strong bg-surface-sunken placeholder:text-ink-muted hover:border-focus disabled:border-dashed disabled:text-ink-muted",
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
    </fieldset>
  );
}
