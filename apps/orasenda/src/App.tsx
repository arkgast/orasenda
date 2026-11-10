import { type NavPage, NavRail } from "@orasenda/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { commands, events } from "./bindings";
import { infoLine } from "./format";
import { Placeholder } from "./pages/Placeholder";
import { type Arrival, Settings, type SettingsTarget } from "./pages/Settings";
import type { AboutInfo } from "./pages/settings/About";
import { Today } from "./pages/Today";
import { subscribe } from "./subscribe";
import { useTheme } from "./useTheme";

export type { SettingsTarget };

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
          {current === "today" ? <Today /> : null}
          {current === "settings" ? <Settings info={info} arrival={arrival} /> : null}
          {current !== "today" && current !== "settings" ? (
            <Placeholder title={TITLES[current]} />
          ) : null}
        </main>
      </div>
    </div>
  );
}
