import { type NavPage, NavRail } from "@orasenda/ui";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { commands } from "./bindings";
import { infoLine } from "./format";
import { Placeholder } from "./pages/Placeholder";
import { Today } from "./pages/Today";

type InfoState = { status: "loading" } | { status: "ok"; line: string } | { status: "error" };

const TITLES: Readonly<Record<NavPage, string>> = {
  today: "Today",
  board: "Board",
  calendar: "Calendar",
  routines: "Routines",
  review: "Review",
  settings: "Settings",
};

export function App() {
  const [info, setInfo] = useState<InfoState>({ status: "loading" });
  const [current, setCurrent] = useState<NavPage>("today");
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    commands.appInfo().then(
      (appInfo) => {
        if (!cancelled) setInfo({ status: "ok", line: infoLine(appInfo) });
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

  const navigate = (page: NavPage) => {
    // Render the new page now so its heading exists, then move focus to it (NavRail README).
    flushSync(() => setCurrent(page));
    main.current?.querySelector<HTMLElement>("h1")?.focus();
  };

  return (
    <div className="app">
      <NavRail current={current} onNavigate={navigate} />
      <div className="app-column">
        <header className="app-header">
          <p className="app-brand">Orasenda</p>
          <span className="app-separator" aria-hidden="true">
            ·
          </span>
          <p className="app-info">
            {info.status === "ok" ? info.line : null}
            {info.status === "error" ? "version unavailable" : null}
          </p>
        </header>
        <main ref={main} className="app-main">
          {current === "today" ? <Today /> : <Placeholder title={TITLES[current]} />}
        </main>
      </div>
    </div>
  );
}
