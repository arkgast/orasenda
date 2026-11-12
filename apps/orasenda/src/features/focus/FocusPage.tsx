import { useTheme } from "../../app/useTheme";

/**
 * The full-screen Focus window's page (`focus.html?display=<id>&insets=t,r,b,l`). A stub for
 * now: it follows the saved theme and renders an empty labelled landmark. The real page is
 * the Focus window task (#337).
 */
export function FocusPage() {
  useTheme();
  return <main aria-label="Focus session" />;
}
