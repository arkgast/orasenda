import { useId, useState } from "react";
import type { BlockAction, UsageSegment } from "../bindings";
import { formatClock } from "../format";
import { Button } from "./ui";
import { type RuleChange, useSpike } from "./useSpike";
import "@orasenda/ui/components.css";
import "./spike.css";

export type DevPanelProps = {
  /** Locale and time zone for usage times; the system's when omitted (tests pin them). */
  locale?: string;
  timeZone?: string;
};

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
  const { status, apps, rule, usage, errors, setRule, refreshApps } = useSpike();
  // The group whose control changed last: a failed change is noted under it.
  const [changed, setChanged] = useState<"apps" | "action">("apps");
  const headingId = useId();
  const usageId = useId();
  const actionName = useId();

  if (!status?.enabled) return null;

  const time = (epochMs: number) => formatClock(epochMs, locale, timeZone);
  const change = (group: "apps" | "action", next: RuleChange) => {
    setChanged(group);
    void setRule(next);
  };
  const toggle = (bundleId: string, checked: boolean) =>
    change("apps", (latest) => {
      const targets = latest.targets.filter((target) => target !== bundleId);
      return { ...latest, targets: checked ? [...targets, bundleId] : targets };
    });
  const notSaved = (group: "apps" | "action") =>
    errors.rule && changed === group ? (
      <p className="spike-note">That change was not saved.</p>
    ) : null;
  const rows = usageRows(usage);

  return (
    <section className="spike-panel" aria-labelledby={headingId}>
      <h2 id={headingId} className="spike-heading">
        Blocking spike
      </h2>
      {status.platformSupported ? null : (
        <p className="spike-note">This system has no blocking support yet.</p>
      )}
      {errors.ruleRead ? <p className="spike-note">Rule unavailable.</p> : null}

      <fieldset className="os-choice-group">
        <legend>Apps to intercept</legend>
        {errors.apps ? <p className="spike-note">Apps unavailable.</p> : null}
        {!errors.apps && apps.length === 0 ? <p className="spike-note">No apps to show.</p> : null}
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
      {notSaved("apps")}
      <div>
        <Button onClick={() => void refreshApps()}>Refresh apps</Button>
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
              onChange={() => change("action", (latest) => ({ ...latest, action }))}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {notSaved("action")}

      <h3 id={usageId} className="spike-subheading">
        Recent usage
      </h3>
      {errors.usage ? <p className="spike-note">Usage unavailable.</p> : null}
      {!errors.usage && rows.length === 0 ? (
        <p className="spike-note">Nothing recorded yet.</p>
      ) : null}
      {rows.length === 0 ? null : (
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
