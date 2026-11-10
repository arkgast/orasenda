import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { StartButton } from "./start-button";

const noop = () => {};
const handlers = { onStart: noop, onQuickStart: noop };

export function StartButtonSpecimen(): ReactElement {
  return (
    <>
      <Frame state="start-button-default" width={480} height={120}>
        <StartButton {...handlers} finishTime="15:20" />
      </Frame>
      <Frame state="start-button-compact-399" width={399} height={80}>
        <StartButton {...handlers} compactLabel="Start" />
      </Frame>
      <Frame state="start-button-compact-400" width={400} height={80}>
        <StartButton {...handlers} compactLabel="Start" />
      </Frame>
      <Frame state="start-button-single-keys" width={480} height={80}>
        <StartButton {...handlers} singleKeys />
      </Frame>
      <Frame state="start-button-single-keys-off" width={480} height={80}>
        <StartButton {...handlers} singleKeys={false} />
      </Frame>
      <Frame state="start-button-loading" width={480} height={80}>
        <StartButton {...handlers} loading />
      </Frame>
      <Frame state="start-button-unavailable" width={480} height={140}>
        <p>Focus didn't start. Orasenda's timer isn't responding.</p>
        <StartButton {...handlers} unavailable />
      </Frame>
      <Frame state="start-button-disabled" width={480} height={80}>
        <StartButton {...handlers} disabled />
      </Frame>
    </>
  );
}
