// Type-level test, checked by the app's `tsc --noEmit` (#35): `@orasenda/ui`'s Button accepts
// native button attributes as consumed from the app, and rejects a misspelled one.
import { Button, type ButtonProps } from "@orasenda/ui";
import type { CustomSpec, TimerSettings } from "./bindings";
import type { CoversEveryKey, CUSTOM_KEYS, SETTINGS_KEYS } from "./settingsQueue";

export const valid = (
  <Button onClick={() => {}} type="button" disabled aria-label="Start" variant="primary">
    Start
  </Button>
);

// @ts-expect-error `onClik` is not a button attribute.
export const typo = <Button onClik={() => {}}>Start</Button>;

export const onClick: ButtonProps["onClick"] = (event) => event.currentTarget.blur();

// #114: the settings key lists cover every generated field, and a list missing one fails to compile.
export const settingsKeysComplete: CoversEveryKey<TimerSettings, typeof SETTINGS_KEYS> = true;
export const customKeysComplete: CoversEveryKey<CustomSpec, typeof CUSTOM_KEYS> = true;

// @ts-expect-error a list without notifySessionEnd does not cover TimerSettings.
export const settingsKeyMissing: CoversEveryKey<TimerSettings, ["preset", "custom"]> = true;

// @ts-expect-error a list without breakMin does not cover CustomSpec.
export const customKeyMissing: CoversEveryKey<CustomSpec, ["focusMin"]> = true;
