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
import { commands, events } from "./bindings";
import { infoLine } from "./format";
import type { Arrival, SettingsTarget } from "./pages/Settings";
import type { AboutInfo } from "./pages/settings/About";
import { Today } from "./pages/Today";
import { subscribe } from "./subscribe";
import { useTheme } from "./useTheme";

export type { SettingsTarget };

// Today is the first page and stays in the main chunk. The others are their own chunks; they start loading right away, and a page that has loaded renders
// without suspending (React's `use` reads a settled promise at once), so a click on the rail finds the new
// heading in place and focus can move to it straight away.
type Loaded<P> = Promise<ComponentType<P>> & { status?: string; value?: ComponentType<P> };

function load<P>(importer: () => Promise<ComponentType<P>>) {
  const promise: Loaded<P> = importer();
  promise.then((component) => {
    promise.status = "fulfilled";
    promise.value = component;
  });
  return { ready: promise, use: () => use(promise as Parameters<typeof use<ComponentType<P>>>[0]) };
}

const settingsPage = load(() => import("./pages/Settings").then((m) => m.Settings));
const placeholderPage = load(() => import("./pages/Placeholder").then((m) => m.Placeholder));

/** Settles when every lazy page has loaded; the test setup waits for it. */
export const pagesReady = Promise.all([settingsPage.ready, placeholderPage.ready]);

function Settings(props: ComponentProps<typeof import("./pages/Settings").Settings>) {
  const Page = settingsPage.use();
  return <Page {...props} />;
}
function Placeholder(props: { title: string }) {
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
        (page) => {
          if (page && !cancelled) navigate(page, undefined, true);
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

  const infoText =
    info.status === "ok"
      ? infoLine(info.info)
      : info.status === "error"
        ? "version unavailable"
        : null;

  return (
    <div className={current === "settings" ? "app app-bound" : "app"}>
      <NavRail current={current} onNavigate={(page) => navigate(page)} />
      <div className="app-column">
        <header className="app-header">
          <p className="app-brand">Orasenda</p>
          <span className="app-separator" aria-hidden="true">
            ·
          </span>
          <p className="app-info">{infoText}</p>
        </header>
        <main ref={main} className="app-main">
          <Suspense fallback={null}>
            {current === "today" ? <Today /> : null}
            {current === "settings" ? <Settings info={info} arrival={arrival} /> : null}
            {current !== "today" && current !== "settings" ? (
              <Placeholder title={TITLES[current]} />
            ) : null}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
