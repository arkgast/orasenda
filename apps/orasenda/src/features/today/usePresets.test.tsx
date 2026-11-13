import { deferred, emitPresetsChanged, mockBackend, PRESETS, settle } from "@shared/test/fixtures";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { presetName, resetPresetsForTests, usePresets } from "./presets";

beforeEach(() => resetPresetsForTests());
afterEach(async () => {
  cleanup();
  await settle();
  resetPresetsForTests();
  clearMocks();
});

test("presets_changed_replaces_the_list_for_a_mounted_hook", async () => {
  const backend = mockBackend();
  render(<Probe />);
  await settle();
  expect(screen.getByTestId("names")).toHaveTextContent("Gentle Start, Steady Focus, Deep Work");
  expect(backend.live("presets-changed")).toBe(1);

  await emitPresetsChanged(PRESETS.slice(1));
  expect(screen.getByTestId("names")).toHaveTextContent("Steady Focus, Deep Work");
  expect(backend.calls.filter((call) => call.cmd === "presets_list")).toHaveLength(1);

  // A later mount starts from the changed list, with no second read.
  cleanup();
  render(<Probe />);
  expect(screen.getByTestId("names")).toHaveTextContent("Steady Focus, Deep Work");
});

test("a_presets_list_reply_that_arrives_after_presets_changed_does_not_replace_it", async () => {
  const late = deferred<typeof PRESETS>();
  mockBackend({ presets_list: () => late.promise as never });
  render(<Probe />);
  await settle();
  await emitPresetsChanged(PRESETS.slice(1));
  expect(screen.getByTestId("names")).toHaveTextContent("Steady Focus, Deep Work");

  late.resolve(PRESETS);
  await settle();
  expect(screen.getByTestId("names")).toHaveTextContent("Steady Focus, Deep Work");
});

function Probe() {
  const presets = usePresets();
  return <p data-testid="names">{presets.map(presetName).join(", ")}</p>;
}
