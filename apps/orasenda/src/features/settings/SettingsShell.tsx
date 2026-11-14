import { PagesButton } from "@domain/navigation/PagesButton";
import { InlineNotice, type NavPage, PageFrame, ScrollRegion, SettingsNav } from "@orasenda/ui";
import type { ReactNode, Ref } from "react";
import { PANE_ITEMS, PANES, type PaneId } from "./panes";
import type { Notice } from "./settingsNotice";

type Props = {
  rootRef: Ref<HTMLDivElement>;
  compact: boolean;
  pane: PaneId;
  notice: Notice;
  onSelect(id: PaneId, via: "pointer" | "keyboard"): void;
  onNavigate(page: NavPage): void;
  children: ReactNode;
};

/**
 * Master-detail: the pane list stays put (a side list, or a tab strip above at compact width) and
 * the open pane scrolls in its own region. The title and the save line stay put too.
 */
export function SettingsShell({
  rootRef,
  compact,
  pane,
  notice,
  onSelect,
  onNavigate,
  children,
}: Props) {
  const name = PANES.find(({ id }) => id === pane)?.name ?? "Settings";
  const nav = (
    <SettingsNav
      items={PANE_ITEMS}
      current={pane}
      orientation={compact ? "horizontal" : "vertical"}
      onSelect={(id, via) => onSelect(id as PaneId, via)}
    />
  );
  return (
    <div ref={rootRef} className="settings-page">
      <PageFrame
        title="Settings"
        compactPicker={
          compact ? (
            <>
              <PagesButton current="settings" onNavigate={onNavigate} />
              {/* The tab strip shares the title row: below it, a 360 x 240 window keeps 35px for the pane. */}
              <div className="-my-1 min-w-0 flex-1">{nav}</div>
            </>
          ) : undefined
        }
        status={
          <InlineNotice
            variant="row"
            tone={notice.tone}
            actionLabel={notice.action?.label}
            actionName={notice.action?.name}
            onAction={notice.action?.run}
          >
            {notice.text}
          </InlineNotice>
        }
      >
        <div className={compact ? "settings-body settings-body-compact" : "settings-body"}>
          {compact ? null : nav}
          <ScrollRegion label={`${name} settings`}>
            <div className="settings-content">{children}</div>
          </ScrollRegion>
        </div>
      </PageFrame>
    </div>
  );
}
