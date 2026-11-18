import type { ReactElement } from "react";
import { Frame } from "../../../specimens/Frame.tsx";
import { RoutineItem } from "./routine-item.tsx";

export function RoutineItemSpecimen(): ReactElement {
  return (
    <>
      <Frame state="routine-item-checkbox" width={420} height={100}>
        <RoutineItem label="Drink a glass of water" detail="Two minutes: one sip" />
      </Frame>
      <Frame state="routine-item-read-only-steps" width={420} height={260}>
        <div className="flex flex-col gap-2">
          <RoutineItem label="Open the curtains" readOnly />
          <RoutineItem
            label="Drink a glass of water"
            detail="Two minutes: one sip"
            optional
            readOnly
            done
          />
          <RoutineItem label="Walk outside" detail="Ten minutes in daylight" readOnly skipped />
        </div>
      </Frame>
    </>
  );
}
