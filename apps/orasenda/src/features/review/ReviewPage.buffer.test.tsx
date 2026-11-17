import { resetSettingsQueueForTests } from "@shared/ipc/settingsQueue";
import { argsOf, settle, statsView } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { renderReview, section } from "./ReviewPage.support";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  resetSettingsQueueForTests();
});

const suggestion = statsView({
  buffer: {
    percent: 40,
    line: "Your finished tasks took more sessions than planned.",
    action: "Use 40%",
  },
});

test("no_buffer_notice_without_a_suggestion", async () => {
  await renderReview();
  expect(screen.queryByRole("button", { name: "Use 40%" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Not now" })).toBeNull();
});

test("neither_button_runs_by_itself", async () => {
  const { backend } = await renderReview({ review_stats: () => suggestion });
  const stats = section("Stats");
  expect(stats).toHaveTextContent("Your finished tasks took more sessions than planned.");
  expect(within(stats).getByRole("button", { name: "Use 40%" })).toHaveAttribute(
    "data-variant",
    "quiet",
  );
  expect(within(stats).getByRole("button", { name: "Not now" })).toHaveAttribute(
    "data-variant",
    "quiet",
  );
  expect(argsOf(backend.calls, "settings_set")).toEqual([]);
  expect(argsOf(backend.calls, "buffer_suggestion_dismiss")).toEqual([]);
});

test("use_buffer_sets_setting", async () => {
  let shown = suggestion;
  const { backend } = await renderReview({ review_stats: () => shown });
  shown = statsView();
  fireEvent.click(within(section("Stats")).getByRole("button", { name: "Use 40%" }));
  await waitFor(() => expect(argsOf(backend.calls, "settings_set")).toHaveLength(1));
  const sent = argsOf(backend.calls, "settings_set")[0] as {
    settings: { boardEstimateBuffer: number };
  };
  expect(sent.settings.boardEstimateBuffer).toBe(40);
  await settle();
  // The stats are read again, and the notice goes once the buffer matches.
  await waitFor(() => expect(screen.queryByRole("button", { name: "Use 40%" })).toBeNull());
  expect(argsOf(backend.calls, "buffer_suggestion_dismiss")).toEqual([]);
});

test("not_now_dismisses", async () => {
  let shown = suggestion;
  const { backend } = await renderReview({
    review_stats: () => shown,
    buffer_suggestion_dismiss: () => {
      shown = statsView();
      return null;
    },
  });
  fireEvent.click(within(section("Stats")).getByRole("button", { name: "Not now" }));
  await waitFor(() => expect(argsOf(backend.calls, "buffer_suggestion_dismiss")).toHaveLength(1));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Not now" })).toBeNull());
  expect(argsOf(backend.calls, "settings_set")).toEqual([]);
});

test("a_failed_dismiss_says_so", async () => {
  await renderReview({
    review_stats: () => suggestion,
    buffer_suggestion_dismiss: () => Promise.reject("store"),
  });
  fireEvent.click(within(section("Stats")).getByRole("button", { name: "Not now" }));
  await waitFor(() =>
    expect(section("Stats")).toHaveTextContent("Orasenda couldn't save that right now."),
  );
  expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
});
