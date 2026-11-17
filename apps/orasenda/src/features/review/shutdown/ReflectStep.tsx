import { InlineNotice, ScrollRegion, TextArea } from "@orasenda/ui";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import type { Draft } from "./useShutdown";

type Props = {
  draft: Draft;
  /** A failed save, in a plain line; the words stay for another try. */
  line: string | null;
  disabled: boolean;
  onChange: Dispatch<SetStateAction<Draft>>;
};

const FIELDS: ReadonlyArray<{ key: keyof Draft; label: string }> = [
  { key: "wentWell", label: "What went well?" },
  { key: "toImprove", label: "What would you like to improve?" },
  { key: "outsideControl", label: "What was outside your control?" },
];

/** Step 3: three optional prompts. Nothing is saved until Continue (or Not now, which saves none of the typing). */
export function ReflectStep({ draft, line, disabled, onChange }: Props): ReactElement {
  return (
    <ScrollRegion label="Reflect">
      <div className="app-shutdown-body">
        <p className="app-review-line">All three are optional.</p>
        {FIELDS.map(({ key, label }) => (
          <TextArea
            key={key}
            label={label}
            rows={3}
            value={draft[key]}
            disabled={disabled}
            onChange={(event) => onChange((now) => ({ ...now, [key]: event.target.value }))}
          />
        ))}
        {line ? <InlineNotice>{line}</InlineNotice> : null}
      </div>
    </ScrollRegion>
  );
}
