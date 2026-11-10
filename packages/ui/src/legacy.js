import * as R from "react";
const h = R.createElement;
function cx() { return Array.prototype.filter.call(arguments, Boolean).join(" "); }
function clamp(n) { return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; }
function count(n) { return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }
var MODE_LABEL = { focus: "Focus", break: "Break", routine: "Routine", warning: "Almost up", shallow: "Shallow", paused: "Paused", idle: "No session" };
function Shape(p) {
  var m = p.mode;
  var kids = m === "break" ? h("path", { d: "M5 0a5 5 0 0 1 0 10z" }) :
    m === "routine" || m === "personal" ? h("rect", { x: 0.5, y: 0.5, width: 9, height: 9, rx: 2.5 }) :
    m === "warning" ? h("path", { d: "M5 0.5 9.6 9.5H0.4z" }) :
    m === "paused" ? h("path", { d: "M1 1h3v8H1zM6 1h3v8H6z" }) :
    m === "shallow" || m === "overflow" || m === "idle" ? h("circle", { cx: 5, cy: 5, r: 4, fill: "none", stroke: "currentColor", strokeWidth: 1.5 }) :
    h("circle", { cx: 5, cy: 5, r: 5 });
  return h("svg", { className: "os-shape", viewBox: "0 0 10 10", "aria-hidden": "true", focusable: "false" }, kids);
}
function AlertGlyph() {
  return h("svg", { className: "os-glyph", viewBox: "0 0 14 14", "aria-hidden": "true", focusable: "false" }, h("circle", { cx: 7, cy: 7, r: 5.75 }), h("path", { d: "M7 4v3.5" }), h("circle", { className: "os-glyph-fill", cx: 7, cy: 9.9, r: 0.5 }));
}
// Button
function Button(p) {
  var rest = Object.assign({}, p);
  ["variant", "size", "className", "loading"].forEach(function (k) { delete rest[k]; });
  var unavailable = p.disabled || p.loading || p["aria-disabled"] === true || p["aria-disabled"] === "true";
  return h("button", Object.assign({ type: "button" }, rest, {
    disabled: !!(p.disabled || p.loading), "aria-busy": p.loading ? true : p["aria-busy"],
    onClick: unavailable ? function (e) { e.preventDefault(); } : p.onClick,
    className: cx("os-btn", "os-btn-" + (p.variant || "quiet"), p.size === "lg" && "os-btn-lg", p.className)
  }));
}
// end Button
// ModeChip
function ModeChip(p) {
  var mode = p.mode || "focus";
  return h("span", { className: "os-chip os-mode-" + mode }, h(Shape, { mode: mode }), p.children || MODE_LABEL[mode]);
}
// end ModeChip
// Native modal dialogs supply inert background and focus containment. Keep one open at a time.
function Modal(p) {
  var ref = R.useRef(null), titleId = R.useId(), bodyId = R.useId(), open = p.open !== false;
  R.useEffect(function () {
    var el = ref.current;
    if (!open || !el) return;
    var previous = el.ownerDocument.activeElement;
    if (!el.open) el.showModal();
    var initial = el.querySelector("[data-initial-focus]");
    if (initial) initial.focus();
    return function () { if (el.open) el.close(); if (previous && previous.isConnected && previous.focus) previous.focus(); };
  }, [open]);
  return h("dialog", { ref: ref, className: cx("os-dialog", p.scrim && "os-dialog-scrim", p.className), "aria-modal": "true", "aria-labelledby": titleId,
    "aria-describedby": p.description ? bodyId : undefined,
    onCancel: function (e) { e.preventDefault(); if (p.onSafe) p.onSafe(); } },
    h("h2", { id: titleId }, p.title),
    p.description ? h("p", { id: bodyId, className: "os-dialog-description" }, p.description) : null, p.children);
}
function Field(p) {
  var generated = R.useId(), id = p.id || generated, described = [p["aria-describedby"], p.helper ? id + "-helper" : "", p.error ? id + "-error" : ""].filter(Boolean).join(" ");
  var rest = Object.assign({}, p);
  ["multiline", "label", "helper", "error", "className", "unit"].forEach(function (k) { delete rest[k]; });
  return h("div", { className: cx("os-field", p.className) }, h("label", { htmlFor: id }, p.label),
    (function () {
      var control = h(p.multiline ? "textarea" : "input", Object.assign({}, rest, { id: id, className: "os-input", "aria-invalid": p.error ? true : p["aria-invalid"], "aria-describedby": described || undefined }));
      return p.unit && !p.multiline ? h("div", { className: "os-unit" }, control, h("span", null, p.unit)) : control;
    })(),
    p.helper ? h("p", { id: id + "-helper", className: "os-field-help" }, p.helper) : null,
    p.error ? h("p", { id: id + "-error", className: "os-field-help" }, h(AlertGlyph), p.error) : null);
}
var FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
// Key table (Kbd README, Shortcut glyphs). Canonical glyph strings only: modifiers in macOS order
// (Control, Option, Shift, Command), then exactly one key. Glyphs are written as escapes here.
var KEY_MODIFIERS = [["\u2303", "Control", "Control"], ["\u2325", "Alt", "Option"], ["\u21e7", "Shift", "Shift"], ["\u2318", "Meta", "Command"]];
var KEY_NAMES = { ".": ["Period", "Period"], ",": ["Comma", "Comma"], "\u21a9": ["Enter", "Return"], "Space": ["Space", "Space"], "Esc": ["Escape", "Escape"], "\u232b": ["Backspace", "Delete"],
  "\u2190": ["ArrowLeft", "Left Arrow"], "\u2191": ["ArrowUp", "Up Arrow"], "\u2192": ["ArrowRight", "Right Arrow"], "\u2193": ["ArrowDown", "Down Arrow"], "Tab": ["Tab", "Tab"] };
// Strict mode is a flag on the namespace, read at every call, so a host can set it before or after this script runs
// (window.Orasenda = { strictShortcuts: true } survives the Object.assign below). A plain script has no NODE_ENV.
function unknownShortcut(glyphs) {
  var ns = window.Orasenda;
  if (ns && ns.strictShortcuts === true) throw new Error("describeShortcut: unknown shortcut " + JSON.stringify(glyphs) + ". Use the glyphs in the Kbd README key table.");
  if (typeof console !== "undefined" && console.warn) console.warn("describeShortcut: unknown shortcut " + JSON.stringify(glyphs) + ", passed through as typed.");
  return { aria: glyphs, spoken: glyphs };
}
// describeShortcut
function describeShortcut(glyphs) {
  var s = typeof glyphs === "string" ? glyphs : String(glyphs), at = 0, aria = [], spoken = [];
  KEY_MODIFIERS.forEach(function (m) { if (s.charAt(at) === m[0]) { aria.push(m[1]); spoken.push(m[2]); at++; } });
  var key = s.slice(at), named = Object.prototype.hasOwnProperty.call(KEY_NAMES, key) ? KEY_NAMES[key] : null;
  if (!named && !/^[A-Z0-9]$/.test(key)) return unknownShortcut(s);
  var alone = aria.length === 0;
  aria.push(named ? named[0] : key);
  spoken.push(named ? named[1] : alone ? key + " key" : key);
  return { aria: aria.join("+"), spoken: spoken.join("-") };
}
// end describeShortcut

export {
};
