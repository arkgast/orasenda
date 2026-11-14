import { useShortcuts } from "@domain/keyboard/useShortcuts";
import { PAGE_ORDER } from "@domain/navigation/PagesButton";
import { onPaletteRequest } from "@domain/navigation/paletteRequest";
import { useWindowView } from "@domain/window/useWindowView";
import type { AboutInfo } from "@features/settings/panes/About";
import type { Arrival, SettingsTarget } from "@features/settings/Settings";
import { type NavPage, NavRail } from "@orasenda/ui";
import { useTheme } from "@shared/hooks/useTheme";
import { useWindowLayout } from "@shared/hooks/useWindowLayout";
import { commands, events } from "@shared/ipc/bindings";
import { subscribe } from "@shared/ipc/subscribe";
import {
  type ComponentProps,
  type ComponentType,
  Suspense,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { PageBoundary } from "./PageBoundary";
import { Palette } from "./palette/Palette";

export type { SettingsTarget };

// Every page is its own chunk. They start loading right away, and a page that has loaded renders
// without suspending (React's `use` reads a settled promise at once), so a click on the rail finds the new
// heading in place and focus can move to it straight away. (React.lazy would suspend on first render.)
type Loaded<P> = Promise<ComponentType<P>> & { status?: string; value?: ComponentType<P> };

function load<P>(importer: () => Promise<ComponentType<P>>) {
  const promise: Loaded<P> = importer();
  // A failed chunk rejects `use` inside the page boundary; this handler keeps it from also being unhandled.
  promise.then(
    (component) => {
      promise.status = "fulfilled";
      promise.value = component;
    },
    () => {},
  );
  return { ready: promise, use: () => use(promise as Parameters<typeof use<ComponentType<P>>>[0]) };
}

const todayPage = load(() => import("@features/today/Today").then((m) => m.Today));
const settingsPage = load(() => import("@features/settings/Settings").then((m) => m.Settings));
const boardPage = load(() => import("@features/board/BoardPage").then((m) => m.BoardPage));
const placeholderPage = load(() => import("./Placeholder").then((m) => m.Placeholder));
const focusPage = load(() => import("@features/focus/FocusPage").then((m) => m.FocusPage));

/** Settles when every page has loaded or failed; the test setup waits for it. */
export const pagesReady = Promise.allSettled([
  todayPage.ready,
  settingsPage.ready,
  boardPage.ready,
  placeholderPage.ready,
  focusPage.ready,
]);

function Today(props: ComponentProps<typeof import("@features/today/Today").Today>) {
  const Page = todayPage.use();
  return <Page {...props} />;
}
function Settings(props: ComponentProps<typeof import("@features/settings/Settings").Settings>) {
  const Page = settingsPage.use();
  return <Page {...props} />;
}
function Board(props: ComponentProps<typeof import("@features/board/BoardPage").BoardPage>) {
  const Page = boardPage.use();
  return <Page {...props} />;
}
function FocusPage(props: ComponentProps<typeof import("@features/focus/FocusPage").FocusPage>) {
  const Page = focusPage.use();
  return <Page {...props} />;
}
function Placeholder(props: ComponentProps<typeof import("./Placeholder").Placeholder>) {
  const Page = placeholderPage.use();
  return <Page {...props} />;
}

const TITLES: Readonly<Record<NavPage, string>> = {
  today: "Today",
  board: "Board",
  calendar: "Calendar",
  routines: "Routines",
  review: "Review",
  settings: "Settings",
};

export function App() {
  const [info, setInfo] = useState<AboutInfo>({ status: "loading" });
  const [current, setCurrent] = useState<NavPage>("today");
  const [arrival, setArrival] = useState<Arrival>({ seq: 0 });
  const currentRef = useRef<NavPage>("today");
  const main = useRef<HTMLElement>(null);

  const { compact } = useWindowLayout();
  useTheme();

  const { fullScreen, hintsLeft } = useWindowView();

  // A fresh palette per opening; ignored while any modal is open (command-palette.md). The event
  // can ask for the display commands only (*Full screen on another display*).
  const [palette, setPalette] = useState<"closed" | "all" | "displays">("closed");
  useEffect(() => {
    const openPalette = (mode: "all" | "displays") => {
      if (document.querySelector('[role="dialog"], dialog[open]')) return;
      setPalette(mode);
    };
    const stopEvent = subscribe("palette-open", events.paletteOpen.listen, (open) =>
      openPalette(open?.displaysOnly ? "displays" : "all"),
    );
    const stopRequest = onPaletteRequest(() => openPalette("all"));
    return () => {
      stopEvent();
      stopRequest();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    commands.appInfo().then(
      (appInfo) => {
        if (!cancelled) setInfo({ status: "ok", info: appInfo });
      },
      (error: unknown) => {
        console.error("app_info failed", error);
        if (!cancelled) setInfo({ status: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const fullScreenRef = useRef(false);
  fullScreenRef.current = fullScreen;
  // Set when Settings moves focus itself after leaving full screen, so the heading does not.
  const skipReturnFocus = useRef(false);
  const wasFullScreen = useRef(false);

  const navigate = useCallback((page: NavPage, target?: SettingsTarget, fromShell = false) => {
    // A page the shell delivers twice (event and take) navigates once; the rail always moves focus.
    if (fromShell && !fullScreenRef.current && page === currentRef.current && !target) return;
    const show = () => {
      currentRef.current = page;
      // Render the new page now so its heading exists, then move focus to it (NavRail README).
      flushSync(() => {
        setCurrent(page);
        if (page === "settings") setArrival((previous) => ({ seq: previous.seq + 1, target }));
      });
      // Settings moves focus itself: its h1, a section heading or a field.
      if (page !== "settings") main.current?.querySelector<HTMLElement>("h1")?.focus();
    };
    if (!fullScreenRef.current) return show();
    // Full screen has no pages: leave it first (ADR-019), then go. A leave that fails stays here.
    commands.fullScreenLeave().then(
      (result) => {
        if (result.status === "error") {
          console.error("full_screen_leave failed", result.error);
          return;
        }
        // The window-view event can beat this answer: then the window is back already and
        // the page shows and takes focus now; else the return effect does the focus.
        if (!fullScreenRef.current) return show();
        currentRef.current = page;
        setCurrent(page);
        if (page === "settings") setArrival((previous) => ({ seq: previous.seq + 1, target }));
        skipReturnFocus.current = page === "settings";
      },
      (error: unknown) => console.error("full_screen_leave failed", error),
    );
  }, []);

  useEffect(() => {
    const left = wasFullScreen.current && !fullScreen;
    wasFullScreen.current = fullScreen;
    if (!left) return;
    if (skipReturnFocus.current) {
      skipReturnFocus.current = false;
      return;
    }
    main.current?.querySelector<HTMLElement>("h1")?.focus();
  }, [fullScreen]);

  // The tray, the menu and ⌘, ask the shell to open a page; the page waits in Rust until taken.
  useEffect(() => {
    let cancelled = false;
    const take = () => {
      commands.navigateTake().then(
        (pending) => {
          if (pending && !cancelled) navigate(pending.page, pending.target ?? undefined, true);
        },
        (error: unknown) => console.error("navigate_take failed", error),
      );
    };
    const stop = subscribe("navigate", events.navigate.listen, take, { onListening: take });
    return () => {
      cancelled = true;
      stop();
    };
  }, [navigate]);

  useShortcuts(
    PAGE_ORDER.map(({ id }, index) => ({
      key: String(index + 1),
      meta: true as const,
      when: () => true,
      run: () => navigate(id),
    })),
  );

  const paletteView =
    palette === "closed" ? null : (
      <Palette
        compact={compact}
        displaysOnly={palette === "displays"}
        onClose={() => setPalette("closed")}
        onNavigate={(page) => navigate(page)}
      />
    );

  // Full screen is `main` in native full screen: no rail, no header, only the timer (ADR-019).
  if (fullScreen) {
    return (
      <div className="app">
        <PageBoundary>
          <Suspense fallback={null}>
            <FocusPage hintsLeft={hintsLeft} />
          </Suspense>
        </PageBoundary>
        {paletteView}
      </div>
    );
  }

  return (
    <div
      className={[
        "app",
        current === "settings" || current === "board" ? "app-bound" : "",
        compact ? "app-compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {compact ? null : <NavRail current={current} onNavigate={(page) => navigate(page)} />}
      <div className="app-column">
        <main ref={main} className="app-main">
          <PageBoundary>
            <Suspense fallback={null}>
              {current === "today" ? (
                <Today onNavigate={(page, target) => navigate(page, target)} />
              ) : null}
              {current === "settings" ? (
                <Settings info={info} arrival={arrival} onNavigate={(page) => navigate(page)} />
              ) : null}
              {current === "board" ? <Board onNavigate={(page) => navigate(page)} /> : null}
              {current !== "today" && current !== "settings" && current !== "board" ? (
                <Placeholder
                  title={TITLES[current]}
                  compact={compact}
                  current={current}
                  onNavigate={(page) => navigate(page)}
                />
              ) : null}
            </Suspense>
          </PageBoundary>
        </main>
        {paletteView}
      </div>
    </div>
  );
}
