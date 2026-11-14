import {
  type JSX,
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "../../lib/utils";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { Input } from "./input";

export interface TaskPickerOption {
  id: string;
  title: string;
  lane: "doing" | "today" | "backlog";
  /** The column in words ("Doing", "Today", "Backlog"). */
  laneLabel: string;
  frog?: boolean;
}

export interface TaskPickerProps {
  /** The chosen task, if any. */
  task?: { id: string; title: string };
  options: TaskPickerOption[];
  /** The chosen id, or null when the task is cleared. */
  onPick: (id: string | null) => void;
  /** The quiet text at rest and the input's name. Default "Add a task". */
  quietLabel?: string;
}

const ORDER = { doing: 0, today: 1, backlog: 2 } as const;
const QUIET =
  "min-h-hit-min max-w-full cursor-pointer truncate rounded-sm border-0 bg-clear px-1 py-3 text-start text-body-sm text-ink-muted outline-focus-ring outline-offset-2 hover:text-ink focus-visible:outline-2 motion-reduce:transition-none";

function matches(options: TaskPickerOption[], query: string): TaskPickerOption[] {
  const q = query.trim().toLowerCase();
  return options
    .map((option, index) => ({ option, index }))
    .filter(({ option }) => option.title.toLowerCase().includes(q))
    .sort((a, b) => ORDER[a.option.lane] - ORDER[b.option.lane] || a.index - b.index)
    .map(({ option }) => option);
}

/**
 * The optional task for a session. Quiet text at rest; an input that lists options while the person types.
 * Picking is never required: Esc, or leaving the input, changes nothing.
 */
export function TaskPicker({
  task,
  options,
  onPick,
  quietLabel = "Add a task",
}: TaskPickerProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const base = useId();
  const listId = `${base}-list`;
  const quiet = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const shown = matches(options, query);
  const optionId = (id: string) => `${base}-opt-${id}`;
  const current = shown[Math.min(active, shown.length - 1)];

  useEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      quiet.current?.focus();
    }
  }, [editing]);

  const [room, setRoom] = useState<number | undefined>(undefined);
  // Cap the panel at the room left below the input so it never leaves the window (scrolls inside instead).
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the list changes
  useLayoutEffect(() => {
    if (!editing) return;
    const measure = () => {
      const top = panel.current?.getBoundingClientRect().top;
      if (top !== undefined) setRoom(Math.max(0, window.innerHeight - top - 8));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [editing, shown.length]);
  const currentId = current?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the active option changes
  useEffect(() => {
    if (!editing || !currentId) return;
    document.getElementById(`${base}-opt-${currentId}`)?.scrollIntoView?.({ block: "nearest" });
  }, [editing, currentId, base]);

  const open = () => {
    setQuery("");
    setActive(0);
    setEditing(true);
  };
  const close = (returnFocus: boolean) => {
    restoreFocus.current = returnFocus;
    setEditing(false);
  };
  const pick = (id: string) => {
    onPick(id);
    close(true);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (shown.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (Math.min(i, shown.length - 1) + step + shown.length) % shown.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (current) pick(current.id);
    }
  };

  if (!editing) {
    return (
      <div data-slot="task-picker" className="flex min-w-0 items-center gap-1">
        <button
          ref={quiet}
          type="button"
          className={QUIET}
          onClick={open}
          aria-label={task ? `Task: ${task.title}. Change task` : undefined}
        >
          {task ? task.title : quietLabel}
        </button>
        {task ? (
          <IconButton
            label="Clear task"
            icon={<Icon name="close" />}
            onClick={() => onPick(null)}
          />
        ) : null}
      </div>
    );
  }
  return (
    <div data-slot="task-picker" data-open="" className="relative min-w-0">
      <Input
        label={quietLabel}
        className="**:data-[slot=field-label]:sr-only"
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-autocomplete="list"
        aria-controls={shown.length ? listId : undefined}
        aria-activedescendant={current ? optionId(current.id) : undefined}
        autoComplete="off"
        autoFocus
        value={query}
        placeholder="Find a task"
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (!restoreFocus.current) close(false);
        }}
      />
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/noNoninteractiveElementInteractions: keeps focus in the input while the pointer chooses an option */}
      <div
        ref={panel}
        style={{ maxHeight: room }}
        data-slot="task-picker-panel"
        onMouseDown={(event) => event.preventDefault()}
        className="absolute inset-x-0 top-full z-popover mt-1 overflow-auto rounded-md border border-line-strong bg-surface-overlay py-1 shadow-overlay"
      >
        {shown.length === 0 ? (
          <p className="m-0 px-4 py-3 text-body-sm text-ink-muted">No matching tasks</p>
        ) : (
          <div id={listId} role="listbox" aria-label="Tasks">
            {shown.map((option) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/useFocusableInteractive: the ARIA listbox pattern; the combobox input owns focus and the keys (aria-activedescendant)
              <div
                key={option.id}
                id={optionId(option.id)}
                role="option"
                aria-selected={option === current}
                data-slot="task-picker-option"
                onClick={() => pick(option.id)}
                onMouseMove={() => setActive(shown.indexOf(option))}
                className={cn(
                  "mx-1 flex min-h-hit-min cursor-pointer items-center justify-between gap-3 rounded-sm border-s-2 border-clear px-3 text-body text-ink hover:bg-surface-sunken",
                  option === current && "border-focus bg-selection",
                )}
              >
                <span className="min-w-0 truncate">{option.title}</span>
                <span className="flex-none text-end text-body-sm text-ink-muted">
                  {option.laneLabel}
                  {option.frog ? " · Frog" : ""}
                  {option === current ? (
                    <span aria-hidden="true" className="block text-caption text-focus">
                      Selected
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
