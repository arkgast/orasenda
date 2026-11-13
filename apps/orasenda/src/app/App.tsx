import { useShortcuts } from "@domain/keyboard/useShortcuts";
import { PAGE_ORDER } from "@domain/navigation/PagesButton";
import { onPaletteRequest } from "@domain/navigation/paletteRequest";
import type { Arrival, SettingsTarget } from "@features/settings/Settings";
import type { AboutInfo } from "@features/settings/sections/About";
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

/** Settles when every page has loaded or failed; the test setup waits for it. */
export const pagesReady = Promise.allSettled([
  todayPage.ready,
  settingsPage.ready,
  boardPage.ready,
  placeholderPage.ready,
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

  // A fresh palette per opening; ignored while any modal is open (command-palette.md).
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const openPalette = () => {
      if (document.querySelector('[role="dialog"], dialog[open]')) return;
      setPaletteOpen(true);
    };
    const stopEvent = subscribe("palette-open", events.paletteOpen.listen, openPalette);
    const stopRequest = onPaletteRequest(openPalette);
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

  const navigate = useCallback((page: NavPage, target?: SettingsTarget, fromShell = false) => {
    // A page the shell delivers twice (event and take) navigates once; the rail always moves focus.
    if (fromShell && page === currentRef.current && !target) return;
    currentRef.current = page;
    // Render the new page now so its heading exists, then move focus to it (NavRail README).
    flushSync(() => {
      setCurrent(page);
      if (page === "settings") setArrival((previous) => ({ seq: previous.seq + 1, target }));
    });
    // Settings moves focus itself: its h1, a section heading or a field.
    if (page !== "settings") main.current?.querySelector<HTMLElement>("h1")?.focus();
  }, []);

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
        {paletteOpen ? (
          <Palette
            compact={compact}
            onClose={() => setPaletteOpen(false)}
            onNavigate={(page) => navigate(page)}
          />
        ) : null}
      </div>
    </div>
  );
}
