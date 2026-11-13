import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { InboxRow } from "./inbox-row.tsx";

const LONG = "Remember to follow up on the thing we talked about. ".repeat(20).slice(0, 1000);

function Row(props: { text: string; kind: "internal" | "external" }): ReactElement {
  return (
    <ul className="m-0 p-0">
      <InboxRow
        text={props.text}
        kind={props.kind}
        time="09:41"
        timeLabel="Captured at 9:41 AM"
        onRemove={() => {}}
        removeName={`Remove note: ${props.text.slice(0, 40)}`}
      />
    </ul>
  );
}

export function InboxRowSpecimen(): ReactElement {
  return (
    <>
      <Frame state="inbox-row-internal" width={420} height={110}>
        <Row text="Ask Sam about the invoice" kind="internal" />
      </Frame>
      <Frame state="inbox-row-external" width={420} height={110}>
        <Row text="Call the dentist about Thursday" kind="external" />
      </Frame>
      <Frame state="inbox-row-long-360" width={360} height={900}>
        <Row text={LONG} kind="internal" />
      </Frame>
      <Frame state="inbox-row-long-900" width={900} height={600}>
        <Row text={LONG} kind="external" />
      </Frame>
    </>
  );
}
