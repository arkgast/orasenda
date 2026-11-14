import { Button, Dialog, SettingsRow } from "@orasenda/ui";
import { commands, type DataErrorKind } from "@shared/ipc/bindings";
import { type ReactNode, type Ref, useEffect, useRef, useState } from "react";
import { useDataOverview } from "../useDataOverview";
import { countsLine, errorLine, importLine, savedLine } from "./YourData.lines";

type Line = { row: "folder" | "move" | "delete"; text: string } | null;

type Props = {
  headingRef: Ref<HTMLHeadingElement>;
  /** A session is running: Delete all data says so and opens nothing. */
  running?: boolean;
};

function kindOf(failure: unknown): DataErrorKind | null {
  const kind = (failure as { kind?: unknown } | null)?.kind;
  return typeof kind === "string" ? (kind as DataErrorKind) : null;
}

const live = (text: string | undefined): ReactNode =>
  text ? <span role="status">{text}</span> : undefined;

export function YourData({ headingRef, running = false }: Props) {
  const { overview, error, refresh } = useDataOverview();
  const [line, setLine] = useState<Line>(null);
  const [working, setWorking] = useState<"export" | "import" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const blocked = error || (overview !== null && overview.store !== "ok");
  const say = (row: NonNullable<Line>["row"], text: string) => {
    if (alive.current) setLine({ row, text });
  };

  // One command at a time; the button keeps focus, so it is marked busy and never disabled.
  const run = async (
    row: NonNullable<Line>["row"],
    kind: "export" | "import" | null,
    call: () => Promise<string | null>,
  ) => {
    if (busy.current) return;
    busy.current = true;
    if (kind) setWorking(kind);
    setLine(null);
    try {
      const text = await call();
      if (text) say(row, text);
    } catch (failure) {
      console.error("data command failed", failure);
      say(row, errorLine(null));
    } finally {
      busy.current = false;
      if (alive.current) setWorking(null);
    }
  };

  const showFolder = () =>
    run("folder", null, async () => {
      const result = await commands.dataShowFolder();
      if (result.status === "ok") return null;
      console.error("data_show_folder failed", result.error);
      return "Orasenda couldn't open the folder.";
    });
  const exportData = () =>
    run("move", "export", async () => {
      const result = await commands.dataExport();
      if (result.status === "error") return errorLine(kindOf(result.error));
      return result.data.kind === "saved" ? savedLine(result.data.file) : null;
    });
  const importData = () =>
    run("move", "import", async () => {
      const result = await commands.dataImport();
      if (result.status === "error") return errorLine(kindOf(result.error));
      if (result.data.kind !== "imported") return null;
      refresh();
      return importLine(result.data.report);
    });

  const askDelete = () => {
    if (running) say("delete", errorLine("busy"));
    else {
      setLine(null);
      setConfirming(true);
    }
  };
  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const result = await commands.dataDeleteAll();
      // On success the app restarts, so the dialog stays up until then.
      if (result.status === "error") throw result.error;
    } catch (failure) {
      console.error("data_delete_all failed", failure);
      if (alive.current) {
        setConfirming(false);
        say("delete", errorLine(kindOf(failure)));
      }
    } finally {
      if (alive.current) setDeleting(false);
    }
  };

  const at = (row: NonNullable<Line>["row"]) => (line?.row === row ? line.text : undefined);
  let stored = "Reading your data…";
  if (error) stored = "Orasenda couldn't read its data folder.";
  else if (overview) stored = countsLine(overview.counts);

  return (
    <section id="settings-data" aria-labelledby="settings-data-heading">
      <h2 ref={headingRef} id="settings-data-heading" tabIndex={-1} className="settings-heading">
        Your data
      </h2>
      <SettingsRow
        id="stored"
        label="Stored"
        helper="Everything Orasenda keeps is in one folder on this Mac."
        actionLabel={error ? "Try again" : undefined}
        onAction={error ? refresh : undefined}
      >
        <p className="settings-text">{stored}</p>
      </SettingsRow>
      <SettingsRow
        id="folder"
        label="Data folder"
        helper="Backups are kept in the same folder."
        status={live(at("folder"))}
        actionLabel="Show in Finder"
        onAction={showFolder}
      >
        <p className="settings-text break-all">{overview?.folder ?? ""}</p>
      </SettingsRow>
      <SettingsRow
        id="move"
        label="Move data"
        helper="Export saves a copy you can open on another Mac. Import adds what is in a file to what you have here."
        status={live(at("move"))}
        disabledReason={
          blocked
            ? "Export and import need Orasenda's data, which it can't open right now."
            : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="quiet"
            disabled={blocked}
            aria-busy={working === "export" || undefined}
            onClick={exportData}
          >
            {working === "export" ? "Exporting…" : "Export data…"}
          </Button>
          <Button
            variant="quiet"
            disabled={blocked}
            aria-busy={working === "import" || undefined}
            onClick={importData}
          >
            {working === "import" ? "Importing…" : "Import data…"}
          </Button>
        </div>
      </SettingsRow>
      <SettingsRow
        id="start-over"
        label="Start over"
        helper="Removes your sessions, presets, notes and settings from this Mac. Backups are not touched."
        status={live(at("delete"))}
        actionLabel="Delete all data…"
        actionVariant="ghost"
        onAction={askDelete}
      >
        {null}
      </SettingsRow>
      {confirming ? (
        <Dialog
          open
          destructive
          loading={deleting}
          title="Delete all your Orasenda data?"
          description="Your sessions, presets, notes and settings on this Mac are removed and Orasenda restarts fresh. Backups are not touched. To keep a copy, choose Back up now first."
          confirmLabel="Delete all data"
          onCancel={() => setConfirming(false)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </section>
  );
}
