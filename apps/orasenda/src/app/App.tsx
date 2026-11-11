import { type NavPage, NavRail } from "@orasenda/ui";
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
import type { Arrival, SettingsTarget } from "../features/settings/Settings";
import type { AboutInfo } from "../features/settings/sections/About";
import { commands, events } from "../ipc/bindings";
import { subscribe } from "../ipc/subscribe";
import { PageBoundary } from "./PageBoundary";
import { PAGE_ORDER } from "./PagesButton";
import { useShortcuts } from "./useShortcuts";
import { useTheme } from "./useTheme";
import { useWindowLayout } from "./useWindowLayout";

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

const todayPage = load(() => import("../features/today/Today").then((m) => m.Today));
const settingsPage = load(() => import("../features/settings/Settings").then((m) => m.Settings));
const placeholderPage = load(() => import("./Placeholder").then((m) => m.Placeholder));

/** Settles when every page has loaded or failed; the test setup waits for it. */
export const pagesReady = Promise.allSettled([
  todayPage.ready,
  settingsPage.ready,
  placeholderPage.ready,
]);

function Today() {
  const Page = todayPage.use();
  return <Page />;
}
function Settings(props: ComponentProps<typeof import("../features/settings/Settings").Settings>) {
  const Page = settingsPage.use();
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
      className={["app", current === "settings" ? "app-bound" : "", compact ? "app-compact" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {compact ? null : <NavRail current={current} onNavigate={(page) => navigate(page)} />}
      <div className="app-column">
        <main ref={main} className="app-main">
          <PageBoundary>
            <Suspense fallback={null}>
              {current === "today" ? <Today /> : null}
              {current === "settings" ? <Settings info={info} arrival={arrival} /> : null}
              {current !== "today" && current !== "settings" ? (
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
      </div>
    </div>
  );
}
