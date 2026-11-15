import { events } from "@shared/ipc/bindings";
import { argsOf, deferred, RUNNING, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import {
  BUSY_REASON,
  item,
  picked,
  previewOf,
  renderImport,
  row,
  SOURCES,
  THREE,
} from "./ImportSheet.support";
import { resetImportAsk } from "./importAsk";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  resetImportAsk();
});

const pick = async (name: RegExp | string) => {
  fireEvent.click(row(name));
  await settle();
};

test("stale_answer_dropped", async () => {
  const late = deferred<unknown>();
  let calls = 0;
  const backend = await renderImport({
    import_preview: () => {
      calls += 1;
      if (calls === 1) throw { kind: "denied", message: "Orasenda can't read your reminders." };
      if (calls === 2) return late.promise;
      return picked(previewOf("todoist", [item(5, "From Todoist")]));
    },
  });
  await pick("Apple Reminders");
  // The quiet re-read on focus is still out when the user picks Todoist.
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  await pick("Todoist");
  expect(screen.getByRole("checkbox", { name: "From Todoist" })).toBeInTheDocument();
  late.resolve(picked(previewOf("reminders", THREE, { id: 9 })));
  await settle();
  expect(screen.getByRole("checkbox", { name: "From Todoist" })).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Renew passport" })).toBeNull();
  expect(argsOf(backend.calls, "import_discard")).toContainEqual({ previewId: 9 });
});

test("stale_answer_dropped_after_close", async () => {
  const slow = deferred<unknown>();
  const backend = await renderImport({ import_preview: () => slow.promise });
  fireEvent.click(row("Apple Reminders"));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await settle();
  slow.resolve(picked(previewOf("reminders", THREE)));
  await settle();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(argsOf(backend.calls, "import_discard")).toEqual([{ previewId: 7 }]);
});

test("close_discards_preview", async () => {
  const backend = await renderImport();
  await pick("Apple Reminders");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await settle();
  expect(argsOf(backend.calls, "import_discard")).toEqual([{ previewId: 7 }]);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("sources_reread_when_timer_changes", async () => {
  const backend = await renderImport();
  expect(argsOf(backend.calls, "import_sources")).toHaveLength(1);
  await act(async () => {
    await events.timerTick.emit(RUNNING);
  });
  await settle();
  expect(argsOf(backend.calls, "import_sources")).toHaveLength(2);
});

test("session_active_rows_show_reason", async () => {
  await renderImport({
    import_sources: () => ({
      sources: SOURCES.sources.map((s) =>
        s.kind === "todoist" ? s : { ...s, available: false, reason: BUSY_REASON },
      ),
    }),
  });
  expect(screen.getAllByText(BUSY_REASON)).toHaveLength(2);
  expect(row("Apple Reminders")).toHaveAttribute("aria-disabled", "true");
  expect(row("Todoist")).not.toHaveAttribute("aria-disabled");
});

test("denied_shows_open_settings", async () => {
  const backend = await renderImport({
    import_preview: () => {
      throw {
        kind: "denied",
        message: "Orasenda can't read your reminders. You can allow it in System Settings.",
      };
    },
  });
  await pick("Apple Reminders");
  expect(screen.getByText(/can't read your reminders/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open System Settings" }));
  await settle();
  expect(argsOf(backend.calls, "import_open_settings")).toEqual([{ source: "reminders" }]);
});

test("reminders_rereads_on_focus", async () => {
  let calls = 0;
  const backend = await renderImport({
    import_preview: () => {
      calls += 1;
      if (calls === 1) throw { kind: "denied", message: "Orasenda can't read your reminders." };
      return picked(previewOf("reminders", THREE));
    },
  });
  await pick("Apple Reminders");
  expect(screen.getByText("Orasenda can't read your reminders.")).toBeInTheDocument();
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  await settle();
  expect(argsOf(backend.calls, "import_preview")).toEqual([
    { source: "reminders" },
    { source: "reminders" },
  ]);
  expect(screen.getByRole("checkbox", { name: "Renew passport" })).toBeInTheDocument();
});

test("things_denied_try_again", async () => {
  let calls = 0;
  const backend = await renderImport({
    import_preview: () => {
      calls += 1;
      if (calls === 1)
        throw { kind: "denied", message: "Orasenda can't ask Things for your to-dos." };
      return picked(previewOf("things", THREE));
    },
  });
  await pick("Things");
  // Focus alone does not ask Things again.
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  expect(argsOf(backend.calls, "import_preview")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await settle();
  expect(argsOf(backend.calls, "import_preview")).toEqual([
    { source: "things" },
    { source: "things" },
  ]);
});

test("every_error_kind_shows_its_line", async () => {
  await renderImport({
    import_preview: () => {
      throw { kind: "notAnExport", message: "That file doesn't look like a Todoist export." };
    },
  });
  await pick("Todoist");
  expect(screen.getByText("That file doesn't look like a Todoist export.")).toBeInTheDocument();
  expect(row("Todoist")).toBeInTheDocument();
});

test("empty_source_choose_another", async () => {
  const backend = await renderImport({ import_preview: () => picked(previewOf("reminders", [])) });
  await pick("Apple Reminders");
  expect(screen.getByText("No open tasks in Reminders.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Choose another source" }));
  await settle();
  expect(row("Todoist")).toBeInTheDocument();
  expect(argsOf(backend.calls, "import_discard")).toEqual([{ previewId: 7 }]);
});

test("sources_failure_has_no_choose_another", async () => {
  await renderImport({
    import_sources: () => {
      throw { kind: "store", message: "x" };
    },
  });
  expect(screen.getByText(/couldn't list the places/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Choose another source" })).toBeNull();
});

test("empty_step_focuses_choose_another", async () => {
  await renderImport({ import_preview: () => picked(previewOf("reminders", [])) });
  await pick("Apple Reminders");
  expect(screen.getByRole("button", { name: "Choose another source" })).toHaveFocus();
});

test("choose_another_focuses_first_source", async () => {
  await renderImport({ import_preview: () => picked(previewOf("reminders", [])) });
  await pick("Apple Reminders");
  fireEvent.click(screen.getByRole("button", { name: "Choose another source" }));
  await settle();
  expect(row("Apple Reminders")).toHaveFocus();
});
