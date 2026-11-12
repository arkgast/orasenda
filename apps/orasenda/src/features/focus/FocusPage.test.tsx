import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { mockBackend, settle } from "../../test/fixtures";
import { FocusPage } from "./FocusPage";

afterEach(async () => {
  cleanup();
  await settle();
  clearMocks();
  delete document.documentElement.dataset.theme;
});

test("focus_stub_renders_a_labelled_main_and_applies_the_theme", async () => {
  mockBackend({ settings_get: () => ({ theme: "dark" }) });
  render(<FocusPage />);
  await settle();
  expect(screen.getByRole("main", { name: "Focus session" })).toBeEmptyDOMElement();
  expect(document.documentElement.dataset.theme).toBe("dark");
});
