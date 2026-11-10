import { type ReactElement, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { AlertGlyph } from "./glyphs";

export interface SettingsIndexSection {
  id: string;
  name: string;
  value: string;
  problem?: { text: string; alert?: boolean };
}

export interface SettingsIndexProps {
  sections: SettingsIndexSection[];
  current: string;
  onJump: (id: string) => void;
}

/** The jump list beside the Settings content. One roving tab stop; arrows move, Return jumps. */
export function SettingsIndex({ sections, current, onJump }: SettingsIndexProps): ReactElement {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [last, setLast] = useState<string | null>(null);
  const has = (id: string | null) => sections.some((s) => s.id === id);
  const stop = has(last) ? last : has(current) ? current : (sections[0]?.id ?? null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the roving stop resets whenever the current section changes
  useEffect(() => {
    setLast(null);
  }, [current]);

  function move(i: number, d: number) {
    const next = sections[(i + d + sections.length) % sections.length];
    if (!next) return;
    setLast(next.id);
    refs.current[next.id]?.focus();
  }

  return (
    <nav data-slot="settings-index" aria-label="Settings sections">
      <ul className="m-0 flex w-index-width flex-none list-none flex-col gap-1 p-0">
        {sections.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              data-slot="settings-index-item"
              ref={(n) => {
                refs.current[s.id] = n;
              }}
              tabIndex={s.id === stop ? 0 : -1}
              aria-current={s.id === current ? "location" : undefined}
              onFocus={() => setLast(s.id)}
              onClick={() => onJump(s.id)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  move(i, 1);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  move(i, -1);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  onJump(s.id);
                }
              }}
              className={cn(
                "flex min-h-control-lg w-full cursor-pointer flex-col justify-center rounded-sm border-0 border-s-3 border-s-clear bg-clear px-3 py-1 text-start text-body text-ink hover:bg-surface-sunken",
                "aria-[current=location]:border-s-focus aria-[current=location]:bg-selection",
              )}
            >
              {s.name}
              <span
                data-slot="settings-index-value"
                className="flex items-center gap-1 text-body-sm text-ink-muted"
              >
                {s.problem ? (
                  <>
                    {s.problem.alert ? <AlertGlyph /> : null}
                    {s.problem.text}
                  </>
                ) : (
                  s.value
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
