import { useEffect, useState } from "react";
import { commands } from "./bindings";
import { formatClock, infoLine } from "./format";
import { useClock } from "./useClock";

type Props = {
  /** Locale and time zone for the clock; the system's when omitted (tests pin them). */
  locale?: string;
  timeZone?: string;
};

type InfoState = { status: "loading" } | { status: "ok"; line: string } | { status: "error" };

export function App({ locale, timeZone }: Props) {
  const [info, setInfo] = useState<InfoState>({ status: "loading" });
  const now = useClock();

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

  return (
    <main className="app">
      <header className="app-header">
        <h1 className="app-title">Orasenda</h1>
        <p className="app-info">
          {info.status === "ok" ? info.line : null}
          {info.status === "error" ? "version unavailable" : null}
        </p>
      </header>
      {now === null ? (
        <time className="app-clock" />
      ) : (
        <time className="app-clock" dateTime={new Date(now).toISOString()}>
          {formatClock(now, locale, timeZone)}
        </time>
      )}
    </main>
  );
}
