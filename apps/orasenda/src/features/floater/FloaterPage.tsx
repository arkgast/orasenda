import { useSurfaceTimer } from "@domain/timer/useSurfaceTimer";
import { FloatingTimer } from "@orasenda/ui";
import { useTheme } from "@shared/hooks/useTheme";
import { commands, type TimerView_Serialize } from "@shared/ipc/bindings";
import { type MouseEvent, useCallback, useEffect, useRef } from "react";
import "./floater.css";

// The key route (windows/floater.rs `KEY_ROUTE`): with `Webview` this page hears Space, Return
// and Esc itself. With `Monitor` Rust consumes them and runs the same paths, and the handlers
// below stay but never see the keys.

/** A command's outcome: a typed error and a thrown one both end in the console, never silently. */
async function run(
  name: string,
  call: () => Promise<{ status: "ok" } | { status: "error"; error: unknown }>,
): Promise<void> {
  try {
    const result = await call();
    if (result.status === "error") console.error(`${name} failed`, result.error);
  } catch (error: unknown) {
    console.error(`${name} failed`, error);
  }
}

const pause = () => run("timer_pause", () => commands.timerPause());
const resume = () => run("timer_resume", () => commands.timerResume());
/** The saved preset: the service reads the selected one when it starts (`quick: false`). */
const start = () => run("timer_start", () => commands.timerStart({ quick: false }));
/** Skip break is End: the same `timer_stop` Today's button sends. */
const skipBreak = () => run("timer_stop", () => commands.timerStop());
const open = () => run("main_show", () => commands.mainShow());
const close = () => run("focus_view_close", () => commands.focusViewClose());

/** Space on the page: pause, resume or start, by what the timer is doing. */
function toggle(view: TimerView_Serialize): Promise<void> {
  if (view.state === "running") return pause();
  if (view.state === "paused") return resume();
  return start();
}

const MENU_CLOSE = { id: "close", label: "Close floating timer" };
const MENU_START = { id: "start", label: "Start focus" };

/**
 * The floating timer's page (`floater.html`): a `FloatingTimer` filling the panel. It reads the
 * timer through `useSurfaceTimer` (never `timer_state`), takes the saved preset for Start, has no
 * End, and never asks for key focus: Rust gives it key focus when it opens or is clicked.
 */
export function FloaterPage() {
  useTheme();
  const { view, ended, failed } = useSurfaceTimer();
  const latest = useRef({ view, ended });
  useEffect(() => {
    latest.current = { view, ended };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      // A focused button turns Space and Return into its own click; the page adds nothing.
      const onButton = event.target instanceof Element && event.target.closest("button") !== null;
      const current = latest.current.view;
      if (event.key === "Escape") {
        event.preventDefault();
        void close();
      } else if (event.key === "Enter" && !onButton) {
        event.preventDefault();
        void open();
      } else if (event.key === " " && !onButton && current) {
        event.preventDefault();
        void toggle(current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const contextMenu = useCallback((event: MouseEvent) => {
    event.preventDefault();
    const { view: current, ended: over } = latest.current;
    const quiet = current?.state === "idle" || over;
    commands
      .nativeMenuPopup({
        items: quiet ? [MENU_START, MENU_CLOSE] : [MENU_CLOSE],
        x: event.clientX,
        y: event.clientY,
      })
      .then(
        (chosen) => {
          // null: dismissed, or the menu could not be shown (logged in Rust).
          if (chosen === MENU_CLOSE.id) void close();
          else if (chosen === MENU_START.id) void start();
        },
        (error: unknown) => console.error("native_menu_popup failed", error),
      );
  }, []);

  if (failed && !view) {
    return (
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the panel's context menu is the host's, on the landmark
      <main
        aria-label="Floating timer"
        className="app-floater"
        data-tauri-drag-region="deep"
        onContextMenu={contextMenu}
      >
        <div className="flex items-center rounded-md border border-line-strong bg-surface-raised px-3 text-body-sm text-ink shadow-raised">
          <p role="status">Orasenda can't reach the timer.</p>
        </div>
      </main>
    );
  }
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the panel's context menu is the host's, on the landmark
    <main aria-label="Floating timer" className="app-floater" onContextMenu={contextMenu}>
      {view ? (
        <FloatingTimer
          data-tauri-drag-region="deep"
          remaining={view.remaining}
          remainingLabel={view.remainingLabel}
          progress={view.progress}
          mode={view.mode}
          phase={view.phase}
          onSkipBreak={() => void skipBreak()}
          // The floater has no preset list (no `presets_list` grant), so the button is "Keep going".
          onKeepGoing={view.offer === "keepGoing" ? () => void start() : undefined}
          ended={ended}
          onPause={() => void pause()}
          onResume={() => void resume()}
          onStart={() => void start()}
          onOpen={() => void open()}
        />
      ) : null}
    </main>
  );
}
