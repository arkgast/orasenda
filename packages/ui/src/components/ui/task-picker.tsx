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
import { ACTIVE, ROW, SelectedWord } from "./task-picker-row";

export interface TaskPickerOption {
  id: string;
  title: string;
  lane: "doing" | "today" | "backlog";
  /** The column in words ("Doing", "Today", "Backlog"). */
  laneLabel: string;
  frog?: boolean;
  /** Planned for this week: reads " · This week" after the column word. */
  week?: boolean;
}

export interface TaskPickerProps {
  /** The chosen task, if any. */
  task?: { id: string; title: string };
  options: TaskPickerOption[];
  /** The chosen id, or null when the task is cleared. */
  onPick: (id: string | null) => void;
  /** The quiet text at rest and the input's name. Default "Add a task". */
  quietLabel?: string;
  /** Adds a last row, Add "<query>" to Backlog, while the query is not empty. Never applied on its own. */
  onCreate?: (title: string) => void;
}

const ORDER = { doing: 0, today: 1, backlog: 2 } as const;
const CREATE_ID = "create";
const QUIET =
  "min-h-hit-min min-w-0 max-w-full cursor-pointer truncate rounded-sm border-0 bg-clear px-1 py-3 text-start text-body-sm text-ink-muted outline-focus-ring outline-offset-2 hover:text-ink focus-visible:outline-2 motion-reduce:transition-none";

/** A length token in px, read from its CSS variable on the root. */
function tokenPx(name: string): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
}

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
  onCreate,
}: TaskPickerProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const base = useId();
  const listId = `${base}-list`;
  const quiet = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  // Clear task unmounts once the task is gone: focus then goes to the quiet text, not the body.
  const clearing = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);
  // The panel shows once the person types, or after an arrow key asks for the list.
  const [armed, setArmed] = useState(false);
  const shown = matches(options, query);
  const trimmed = query.trim();
  const showPanel = armed || trimmed !== "";
  // The add row is a quiet last row: it exists only with onCreate and a non-empty query.
  const hasCreate = onCreate !== undefined && trimmed !== "";
  const count = shown.length + (hasCreate ? 1 : 0);
  const listed = showPanel && count > 0;
  const optionId = (id: string) => `${base}-opt-${id}`;
  const createDomId = `${base}-create`;
  const index = Math.min(active, count - 1);
  const onCreateRow = listed && hasCreate && index === shown.length;
  const current = listed && !onCreateRow ? shown[index] : undefined;
  const activeId = onCreateRow ? CREATE_ID : current?.id;

  useEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      quiet.current?.focus();
    }
  }, [editing]);

  const hasTask = task !== undefined;
  useEffect(() => {
    if (!clearing.current) return;
    clearing.current = false;
    // Clear failed (the task is still there): nothing to restore. Otherwise only take focus when it was lost.
    if (hasTask) return;
    const active = document.activeElement;
    if (!active || active === document.body) quiet.current?.focus();
  }, [hasTask]);
  // A failed Clear leaves hasTask unchanged, so the effect above never runs: drop the flag on the next render.
  useEffect(() => {
    if (hasTask) clearing.current = false;
  });

  const [room, setRoom] = useState<number | undefined>(undefined);
  const [above, setAbove] = useState(false);
  // Cap the panel at the room available, and open it above the input when the room below is under two
  // rows and there is more above, so it never leaves the window (it scrolls inside instead).
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the list changes
  useLayoutEffect(() => {
    if (!editing || !showPanel) return;
    const measure = () => {
      const box = wrap.current?.getBoundingClientRect();
      if (!box) return;
      // The panel sits space-1 off the input, and keeps space-2 from the window edge.
      const gap = tokenPx("--space-1");
      const margin = tokenPx("--space-2") + gap;
      const below = window.innerHeight - box.bottom - margin;
      const over = box.top - margin;
      const flip = below < 2 * tokenPx("--hit-min") && over > below;
      setAbove(flip);
      setRoom(Math.max(0, flip ? over : below));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [editing, showPanel, shown.length]);
  const activeDomId = onCreateRow ? createDomId : activeId ? optionId(activeId) : undefined;
  useEffect(() => {
    if (!editing || !activeDomId) return;
    document.getElementById(activeDomId)?.scrollIntoView?.({ block: "nearest" });
  }, [editing, activeDomId]);

  const open = () => {
    setQuery("");
    setActive(0);
    setArmed(false);
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
  const create = () => {
    onCreate?.(trimmed);
    close(true);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!showPanel) {
        setArmed(true);
        setActive(0);
        return;
      }
      if (count === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (Math.min(i, count - 1) + step + count) % count);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (current) pick(current.id);
      else if (onCreateRow) create();
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
            onClick={() => {
              clearing.current = true;
              onPick(null);
            }}
          />
        ) : null}
      </div>
    );
  }
  return (
    <div ref={wrap} data-slot="task-picker" data-open="" className="relative min-w-0">
      <Input
        label={quietLabel}
        className="**:data-[slot=field-label]:sr-only"
        role="combobox"
        aria-expanded={listed}
        aria-autocomplete="list"
        aria-controls={listed ? listId : undefined}
        aria-activedescendant={
          onCreateRow ? createDomId : activeId ? optionId(activeId) : undefined
        }
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
      {showPanel ? (
        // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/noNoninteractiveElementInteractions: keeps focus in the input while the pointer chooses an option
        <div
          style={{ maxHeight: room }}
          data-slot="task-picker-panel"
          data-placement={above ? "above" : "below"}
          onMouseDown={(event) => event.preventDefault()}
          className={cn(
            "absolute inset-x-0 z-popover overflow-auto rounded-md border border-line-strong bg-surface-overlay py-1 shadow-overlay",
            above ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {count === 0 ? (
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
                  className={cn(ROW, option === current && ACTIVE)}
                >
                  <span className="min-w-0 truncate">{option.title}</span>
                  <span className="flex-none text-end text-body-sm text-ink-muted">
                    {option.laneLabel}
                    {option.frog ? " · Frog" : ""}
                    {option.week ? " · This week" : ""}
                    {option === current ? <SelectedWord /> : null}
                  </span>
                </div>
              ))}
              {hasCreate ? (
                // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/useFocusableInteractive: the ARIA listbox pattern; the combobox input owns focus and the keys (aria-activedescendant)
                <div
                  id={createDomId}
                  role="option"
                  aria-selected={onCreateRow}
                  data-slot="task-picker-create"
                  onClick={create}
                  onMouseMove={() => setActive(shown.length)}
                  className={cn(ROW, onCreateRow && ACTIVE)}
                >
                  <span className="flex min-w-0">
                    <span className="flex-none whitespace-pre">Add &quot;</span>
                    <span className="min-w-0 truncate">{trimmed}</span>
                    <span className="flex-none whitespace-pre">&quot; to Backlog</span>
                  </span>
                  {onCreateRow ? (
                    <span className="flex-none text-end text-body-sm text-ink-muted">
                      <SelectedWord />
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
