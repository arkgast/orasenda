import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame";
import { Button } from "./button";
import { InlineNotice } from "./inline-notice";
import { PageFrame } from "./page-frame";
import { ScrollRegion } from "./scroll-region";

const rows = (count: number): ReactElement[] =>
  Array.from({ length: count }, (_, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: static specimen rows
    <p key={i}>Row {i + 1}: a calm line of settings text.</p>
  ));

export function PageFrameSpecimen(): ReactElement {
  return (
    <>
      <Frame state="page-frame-list-900x600" width={900} height={600}>
        <PageFrame
          title="Settings"
          status={
            <InlineNotice variant="row" tone="neutral">
              Saved
            </InlineNotice>
          }
        >
          <ScrollRegion label="Settings">{rows(24)}</ScrollRegion>
        </PageFrame>
      </Frame>
      <Frame state="page-frame-list-1440x900" width={1440} height={900}>
        <PageFrame
          title="Board"
          primary={<Button variant="primary">Plan the day</Button>}
          status={
            <InlineNotice variant="row" tone="neutral">
              Nothing to save
            </InlineNotice>
          }
        >
          <ScrollRegion label="Board">{rows(40)}</ScrollRegion>
        </PageFrame>
      </Frame>
      <Frame state="page-frame-flow-900x600" width={900} height={600}>
        <PageFrame
          title="Weekly review"
          variant="flow"
          step="Step 2 of 4"
          footer={
            <>
              <Button variant="ghost">End</Button>
              <Button variant="ghost">Not now</Button>
              <Button variant="primary">Continue</Button>
            </>
          }
        >
          <ScrollRegion label="Review">{rows(12)}</ScrollRegion>
        </PageFrame>
      </Frame>
    </>
  );
}
