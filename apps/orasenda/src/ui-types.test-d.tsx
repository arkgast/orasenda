// Type-level test, checked by the app's `tsc --noEmit` (#35): `@orasenda/ui`'s Button accepts
// native button attributes as consumed from the app, and rejects a misspelled one.
import { Button, type ButtonProps } from "@orasenda/ui";

export const valid = (
  <Button onClick={() => {}} type="button" disabled aria-label="Start" variant="primary">
    Start
  </Button>
);

// @ts-expect-error `onClik` is not a button attribute.
export const typo = <Button onClik={() => {}}>Start</Button>;

export const onClick: ButtonProps["onClick"] = (event) => event.currentTarget.blur();
