import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { Button } from "./button";

export function ButtonSpecimen(): ReactElement {
  return (
    <>
      <Frame state="button-inline" width={320} height={96}>
        <Button variant="inline">Open Board</Button>
      </Frame>
      <Frame state="button-row" width={320} height={96}>
        <Button size="row">Later</Button>
      </Frame>
    </>
  );
}
