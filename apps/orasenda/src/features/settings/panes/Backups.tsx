import { useSurfaceTimer } from "@domain/timer/useSurfaceTimer";
import { Button, Choice, ChoiceGroup, SettingsRow } from "@orasenda/ui";
import type { BackupFrequency, BackupPolicy } from "@shared/ipc/bindings";
import { commands } from "@shared/ipc/bindings";
import { type Ref, useRef, useState } from "react";
import { BackupTable } from "../BackupTable";
import { backupFailure, formatBackupTime } from "../backupFormat";
import { NumberField } from "../sections/NumberField";
import { useDataOverview } from "../useDataOverview";

const KEEP_RANGE = { min: 1, max: 50 };
const FREQUENCIES: { value: BackupFrequency; label: string; said: string }[] = [
  { value: "monthly", label: "Every month", said: "every month" },
  { value: "quarterly", label: "Every 3 months", said: "every 3 months" },
];
const NEEDS_STORE = "Orasenda can't open its data, so backing up and these settings are off.";

/** Settings › Backups: the policy, the last backup, and the list with Restore and Delete. */
export function Backups({ headingRef }: { headingRef: Ref<HTMLHeadingElement> }) {
  const { overview, error, refresh } = useDataOverview();
  const timer = useSurfaceTimer();
  // The reply to the newest save, good only for the overview it was made against.
  const [saved, setSaved] = useState<{ base: unknown; policy: BackupPolicy } | null>(null);
  const [policyLine, setPolicyLine] = useState("");
  const [keepLine, setKeepLine] = useState("");
  const [lastLine, setLastLine] = useState("");
  const [busy, setBusy] = useState(false);
  // Saves go one at a time: the newest intended policy waits for the call in flight.
  const intent = useRef<BackupPolicy | null>(null);
  const confirmed = useRef<BackupPolicy | null>(null);
  const said = useRef<{ row: "frequency" | "keep"; text: string }>({ row: "frequency", text: "" });
  const inFlight = useRef(false);

  const heading = (
    <h2 ref={headingRef} id="settings-backups-heading" tabIndex={-1} className="settings-heading">
      Backups
    </h2>
  );
  if (!overview) {
    return (
      <section id="settings-backups" aria-labelledby="settings-backups-heading">
        {heading}
        {error ? (
          <>
            <p className="app-muted" role="status">
              Can't read your backups right now.
            </p>
            <Button variant="quiet" onClick={refresh}>
              Try again
            </Button>
          </>
        ) : null}
      </section>
    );
  }

  const locked = overview.store !== "ok";
  const policy = saved?.base === overview ? saved.policy : overview.policy;
  const newest = overview.backups.reduce((max, b) => Math.max(max, b.createdMs), 0);
  const sessionRunning = timer.view !== null && timer.view.state !== "idle";

  const drain = async () => {
    inFlight.current = true;
    while (intent.current && intent.current !== confirmed.current) {
      const next = intent.current;
      const line = said.current;
      try {
        const result = await commands.backupsSetPolicy(next);
        if (result.status === "error") throw result.error;
        confirmed.current = result.data;
        setSaved({ base: overview, policy: result.data });
        if (intent.current === next) {
          intent.current = result.data;
          (line.row === "keep" ? setKeepLine : setPolicyLine)(line.text);
        }
      } catch (failure) {
        console.error("backups_set_policy failed", failure);
        intent.current = confirmed.current;
        (line.row === "keep" ? setKeepLine : setPolicyLine)(backupFailure(failure));
        break;
      }
    }
    inFlight.current = false;
  };

  const save = (
    change: Partial<BackupPolicy>,
    line: { row: "frequency" | "keep"; text: string },
  ) => {
    setPolicyLine("");
    setKeepLine("");
    if (!inFlight.current) {
      confirmed.current = policy;
      intent.current = policy;
    }
    intent.current = { ...(intent.current as BackupPolicy), ...change };
    said.current = line;
    if (!inFlight.current) void drain();
  };

  const backUp = async () => {
    setLastLine("");
    setBusy(true);
    try {
      const result = await commands.backupsCreate();
      if (result.status === "error") setLastLine(backupFailure(result.error));
      else {
        setLastLine("Backed up.");
        refresh();
      }
    } catch (failure) {
      console.error("backups_create failed", failure);
      setLastLine(backupFailure(failure));
    }
    setBusy(false);
  };

  return (
    <section id="settings-backups" aria-labelledby="settings-backups-heading">
      {heading}
      <SettingsRow
        id="backup-frequency"
        label="Back up"
        helper="Orasenda also backs up before every import and restore."
        status={<span role="status">{policyLine}</span>}
        disabledReason={locked ? NEEDS_STORE : undefined}
      >
        <ChoiceGroup legend="Back up" legendClassName="sr-only">
          {FREQUENCIES.map((f) => (
            <Choice
              key={f.value}
              name="backup-frequency"
              value={f.value}
              checked={policy.frequency === f.value}
              disabled={locked}
              onChange={() =>
                save({ frequency: f.value }, { row: "frequency", text: `Back up: ${f.said}.` })
              }
            >
              {f.label}
            </Choice>
          ))}
        </ChoiceGroup>
      </SettingsRow>
      <SettingsRow
        id="backup-keep"
        label="Keep the newest"
        helper="The oldest go first, whatever their kind."
        status={<span role="status">{keepLine}</span>}
      >
        <NumberField
          id="backup-keep-count"
          label="Newest backups to keep"
          unit="newest backups"
          plural="backups"
          saved={policy.keep}
          range={KEEP_RANGE}
          helper={`${KEEP_RANGE.min} to ${KEEP_RANGE.max} backups.`}
          disabled={locked}
          onCommit={(keep) =>
            save({ keep }, { row: "keep", text: `Keeping the newest ${keep} backups.` })
          }
        />
      </SettingsRow>
      <SettingsRow
        id="backup-last"
        label="Last backup"
        helper="Every kind counts, automatic or not."
        status={<span role="status">{lastLine}</span>}
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="m-0">{newest > 0 ? formatBackupTime(newest) : "None yet"}</p>
          <Button variant="quiet" disabled={locked || busy} onClick={backUp}>
            Back up now
          </Button>
        </div>
      </SettingsRow>
      <BackupTable
        entries={overview.backups}
        sessionRunning={sessionRunning}
        store={overview.store}
        onStatus={setLastLine}
      />
    </section>
  );
}
