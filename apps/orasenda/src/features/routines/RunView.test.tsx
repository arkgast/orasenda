import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import {
  argsOf,
  emitRoutinesChanged,
  routinesView,
  routineView,
  runView,
  settle,
} from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderRoutines, statusText } from "./RoutinesPage.support";
import { flush, press, runBackend, startRun, stepName } from "./RunView.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  resetSettingsQueueForTests();
  vi.restoreAllMocks();
});

const runText = () => document.querySelector("[data-slot=routine-run]")?.textContent ?? "";
const runStatus = () =>
  document.querySelector("[data-slot=routine-run] [data-slot=inline-notice]")?.textContent ?? "";

test("start_sends_run_start_and_the_run_view_replaces_the_overview", async () => {
  const { backend } = await startRun();
  expect(argsOf(backend.calls, "run_start")).toEqual([{ routineId: "routine-1" }]);
  expect(screen.queryByRole("heading", { level: 1, name: "Routines" })).toBeNull();
  expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("data-variant", "primary");
  // One primary action.
  expect(document.querySelectorAll('[data-slot="button"][data-variant="primary"]')).toHaveLength(1);
});

test("run_view_has_one_primary_per_state", async () => {
  const primaries = () =>
    document.querySelectorAll('[data-slot="button"][data-variant="primary"]').length;
  await startRun();
  expect(primaries()).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "End routine" }));
  await flush();
  expect(primaries()).toBe(1);
});

test("the_step_shows_its_detail_lines_and_the_progress_list_in_shape_and_word", async () => {
  await startRun();
  expect(runText()).toContain("2-minute version: one sip.");
  expect(runText()).toContain("After I wake up, I will drink a glass of water.");
  const list = screen.getByRole("list", { name: "Steps" });
  const items = within(list).getAllByRole("listitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "Drink a glass of water, Now",
    "Move for 5–10 minutes, Upcoming",
    "Get outdoor light, Upcoming",
  ]);
  expect(items[0]).toHaveAttribute("aria-current", "step");
  await press("s");
  const after = within(screen.getByRole("list", { name: "Steps" })).getAllByRole("listitem");
  expect(after[0]?.textContent).toBe("Drink a glass of water, Skipped");
  expect(after[1]).toHaveAttribute("aria-current", "step");
});

test("an_open_run_in_the_view_shows_the_run_view_on_arrival", async () => {
  await renderRoutines({ routines_list: () => routinesView({ run: runView() }) });
  expect(screen.getByRole("heading", { level: 1, name: "Morning Light & Movement" })).toBeTruthy();
  expect(stepName()).toHaveTextContent("Drink a glass of water");
});

test("the_wellness_note_shows_for_a_templated_routine_only", async () => {
  await startRun();
  expect(screen.getByRole("note")).toHaveTextContent(
    "Wellness suggestion, not medical advice. Inspired by Huberman Lab; some steps have limited evidence.",
  );
  cleanup();
  await renderRoutines({
    routines_list: () =>
      routinesView({
        routines: [routineView({ wellness: false, note: null })],
        run: runView({ wellness: false }),
      }),
  });
  expect(screen.queryByRole("note")).toBeNull();
});

test("the_step_change_fades_only_without_reduce_motion", async () => {
  await startRun();
  const body = document.querySelector("[data-slot=routine-step-body]");
  expect(body?.className).toContain("duration-calm");
  expect(body?.className).toContain("motion-reduce:transition-none");
});

test("a_failed_step_shows_one_plain_line_and_keeps_rusts_last_view", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const replies = runBackend();
  const { backend } = await startRun({
    ...replies,
    run_step: () => {
      throw "store";
    },
  });
  await press("Enter");
  expect(argsOf(backend.calls, "run_step")).toHaveLength(1);
  expect(runStatus()).toBe(
    "That step couldn't be saved. Your data is safe; try again in a moment.",
  );
  expect(stepName()).toHaveTextContent("Drink a glass of water");
  expect(document.querySelector("[data-slot=routine-step-progress]")).toHaveTextContent(
    "Step 1 of 3",
  );
  expect(error).toHaveBeenCalled();
});

