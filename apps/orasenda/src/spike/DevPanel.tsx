import { Button, type ButtonProps } from "@orasenda/ui";
import { type ButtonHTMLAttributes, type ReactElement, useId } from "react";
import type { BlockAction, UsageSegment } from "../bindings";
import { formatClock } from "../format";
import { useSpike } from "./useSpike";
import "@orasenda/ui/components.css";
import "./spike.css";

export type DevPanelProps = {
  /** Locale and time zone for usage times; the system's when omitted (tests pin them). */
  locale?: string;
  timeZone?: string;
};

// design/system/components/index.d.ts imports `react` from a folder where it does not resolve,
// so `ButtonProps` loses the native button attributes; restore them for this call site.
const NativeButton = Button as (
  props: ButtonProps & ButtonHTMLAttributes<HTMLButtonElement>,
) => ReactElement;

const ACTIONS: ReadonlyArray<{ action: BlockAction; label: string }> = [
  { action: "hide", label: "Hide the app" },
  { action: "close", label: "Quit the app" },
];

type UsageRow = {
  key: string;
  idle: boolean;
  name: string;
  startMs: number;
  endMs: number | null;
};

/**
 * Usage segments (newest first) as rows, with an `idle` row wherever time passed between one
 * segment's end and the next one's start, and after the newest segment when it has ended.
 */
function usageRows(usage: UsageSegment[]): UsageRow[] {
  const rows: UsageRow[] = [];
  const newest = usage[0];
  if (newest?.endMs != null) {
    rows.push({
      key: `idle-${newest.endMs}`,
      idle: true,
      name: "idle",
      startMs: newest.endMs,
      endMs: null,
    });
  }
  usage.forEach((segment, index) => {
    rows.push({
      key: `${segment.startMs}-${index}`,
      idle: false,
      name: segment.name,
      startMs: segment.startMs,
      endMs: segment.endMs ?? null,
    });
    const older = usage[index + 1];
    if (older?.endMs != null && older.endMs < segment.startMs) {
      rows.push({
        key: `idle-${older.endMs}`,
        idle: true,
        name: "idle",
        startMs: older.endMs,
        endMs: segment.startMs,
      });
    }
  });
  return rows;
}

/**
 * The spike's dev panel: which apps to intercept, what *Back to focus* does to them, and recent
 * usage. Renders nothing unless `spike_status` reports the spike enabled.
 */
export function DevPanel({ locale, timeZone }: DevPanelProps) {
  const { status, apps, rule, usage, setRule, refreshApps } = useSpike();
  const headingId = useId();
  const usageId = useId();
  const actionName = useId();

  if (!status?.enabled) return null;

  const time = (epochMs: number) => formatClock(epochMs, locale, timeZone);
  const toggle = (bundleId: string, checked: boolean) => {
    const targets = rule.targets.filter((target) => target !== bundleId);
    void setRule({ ...rule, targets: checked ? [...targets, bundleId] : targets });
  };
  const rows = usageRows(usage);

  return (
    <section className="spike-panel" aria-labelledby={headingId}>
      <h2 id={headingId} className="spike-heading">
        Blocking spike
      </h2>
      {status.platformSupported ? null : (
        <p className="spike-note">This system has no blocking support yet.</p>
      )}

      <fieldset className="os-choice-group">
        <legend>Apps to intercept</legend>
        {apps.length === 0 ? <p className="spike-note">No apps to show.</p> : null}
        {apps.map((app) => (
          <label key={app.pid} className="os-choice">
            <input
              type="checkbox"
              checked={app.bundleId != null && rule.targets.includes(app.bundleId)}
              disabled={app.bundleId == null}
              onChange={(event) => {
                if (app.bundleId != null) toggle(app.bundleId, event.target.checked);
              }}
            />
            {app.name}
          </label>
        ))}
      </fieldset>
      <div>
        <NativeButton onClick={() => void refreshApps()}>Refresh apps</NativeButton>
      </div>

      <fieldset className="os-choice-group">
        <legend>When I go back to focus</legend>
        {ACTIONS.map(({ action, label }) => (
          <label key={action} className="os-choice">
            <input
              type="radio"
              name={actionName}
              value={action}
              checked={rule.action === action}
              onChange={() => void setRule({ ...rule, action })}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <h3 id={usageId} className="spike-subheading">
        Recent usage
      </h3>
      {rows.length === 0 ? (
        <p className="spike-note">Nothing recorded yet.</p>
      ) : (
        <ul className="spike-usage" aria-labelledby={usageId}>
          {rows.map((row) => (
            <li key={row.key} className={row.idle ? "spike-usage-idle" : undefined}>
              {`${row.name} · ${time(row.startMs)}–${row.endMs === null ? "now" : time(row.endMs)}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
