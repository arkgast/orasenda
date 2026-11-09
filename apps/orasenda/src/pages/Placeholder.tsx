import { EmptyState } from "@orasenda/ui";

type Props = {
  /** The page's name, its only `h1`. */
  title: string;
};

/** A page that comes in a later phase: its title and a kind empty state. */
export function Placeholder({ title }: Props) {
  return (
    <div className="placeholder">
      <h1 className="app-page-title" tabIndex={-1}>
        {title}
      </h1>
      <EmptyState title="Nothing here yet." message="This comes in a later phase." />
    </div>
  );
}