test("a_failed_end_says_so_and_the_run_stays", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await startRun({
    ...runBackend(),
    run_end: () => {
      throw "store";
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "End routine" }));
  await flush();
  expect(runStatus()).toBe(
    "The routine couldn't end just now. Your data is safe; try again in a moment.",
  );
  expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
});

test("a_failed_start_says_so_on_the_overview", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { container } = await startRun({
    ...runBackend(),
    run_start: () => {
      throw "store";
    },
  });
  expect(screen.getByRole("heading", { level: 1, name: "Routines" })).toBeTruthy();
  expect(statusText(container)).toBe(
    "That routine couldn't start. Your data is safe; try again in a moment.",
  );
});

test("a_run_that_ends_elsewhere_returns_to_the_overview", async () => {
  await startRun();
  // The routine was removed: Rust stopped the run, and the view no longer has one.
  await emitRoutinesChanged(routinesView({ run: null }));
  await flush();
  expect(screen.getByRole("heading", { level: 1, name: "Routines" })).toBeTruthy();
});

test("a_newer_event_for_the_same_step_shows_a_renamed_step", async () => {
  await startRun();
  const base = runView();
  await emitRoutinesChanged(
    routinesView({
      run: runView({
        steps: [{ ...(base.steps[0] as (typeof base.steps)[0]), name: "Drink water" }],
        total: 1,
        line: "Step 1 of 1",
      }),
    }),
  );
  await flush();
  expect(stepName()).toHaveTextContent("Drink water");
});

test("finished_today_routines_have_no_start", async () => {
  await renderRoutines({
    routines_list: () => routinesView({ routines: [routineView({}, "finished")] }),
  });
  expect(screen.queryByRole("button", { name: "Start Morning Light & Movement" })).toBeNull();
});

test("a_refused_start_shows_the_open_run_and_its_line_is_gone_after_back", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let other: ReturnType<typeof runView> | null = null;
  const { container } = await startRun({
    routines_list: () => routinesView({ run: other }),
    run_start: () => {
      // Another run is already open (another window started it): Rust refuses this one.
      other = runView();
      throw "running";
    },
    run_end: () => {
      other = null;
      return runView({ current: null, line: "Routine ended. 0 of 2 done today." });
    },
  });
  // The read-back shows the open run.
  expect(stepName()).toHaveTextContent("Drink a glass of water");
  fireEvent.click(screen.getByRole("button", { name: "End routine" }));
  await flush();
  fireEvent.click(screen.getByRole("button", { name: "Back to routines" }));
  await flush();
  expect(screen.getByRole("heading", { level: 1, name: "Routines" })).toBeTruthy();
  expect(statusText(container)).not.toContain("couldn't start");
});

test("an_ended_run_stays_ended_when_the_read_back_fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const backend = runBackend();
  let reads = true;
  await startRun({
    ...backend,
    routines_list: (args) => {
      if (!reads) throw "store";
      return (backend.routines_list as (a: unknown) => unknown)(args);
    },
    run_end: (args) => {
      reads = false;
      return (backend.run_end as (a: unknown) => unknown)(args);
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "End routine" }));
  await flush();
  expect(screen.getByRole("button", { name: "Back to routines" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Back to routines" }));
  await flush();
  // The view still holds the stopped run, but it is not shown as open again.
  expect(screen.getByRole("heading", { level: 1, name: "Routines" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
});

test("a_failed_start_line_reads_as_a_failure", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { container } = await startRun({
    ...runBackend(),
    run_start: () => {
      throw "store";
    },
  });
  const notice = container.querySelector("[data-slot=page-frame-status] [data-slot=inline-notice]");
  expect(notice).toHaveAttribute("data-tone", "attention");
});
