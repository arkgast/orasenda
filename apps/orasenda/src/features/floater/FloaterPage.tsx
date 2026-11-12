import { useTheme } from "../../app/useTheme";

/**
 * The floating timer's page (`floater.html`). A stub for now: it follows the saved theme and
 * renders an empty labelled landmark. The real page is the floater task (#338).
 */
export function FloaterPage() {
  useTheme();
  return <main aria-label="Floating timer" />;
}
