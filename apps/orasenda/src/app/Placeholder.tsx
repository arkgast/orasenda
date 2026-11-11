import { EmptyState, type NavPage } from "@orasenda/ui";
import { PagesButton } from "./PagesButton";

type Props = {
  /** The page's name, its only `h1`. */
  title: string;
  /** In a compact window the rail is gone, so the top row holds the Pages button. */
  compact: boolean;
  current: NavPage;
  onNavigate(page: NavPage): void;
};

/** A page that comes in a later phase: its title and a kind empty state. */
export function Placeholder({ title, compact, current, onNavigate }: Props) {
  return (
    <div className="placeholder">
      <div className="placeholder-top">
        {compact ? <PagesButton current={current} onNavigate={onNavigate} /> : null}
        <h1 className="app-page-title" tabIndex={-1}>
          {title}
        </h1>
      </div>
      <EmptyState title="Nothing here yet." message="This comes in a later phase." />
    </div>
  );
}
