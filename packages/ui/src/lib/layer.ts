// Layers that sit above the page: an open Radix Dialog's content, or a legacy native modal dialog (still in
// the top layer until the legacy modal shell is gone). Portals and Esc handling use these helpers so that a
// Tooltip or PopoverMenu opens inside the layer that holds its anchor, and Esc closes only the topmost one.
const RADIX_LAYER = '[data-slot="dialog-content"][data-state="open"]';
const NATIVE_LAYER = "dialog[open]";
// Tooltip and PopoverMenu panels live inside the layer that holds their anchor and sit above it.
const POPUP = "[data-slot='tooltip'], [data-slot='popover-menu']";

/** Every open layer, in document order (the last one is on top). */
function openLayers(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>(`${RADIX_LAYER}, ${NATIVE_LAYER}`));
}

/**
 * The element a portal should render into: the open Radix Dialog content if there is one, else the
 * nearest native `dialog[open]` (of the anchor, else the last one open), else the body.
 */
export function layerContainer(from?: Element | null): HTMLElement {
  const doc = from?.ownerDocument ?? document;
  const radix = doc.querySelectorAll<HTMLElement>(RADIX_LAYER);
  const topRadix = radix[radix.length - 1];
  if (topRadix) return topRadix;
  const native = from?.closest<HTMLElement>(NATIVE_LAYER);
  if (native) return native;
  const natives = doc.querySelectorAll<HTMLElement>(NATIVE_LAYER);
  return natives[natives.length - 1] ?? doc.body;
}

/**
 * Whether `layer` is the topmost open layer, so an Esc press belongs to it and to nothing beneath. A popup
 * (tooltip or menu panel) open inside the layer is above it, so the layer is not topmost then.
 */
export function isTopmostLayer(layer: Element): boolean {
  if (layer.querySelector(POPUP)) return false;
  const layers = openLayers(layer.ownerDocument);
  return layers[layers.length - 1] === layer;
}
