import {
  commands,
  type ImportDone,
  type ImportPreview_Serialize,
  type ImportSourceKind,
  type ImportSourceView_Serialize,
} from "@shared/ipc/bindings";
import { useCallback, useEffect, useRef, useState } from "react";
import { FAILED_LINE, READ_FAILED_LINE, SOURCES_FAILED_LINE, STALE_LINE } from "./copy";

/** The same line again keeps its object, so a re-read does not remount (and re-announce) it. */
const keep = (next: Problem) => (now: Problem | null) =>
  now && now.text === next.text && now.source === next.source && now.denied === next.denied
    ? now
    : next;

export type Step = "source" | "preview" | "empty";

/** What the sheet says under the heading, with the way on it offers. */
export type Problem = {
  text: string;
  source?: ImportSourceKind;
  kind: "read" | "write" | "stale" | "sources";
  /** The OS said no: the sheet offers System Settings. */
  denied?: boolean;
};

/**
 * The import sheet's state: sources, the one preview, its selection and the line that answers a
 * failure. Every read gets a number and only the newest answer counts, so a slow answer to an
 * earlier pick (or to a sheet that has closed) is dropped. Nothing is written until `commit`.
 */
export function useImport({
  active,
  onImported,
  onClose,
}: {
  /** A session is running or paused: the sources are re-read when this changes. */
  active: boolean;
  onImported(done: ImportDone): void;
  onClose(): void;
}) {
  const [sources, setSources] = useState<ImportSourceView_Serialize[]>([]);
  // The sheet opens once the sources are known, so the first row can take focus.
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>("source");
  const [reading, setReading] = useState<ImportSourceKind | null>(null);
  const [preview, setPreview] = useState<ImportPreview_Serialize | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());
  const [problem, setProblem] = useState<Problem | null>(null);
  const [importing, setImporting] = useState(false);
  const latest = useRef(0);
  const held = useRef<ImportPreview_Serialize | null>(null);

  useEffect(() => {
    // `active` is a dependency on purpose: the sources are asked again when it flips.
    void active;
    let current = true;
    commands.importSources().then(
      (view) => {
        if (!current) return;
        setSources(view.sources);
        setReady(true);
      },
      (error: unknown) => {
        console.error("import_sources failed", error);
        if (!current) return;
        setProblem({ text: SOURCES_FAILED_LINE, kind: "sources" });
        setReady(true);
      },
    );
    return () => {
      current = false;
    };
  }, [active]);

  const discard = useCallback(() => {
    const kept = held.current;
    held.current = null;
    if (kept) {
      commands.importDiscard(kept.id).catch((error: unknown) => {
        console.error("import_discard failed", error);
      });
    }
  }, []);

  // The sheet going away: an answer still on its way no longer counts and a held preview is let go.
  useEffect(
    () => () => {
      latest.current += 1;
      discard();
    },
    [discard],
  );

  const read = useCallback(
    async (kind: ImportSourceKind, quiet = false) => {
      discard();
      setPreview(null);
      const mine = ++latest.current;
      if (!quiet) {
        setReading(kind);
        setProblem(null);
      }
      setStep("source");
      let answer: Awaited<ReturnType<typeof commands.importPreview>>;
      try {
        answer = await commands.importPreview(kind);
      } catch (error) {
        console.error("import_preview failed", error);
        if (mine !== latest.current) return;
        setReading(null);
        setProblem(keep({ text: READ_FAILED_LINE, source: kind, kind: "read" }));
        return;
      }
      if (mine !== latest.current) {
        // An answer nobody waits for: let its preview go.
        if (answer.status === "ok" && answer.data.picked) {
          commands.importDiscard(answer.data.picked.id).catch((error: unknown) => {
            console.error("import_discard failed", error);
          });
        }
        return;
      }
      setReading(null);
      if (answer.status === "error") {
        setProblem(
          keep({
            text: answer.error.message,
            source: kind,
            kind: "read",
            denied: answer.error.kind === "denied",
          }),
        );
        return;
      }
      setProblem(null);
      if (answer.data.cancelled) return;
      const next = answer.data.picked;
      if (!next) return;
      held.current = next;
      setPreview(next);
      setChosen(new Set(next.items.filter((i) => i.selected).map((i) => i.key)));
      setStep(next.items.length === 0 ? "empty" : "preview");
    },
    [discard],
  );

  const chooseAnother = useCallback(() => {
    latest.current += 1;
    discard();
    setPreview(null);
    setProblem(null);
    setReading(null);
    setStep("source");
  }, [discard]);

  const close = useCallback(() => {
    latest.current += 1;
    discard();
    onClose();
  }, [discard, onClose]);

  const toggle = useCallback((key: number) => {
    setChosen((now) => {
      const next = new Set(now);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  const setAll = useCallback((on: boolean) => {
    setChosen(new Set(on ? (held.current?.items ?? []).map((i) => i.key) : []));
  }, []);

  const commit = useCallback(async () => {
    const shown = held.current;
    if (!shown || importing) return;
    const keys = shown.items.map((i) => i.key).filter((k) => chosen.has(k));
    if (keys.length === 0) return;
    setImporting(true);
    setProblem(null);
    try {
      const result = await commands.taskImport(shown.id, keys);
      if (result.status === "ok") {
        // The import consumed the preview: nothing left to discard.
        held.current = null;
        latest.current += 1;
        onImported(result.data);
        onClose();
        return;
      }
      if (result.error.kind === "stale") setProblem({ text: STALE_LINE, kind: "stale" });
      else setProblem({ text: result.error.message || FAILED_LINE, kind: "write" });
    } catch (error) {
      console.error("task_import failed", error);
      setProblem({ text: FAILED_LINE, kind: "write" });
    } finally {
      setImporting(false);
    }
  }, [chosen, importing, onClose, onImported]);

  const openSettings = useCallback((kind: ImportSourceKind) => {
    const failed = (error: unknown) => {
      console.error("import_open_settings failed", error);
      setProblem({ text: "System Settings didn't open. Try again.", source: kind, kind: "read" });
    };
    commands
      .importOpenSettings(kind)
      .then((result) => result.status === "error" && failed(result.error), failed);
  }, []);

  return {
    ready,
    sources,
    step,
    reading,
    preview,
    chosen,
    problem,
    importing,
    read,
    close,
    chooseAnother,
    toggle,
    setAll,
    commit,
    openSettings,
  };
}
