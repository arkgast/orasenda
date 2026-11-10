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
function timerLabel(p, mode) {
  return mode === "idle" ? "No session" : MODE_LABEL[mode] + ", " + (p.remainingLabel || p.remaining || "25:00") + " remaining" + (p.task ? ", " + p.task : "") + (p.clock ? ", Wall clock, " + p.clock : "");
}
// size="fluid": the ring is drawn on a 400-unit grid and sized by its box (bundle.css, .os-timer-box), between
// timer-min-size and timer-full-size; stroke is then in those units, so it scales with the diameter.
// A numeric size renders exactly as before.
// TimerRing
function TimerRing(p) {
  var fluid = p.size === "fluid";
  var size = fluid ? 400 : Math.max(160, p.size || 280), stroke = Math.max(2, Math.min(size / 4, p.stroke || Math.round(size / 40)));
  var r = (size - stroke) / 2, c = 2 * Math.PI * r, progress = clamp(p.progress), mode = p.mode || "focus";
  var ring = h("div", { className: cx("os-timer", "os-timer-" + mode, fluid ? "os-timer-fluid" : size >= 480 && "os-timer-full"), style: fluid ? undefined : { width: size }, role: "timer", "aria-live": "off", "aria-label": timerLabel(p, mode) },
    h("svg", { className: "os-timer-ring", viewBox: "0 0 " + size + " " + size, "aria-hidden": "true" },
      h("circle", { className: "track", cx: size / 2, cy: size / 2, r: r, strokeWidth: Math.max(2, stroke / 3) }),
      mode !== "idle" ? h("circle", { className: "prog", cx: size / 2, cy: size / 2, r: r, strokeWidth: stroke, strokeDasharray: c, strokeDashoffset: c * progress }) : null),
    h("div", { className: "os-timer-center", "aria-hidden": "true" },
      h(ModeChip, { mode: mode }),
      mode !== "idle" ? h("div", { className: "os-timer-digits" }, p.remaining || "25:00") : null,
      p.task ? h("div", { className: "os-timer-task" }, p.task) : null,
      p.clock ? h("div", { className: "os-timer-clock" }, "Clock · " + p.clock) : null),
    p.clock ? h("span", { className: "os-sr-only" }, "Wall clock, " + p.clock) : null);
  return fluid ? h("div", { className: "os-timer-box" }, ring) : ring;
}
// end TimerRing
// TimerStrip: the time when the window is a strip (TimerStrip README). Its own ModeChip is the state word, as in the
// ring; the fill shows time left; warning adds the triangle at the fill's end. No live region: role="timer", aria-live off.
function stripLabel(p, mode) {
  var parts = mode === "idle" ? ["No session", p.idleLength] : [MODE_LABEL[mode] + ", " + (p.remainingLabel || p.remaining || "25:00") + " remaining"];
  if (p.task) parts.push(p.task);
  return parts.filter(Boolean).join(", ");
}
// TimerStrip
function TimerStrip(p) {
  var mode = p.mode || "focus", left = (1 - clamp(p.progress)) * 100 + "%";
  return h("div", { className: cx("os-strip", "os-strip-" + mode, p.stacked && "os-strip-stacked"), role: "timer", "aria-live": "off", "aria-label": stripLabel(p, mode) },
    h("div", { className: "os-strip-head", "aria-hidden": "true" },
      h(ModeChip, { mode: mode }),
      mode === "idle" ? (p.idleLength ? h("span", { className: "os-strip-length" }, p.idleLength) : null) : h("span", { className: "os-strip-digits" }, p.remaining || "25:00")),
    mode !== "idle" ? h("div", { className: "os-strip-bar", "aria-hidden": "true" },
      h("span", { className: "os-strip-fill", style: { width: left } }),
      mode === "warning" ? h("svg", { className: "os-strip-tri", viewBox: "0 0 10 10", "aria-hidden": "true", focusable: "false", style: { insetInlineStart: left } }, h("path", { d: "M5 0.5 9.6 9.5H0.4z" })) : null) : null,
    p.task ? h("div", { className: "os-strip-task", "aria-hidden": "true" }, p.task) : null);
}
// end TimerStrip
// timerLayout (TimerStrip README, Choosing the layout). Pure; hosts call it on resize only, never on a tick.
// The constants are the px values of these tokens in tokens.json (a plain script cannot read the file).
var LAYOUT_TOKENS = { "layout-ring-min-height": 360, "layout-compact-width": 640, "layout-strip-height": 420 };
// timerLayout
function timerLayout(box) {
  var width = box.contentWidth, height = box.contentHeight;
  if (height < LAYOUT_TOKENS["layout-ring-min-height"]) return box.windowWidth >= LAYOUT_TOKENS["layout-compact-width"] ? "strip" : "stackedStrip";
  if (width > 2 * height && height < LAYOUT_TOKENS["layout-strip-height"]) return "strip";
  return "ring";
}
// end timerLayout
timerLayout.tokens = Object.freeze(Object.assign({}, LAYOUT_TOKENS));
// MenuBarTimer
function MenuBarTimer(p) {
  var mode = p.mode || "focus", c = 2 * Math.PI * 5;
  return h("span", { className: cx("os-menubar", "os-menubar-" + mode, p.compact === false && "os-menubar-floating"), role: "timer", "aria-live": "off", "aria-label": timerLabel(p, mode) },
    mode === "focus" ? h("svg", { className: "os-menu-ring", viewBox: "0 0 14 14", "aria-hidden": "true" },
      h("circle", { className: "ring-track", cx: 7, cy: 7, r: 5 }),
      h("circle", { className: "ring-prog", cx: 7, cy: 7, r: 5, strokeDasharray: c, strokeDashoffset: c * clamp(p.progress) })) : h(Shape, { mode: mode }),
    mode !== "idle" ? h("span", { "aria-hidden": "true" }, p.remaining || "25:00") : null,
    p.compact === false && p.task ? h("span", { className: "os-menubar-task", "aria-hidden": "true" }, p.task) : null);
}
// end MenuBarTimer
// TaskCard
function TaskCard(p) {
  var est = count(p.estimate), done = count(p.done), dots = [], hasEstimate = p.estimate != null;
  for (var i = 0; i < Math.min(12, Math.max(est, done)); i++) dots.push(h("span", { key: i, className: cx("os-pomo", i < done && "os-pomo-done", hasEstimate && i >= est && i < done && "os-pomo-over") }));
  var meta = (hasEstimate ? "Est " + est : "No estimate") + " · Done " + done + (p.tracked ? " · " + p.tracked : "");
  return h(p.onOpen ? "button" : "article", { type: p.onOpen ? "button" : undefined, onClick: p.onOpen, disabled: p.onOpen ? p.disabled : undefined,
    className: cx("os-card", p.active && "os-card-active", p.selected && "os-card-selected"),
    "aria-label": p.onOpen ? p.title + ", " + (p.type === "shallow" ? "Shallow" : "Deep") + (p.frog ? ", Frog" : "") + ", " + done + " sessions done, " + (hasEstimate ? est + " estimated" : "no estimate") + (p.tracked ? ", " + p.tracked : "") + (p.project ? ", " + p.project : "") + (p.active ? ", In progress" : "") + (p.selected ? ", Selected" : "") : undefined },
    h("span", { className: "os-card-top" }, h(ModeChip, { mode: p.type === "shallow" ? "shallow" : "focus" }, p.type === "shallow" ? "Shallow" : "Deep"),
      p.frog ? h("span", { className: "os-frog" }, "Frog") : null),
    h("span", { className: "os-card-title" }, p.title),
    p.active || p.selected ? h("span", { className: "os-card-state" }, [p.active ? "In progress" : "", p.selected ? "Selected" : ""].filter(Boolean).join(" · ")) : null,
    h("span", { className: "os-pomos", "aria-hidden": "true" }, dots),
    h("span", { className: "os-card-meta os-num" }, meta),
    p.project ? h("span", { className: "os-card-meta" }, p.project) : null);
}
// end TaskCard
var BLOCK_LABEL = { deep: "Deep", shallow: "Shallow", break: "Break", routine: "Routine", personal: "Personal", overflow: "Overflow" };
var BLOCK_SHAPE = { deep: "focus", shallow: "shallow", break: "break", routine: "routine", personal: "routine", overflow: "overflow" };
// TimeBlock
function TimeBlock(p) {
  var type = p.type || "deep", title = p.title || BLOCK_LABEL[type];
  var numericHeight = typeof p.height === "number" ? p.height : /^\d+(\.\d+)?px$/.test(p.height || "") ? parseFloat(p.height) : null;
  var compact = p.compact == null ? numericHeight != null && numericHeight < 60 : p.compact;
  return h(p.onSelect ? "button" : "div", { type: p.onSelect ? "button" : undefined, onClick: p.onSelect, disabled: p.onSelect ? p.disabled : undefined,
    className: cx("os-block", "os-block-" + type, p.now && "os-block-now", compact && "os-block-compact", p.selected && "os-block-selected"),
    style: p.height != null ? { height: numericHeight != null ? Math.max(24, numericHeight) : p.height } : null,
    "aria-label": (p.now ? "Now, " : "") + title + ", " + BLOCK_LABEL[type] + ", " + (p.start || "") + " to " + (p.end || "") + (p.selected ? ", Selected" : "") },
    h("span", { className: "os-block-title" }, h(Shape, { mode: BLOCK_SHAPE[type] }), h("span", null, (p.now ? "Now · " : "") + title)),
    h("span", { className: "os-block-time" }, (compact ? "" : BLOCK_LABEL[type] + " · ") + (p.start || "") + (compact ? "" : "–" + (p.end || "")) + (p.selected ? " · Selected" : "")));
}
// end TimeBlock
// HabitDots
function HabitDots(p) {
  var labels = { done: "Done", skipped: "Not done", rest: "Rest day", future: "Upcoming" };
  var days = (p.days || []).map(function (d) {
    var v = typeof d === "string" ? { state: d } : d;
    return { state: labels[v.state] ? v.state : "future", today: !!v.today, label: v.label };
  });
  function dot(d, key) { var text = (d.label ? d.label + ", " : "") + (d.today ? "Today, " : "") + labels[d.state];
    return h("span", { key: key, className: cx("os-dot", "os-dot-" + d.state, d.today && "os-dot-today"), role: "img", "aria-label": text, title: text }); }
  return h("div", { className: "os-habit" },
    p.name ? h("div", { className: "os-habit-name" }, p.name) : null,
    h("div", { className: "os-dots", role: "group", "aria-label": (p.name || "Habit") + ", daily record" }, days.map(dot)),
    p.legend ? h("div", { className: "os-habit-legend" }, Object.keys(labels).map(function (s) { return h("span", { key: s }, dot({ state: s }, s), labels[s]); }), h("span", null, dot({ state: "future", today: true }, "today"), "Today")) : null,
    p.note ? h("div", { className: "os-habit-note" }, p.note) : null,
    p.restartNote ? h("div", { className: "os-habit-note" }, p.restartNote) : null);
}
// end HabitDots
// RoutineItem
function RoutineItem(p) {
  var st = R.useState(!!(p.defaultDone == null ? p.done : p.defaultDone)), done = p.onChange ? !!p.done : st[0];
  return h("button", { type: "button", className: cx("os-ritem", done && "os-ritem-done"), role: "checkbox", "aria-checked": done, disabled: p.disabled,
    onClick: function () { if (p.onChange) p.onChange(!done); else st[1](!done); } },
    h("span", { className: "os-check", "aria-hidden": "true" }, done ? h("svg", { viewBox: "0 0 12 12" }, h("path", { d: "M2 6.5 5 9.2 10 3" })) : null),
    h("span", null, h("span", { className: "os-ritem-label" }, p.label, p.optional ? h("span", { className: "os-optional" }, "Optional") : null),
      p.detail ? h("span", { className: "os-ritem-detail" }, p.detail) : null));
}
// end RoutineItem
// WellnessNote
function WellnessNote(p) {
  return h(p.as || "span", { className: "os-note", role: "note" }, h("svg", { viewBox: "0 0 14 14", "aria-hidden": "true" }, h("circle", { cx: 7, cy: 7, r: 6 }), h("path", { d: "M7 6v4M7 4.2v.1" })), p.children || "Wellness suggestion, not medical advice.");
}
// end WellnessNote
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
// Dialog
function Dialog(p) {
  return h(Modal, { open: p.open, title: p.title, description: p.description, onSafe: p.onCancel, scrim: p.scrim || p.destructive },
    p.children,
    h("div", { className: "os-dialog-actions" },
      h(Button, { variant: "ghost", onClick: p.onCancel, "data-initial-focus": true }, p.cancelLabel || "Cancel"),
      h(Button, { variant: p.destructive ? "critical" : "primary", onClick: p.onConfirm, loading: p.loading }, p.confirmLabel)));
}
// end Dialog
// Two steps in one native modal. Step 1: Back to focus (the one primary), Wait, "I need <app> now".
// Step 2: the reason group, Continue (aria-disabled until a reason is picked) and Back to focus.
// Back to focus stays the primary in both steps so the loud button never changes meaning; Escape calls it in both.
var INTENT_REASONS = ["Work", "Quick check", "Other"];
// IntentPrompt
function IntentPrompt(p) {
  var app = p.app || "this app", open = p.open !== false;
  var stepState = R.useState(1), step = p.onContinue ? stepState[0] : 1, setStep = stepState[1];
  var reasonState = R.useState(""), reason = reasonState[0], setReason = reasonState[1];
  var name = R.useId(), hintId = R.useId(), group = R.useRef(null);
  // Reopening or a new app starts again at step 1. Reset during render (previous-value pattern), not in an effect, so no stale step is ever shown.
  var shownState = R.useState({ open: open, app: app }), shown = shownState[0];
  if (shown.open !== open || shown.app !== app) {
    shownState[1]({ open: open, app: app });
    if ((open && !shown.open) || app !== shown.app) { setStep(1); setReason(""); }
  }
  // Entering step 2 the "I need" button unmounts, so focus moves to the first reason; VoiceOver reads it with the group's question.
  R.useEffect(function () {
    var first = step === 2 && group.current ? group.current.querySelector("input") : null;
    if (first) first.focus();
  }, [step]);
  var back = h(Button, { key: "back", variant: "primary", size: "lg", onClick: p.onReturn, "data-initial-focus": step === 1 ? true : undefined }, "Back to focus");
  return h(Modal, { open: p.open, title: p.title || "Is this what you intended?", description: step === 1 ? (p.message || ("You opened " + app + " during a focus session. Take one breath, then choose.")) : undefined, onSafe: p.onReturn, scrim: true, className: "os-intent" },
    h("div", { className: "os-breath", "aria-hidden": "true" }, h("i")),
    step === 1 ? h("div", { key: "step1", className: "os-intent-actions" },
      back,
      p.onWait ? h(Button, { key: "wait", variant: "quiet", onClick: p.onWait }, p.waitLabel || "Wait 10 minutes, then decide") : null,
      p.onContinue ? h(Button, { key: "need", variant: "ghost", onClick: function () { setStep(2); } }, "I need " + app + " now") : null) : null,
    step === 2 ? h("div", { key: "step2", className: "os-intent-reasons" },
      h("fieldset", { ref: group, className: "os-choice-group", "aria-describedby": hintId },
        h("legend", null, "What do you need " + app + " for?"),
        INTENT_REASONS.map(function (v) { return h("label", { className: "os-choice", key: v }, h("input", { type: "radio", name: name, value: v, checked: reason === v, onChange: function () { setReason(v); } }), v); })),
      h("p", { id: hintId, className: "os-intent-hint" }, "Pick one to continue. Your reason stays on this device.")) : null,
    step === 2 ? h("div", { key: "step2-actions", className: "os-intent-actions" },
      h(Button, { key: "continue", variant: "quiet", "aria-disabled": reason ? undefined : "true", "aria-describedby": reason ? undefined : hintId,
        onClick: function () { if (reason) p.onContinue(reason); } }, "Continue to " + app),
      back) : null);
}
// end IntentPrompt
// FullScreenFocus
function FullScreenFocus(p) {
  var leaving = R.useState(false), root = R.useRef(null);
  R.useEffect(function () { if (root.current) root.current.focus(); }, []);
  return h("section", { ref: root, className: "os-fullscreen", tabIndex: -1, "aria-label": "Full-screen focus", onKeyDown: function (e) { if (e.key === "Escape" && !leaving[0]) { e.preventDefault(); e.stopPropagation(); leaving[1](true); } } },
    h(TimerRing, { remaining: p.remaining, remainingLabel: p.remainingLabel, progress: p.progress, mode: p.mode, task: p.task, clock: p.clock, size: 560 }),
    h(Button, { variant: "ghost", onClick: function () { leaving[1](true); } }, "Leave full screen"),
    leaving[0] ? h(Dialog, { title: "Leave full screen?", description: "Your focus session will keep running.", confirmLabel: "Leave full screen", cancelLabel: "Stay focused", scrim: true, onCancel: function () { leaving[1](false); }, onConfirm: function () { leaving[1](false); p.onExit(); } }) : null);
}
// end FullScreenFocus
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
// Input
function Input(p) { return h(Field, p); }
// end Input
// TextArea
function TextArea(p) { return h(Field, Object.assign({ rows: 4 }, p, { multiline: true })); }
// end TextArea
// CapturePad
function CapturePad(p) {
  var busy = R.useState(false), error = R.useState(""), saving = R.useRef(false), group = R.useId();
  function save() {
    if (saving.current) return;
    if (!p.value.trim()) { p.onClose(); return; }
    saving.current = true; busy[1](true); error[1]("");
    Promise.resolve().then(function () { return p.onSave({ text: p.value.trim(), kind: p.kind }); }).then(function () {
      saving.current = false; busy[1](false); p.onClose();
    }, function () { saving.current = false; busy[1](false); error[1]("Your note is still here. Try saving again."); });
  }
  return h(Modal, { open: p.open, title: "Capture a thought", description: "Leave it here. Return to your focus.", onSafe: save },
    h("form", { className: "os-stack", onSubmit: function (e) { e.preventDefault(); save(); } },
      h(TextArea, { label: "Thought", value: p.value, onChange: function (e) { p.onChange(e.target.value); }, disabled: busy[0], "data-initial-focus": true, helper: "Escape saves to Inbox and closes.", error: error[0] }),
      h("fieldset", { className: "os-choice-group", disabled: busy[0] }, h("legend", null, "Interruption source"),
        ["internal", "external"].map(function (kind) { return h("label", { key: kind, className: "os-choice" }, h("input", { type: "radio", name: group, value: kind, checked: p.kind === kind, onChange: function () { p.onKindChange(kind); } }), kind === "internal" ? "Internal" : "External"); })),
      h(Button, { variant: "primary", type: "submit", loading: busy[0], disabled: !p.value.trim() }, busy[0] ? "Saving…" : "Save to Inbox")));
}
// end CapturePad
function StatusRow(p) {
  var tone = p.tone === "attention" || p.tone === "warning" || p.tone === "rest" ? p.tone : "neutral";
  var glyph = tone === "attention" ? h(AlertGlyph) : tone === "warning" ? h(Shape, { mode: "warning" }) : null;
  var action = p.actionLabel && p.onAction ? h(Button, { variant: p.actionVariant === "quiet" ? "quiet" : "ghost", "aria-label": p.actionName || undefined, onClick: p.onAction }, p.actionLabel) : null;
  return h("div", { className: cx("os-statusrow", tone === "warning" && "os-statusrow-warning") },
    h("p", { className: cx("os-statusrow-msg", tone === "rest" && "os-statusrow-rest"), role: "status", "aria-live": "polite" }, glyph, p.children), action);
}
// InlineNotice
function InlineNotice(p) {
  if (p.variant === "row") return h(StatusRow, p);
  return h("div", { className: cx("os-notice", p.tone === "warning" && "os-notice-warning") },
    h("div", { className: "os-notice-message", role: "status", "aria-atomic": "true" }, h(Shape, { mode: p.tone === "warning" ? "warning" : "shallow" }), h("span", null, p.children)),
    p.actionLabel && p.onAction ? h(Button, { variant: "ghost", "aria-label": p.actionName || undefined, onClick: p.onAction }, p.actionLabel) : null);
}
// end InlineNotice
// Toast
function Toast(p) {
  return h("div", { className: "os-toast" }, h(InlineNotice, p), p.onDismiss ? h(Button, { variant: "ghost", onClick: p.onDismiss }, "Dismiss") : null);
}
// end Toast
var NAV = ["Today", "Board", "Calendar", "Routines", "Review", "Settings"];
var NAV_PATHS = ["M3 4h14v13H3zM3 8h14M7 2v4M13 2v4", "M2 3h6v14H2zM12 3h6v14h-6z", "M3 4h14v13H3zM3 8h14M7 11h2M12 11h2M7 14h2", "M3 5l2 2 3-4M10 5h7M3 13l2 2 3-4M10 13h7", "M3 17V9M9 17V3M15 17V6M2 18h16", "M3 5h14M3 10h14M3 15h14M7 3v4M13 8v4M8 13v4"];
// NavRail
function NavRail(p) {
  return h("nav", { className: "os-nav", "aria-label": "Main navigation" }, NAV.map(function (label, i) {
    var id = label.toLowerCase();
    return h("button", { key: id, type: "button", "aria-current": p.current === id ? "page" : undefined, onClick: function () { p.onNavigate(id); } },
      h("svg", { viewBox: "0 0 20 20", "aria-hidden": "true" }, h("path", { d: NAV_PATHS[i] })), h("span", null, label));
  }));
}
// end NavRail
// KanbanColumn
function KanbanColumn(p) {
  var id = R.useId(), n = count(p.count), limit = p.limit == null ? null : count(p.limit), atLimit = limit != null && n >= limit;
  return h("section", { className: "os-kanban", "aria-labelledby": id },
    h("header", null, h("h2", { id: id }, p.title), atLimit ? h(ModeChip, { mode: "warning" }, n > limit ? n + " of " + limit : "At limit") : h("span", { className: "os-caption os-num" }, limit == null ? n + " tasks" : n + " of " + limit)),
    p.children || h("p", { className: "os-muted" }, p.emptyMessage || "Nothing here yet. That's fine."));
}
// end KanbanColumn
// CommandPalette
function CommandPalette(p) {
  var query = R.useState(""), active = R.useState(0), listId = R.useId();
  var results = p.commands.filter(function (c) { return (c.label + " " + (c.hint || "")).toLowerCase().indexOf(query[0].toLowerCase().trim()) !== -1; });
  var index = Math.min(active[0], Math.max(0, results.length - 1));
  function choose(c) { if (c) { p.onSelect(c.id); p.onClose(); } }
  function key(e) {
    if ((e.nativeEvent && e.nativeEvent.isComposing) || e.keyCode === 229) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); active[1](results.length ? (index + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0); }
    if (e.key === "Enter") { e.preventDefault(); choose(results[index]); }
  }
  R.useEffect(function () { var row = document.getElementById(listId + "-" + index); if (row) row.scrollIntoView({ block: "nearest" }); }, [index, query[0], listId]);
  return h(Modal, { open: p.open, title: "Commands", onSafe: p.onClose },
    h(Input, { label: "Search commands", value: query[0], onChange: function (e) { query[1](e.target.value); active[1](0); }, onKeyDown: key, role: "combobox", "aria-autocomplete": "list", "aria-expanded": true, "aria-controls": listId, "aria-activedescendant": results.length ? listId + "-" + index : undefined, "data-initial-focus": true }),
    h("div", { id: listId, className: "os-command-list", role: "listbox", "aria-label": "Commands" }, results.map(function (c, i) {
      return h("div", { key: c.id, id: listId + "-" + i, role: "option", "aria-selected": i === index, className: "os-command", onMouseDown: function (e) { e.preventDefault(); }, onClick: function () { choose(c); } },
        h("span", null, c.label), c.hint ? h("span", { className: "os-muted" }, c.hint) : null, i === index ? h("span", { className: "os-command-selected", "aria-hidden": "true" }, "Selected") : null);
    })),
    !results.length ? h("p", { role: "status", className: "os-muted" }, "No matching commands. Try a different word.") : null,
    h(Button, { variant: "ghost", onClick: p.onClose }, "Close"));
}
// end CommandPalette
// EmptyState
function EmptyState(p) {
  if (p.variant === "inline") return h("p", { className: "os-empty-inline" }, p.message || "Nothing here yet.");
  return h("div", { className: "os-empty" }, h("h2", null, p.title || "Nothing here yet"), h("p", null, p.message || "That's fine. Start when you're ready."), p.actionLabel && p.onAction ? h(Button, { onClick: p.onAction }, p.actionLabel) : null);
}
// end EmptyState
// The play glyph, drawn inline as the mode shapes are (it moves to Icon in T7).
function PlayGlyph() {
  return h("svg", { className: "os-start-glyph", viewBox: "0 0 20 20", "aria-hidden": "true", focusable: "false" }, h("path", { d: "M6.5 4.6v10.8a.9.9 0 0 0 1.37.77l8.6-5.4a.9.9 0 0 0 0-1.54l-8.6-5.4A.9.9 0 0 0 6.5 4.6z" }));
}
// The name is "Start focus" in every form ("Starting…" while loading). compactLabel shows below 400px of content
// (a container query on .os-start-fit) while the full label stays in the DOM and the name. unavailable uses
// aria-disabled, so both buttons stay focusable. singleKeys omitted: no aria-keyshortcuts (planner decision 11).
// finishTime and disabled are deprecated and render as before.
// StartButton
function StartButton(p) {
  var guard = p.unavailable ? { "aria-disabled": true } : null;
  var keys = p.singleKeys == null ? undefined : (p.singleKeys ? ["Space", "\u2318\u21a9"] : ["\u2318\u21a9"]).map(function (k) { return describeShortcut(k).aria; }).join(" ");
  var label = p.loading ? "Starting…" : p.compactLabel ? [h("span", { key: "full", className: "os-start-full" }, "Start focus"), h("span", { key: "compact", className: "os-start-compact", "aria-hidden": "true" }, p.compactLabel)] : "Start focus";
  return h("div", { className: cx("os-start", p.compactLabel && "os-start-fit") },
    h("div", { className: "os-actions" },
      h(Button, Object.assign({ variant: "primary", size: "lg", className: "os-start-btn", onClick: p.onStart, disabled: p.disabled, loading: p.loading, "aria-keyshortcuts": keys }, guard), h(PlayGlyph), label),
      h(Button, Object.assign({ onClick: p.onQuickStart, disabled: p.disabled || p.loading }, guard), "Just 2 minutes")),
    p.finishTime ? h("p", { className: "os-muted" }, "Realistic finish · ", h("span", { className: "os-num" }, p.finishTime)) : null);
}
// end StartButton
var FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
// PageFrame
function PageFrame(p) {
  var flow = p.variant === "flow";
  var title = p.compactPicker ? h("div", { className: "os-page-title" }, p.compactPicker, h("h1", { className: "os-sr-only", tabIndex: -1 }, p.title)) : h("h1", { tabIndex: -1 }, p.title);
  return h("div", { className: cx("os-page", flow && "os-page-flow") },
    h("header", { className: "os-page-head" }, title, p.primary || (p.step ? h("span", { className: "os-page-step" }, p.step) : null)),
    h("div", { className: "os-page-status" }, p.status),
    h("div", { className: "os-page-body" }, p.children),
    flow ? h("footer", { className: "os-page-foot" }, p.footer) : null);
}
// end PageFrame
// ScrollRegion
function ScrollRegion(p) {
  var ref = R.useRef(null), more = R.useState(false), scrolled = R.useState(false), focusable = R.useState(null);
  function measure() {
    var el = ref.current; if (!el) return;
    more[1](el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    scrolled[1](el.scrollTop > 0);
    focusable[1](!!el.querySelector(FOCUSABLE));
  }
  R.useEffect(function () {
    var el = ref.current;
    measure();
    var ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    var mo = typeof MutationObserver !== "undefined" ? new MutationObserver(measure) : null;
    if (ro && el) { ro.observe(el); Array.prototype.forEach.call(el.children, function (c) { ro.observe(c); }); }
    if (mo && el) mo.observe(el, { childList: true, subtree: true });
    return function () { if (ro) ro.disconnect(); if (mo) mo.disconnect(); };
  }, []);
  return h("div", { ref: ref, className: "os-scroll", role: "region", "aria-label": p.label, "data-scrolled": scrolled[0] ? "true" : "false", tabIndex: focusable[0] === false ? 0 : undefined, onScroll: measure },
    p.children,
    more[0] ? h("div", { className: "os-scroll-more", "aria-hidden": "true" }, h("svg", { className: "os-glyph", viewBox: "0 0 14 14", "aria-hidden": "true" }, h("path", { d: "M3.5 5.5L7 9l3.5-3.5" })), " More below") : null);
}
// end ScrollRegion
// SettingsIndex
function SettingsIndex(p) {
  var secs = p.sections || [], refs = R.useRef({}), last = R.useState(null);
  var stop = secs.some(function (s) { return s.id === last[0]; }) ? last[0] : secs.some(function (s) { return s.id === p.current; }) ? p.current : secs.length ? secs[0].id : null;
  R.useEffect(function () { last[1](null); }, [p.current]);
  function move(i, d) {
    var j = (i + d + secs.length) % secs.length, n = refs.current[secs[j].id];
    last[1](secs[j].id); if (n) n.focus();
  }
  return h("nav", { "aria-label": "Settings sections" }, h("ul", { className: "os-sindex" }, secs.map(function (s, i) {
    return h("li", { key: s.id }, h("button", {
      type: "button", className: "os-sindex-item", ref: function (n) { refs.current[s.id] = n; },
      tabIndex: s.id === stop ? 0 : -1, "aria-current": s.id === p.current ? "location" : undefined,
      onFocus: function () { last[1](s.id); },
      onClick: function () { p.onJump(s.id); },
      onKeyDown: function (e) {
        if (e.key === "ArrowDown") { e.preventDefault(); move(i, 1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); move(i, -1); }
        else if (e.key === "Enter") { e.preventDefault(); p.onJump(s.id); }
      }
    }, s.name, h("span", { className: "os-sindex-value" }, s.problem ? [s.problem.alert ? h(AlertGlyph, { key: "g" }) : null, s.problem.text] : s.value)));
  })));
}
// end SettingsIndex
// SettingsRow
function SettingsRow(p) {
  var generated = R.useId(), id = p.id || generated, described = [id + "-help", p.status ? id + "-status" : "", p.disabledReason ? id + "-why" : ""].filter(Boolean).join(" ");
  var action = p.actionLabel && p.onAction ? h(Button, { variant: p.actionVariant === "ghost" ? "ghost" : "quiet", "aria-label": p.actionName || undefined, onClick: p.onAction }, p.actionLabel) : null;
  return h("div", { className: "os-srow", role: "group", "aria-labelledby": id + "-label", "aria-describedby": described },
    h("p", { id: id + "-label", className: "os-srow-label" }, p.label),
    p.children,
    h("p", { id: id + "-help", className: "os-srow-help" }, p.helper),
    p.status || action ? h("div", { className: "os-srow-line" }, p.status ? h("p", { id: id + "-status", className: "os-srow-status" }, p.status) : null, action) : null,
    p.disabledReason ? h("p", { id: id + "-why", className: "os-srow-status" }, p.disabledReason) : null);
}
// end SettingsRow
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
// Kbd (internal: legacy Tooltip, PopoverMenu and IconButton still call it; TSX Kbd is the public one)
function Kbd(p) {
  var glyph = h("span", { className: "os-kbd", "aria-hidden": "true" }, p.keys);
  if (p.inTooltip && p.spoken == null) return glyph;
  return h(R.Fragment, null, glyph, h("span", { className: "os-sr-only" }, p.spoken != null ? p.spoken : describeShortcut(p.keys).spoken));
}
// end Kbd
// A token read as a number: "160ms" and "0.16s" give 160, "4px" gives 4, a missing token gives 0.
function tokenNumber(el, name) {
  var v = el && el.ownerDocument.defaultView ? el.ownerDocument.defaultView.getComputedStyle(el).getPropertyValue(name).trim() : "", n = parseFloat(v);
  return !Number.isFinite(n) ? 0 : /ms$/.test(v) ? n : /s$/.test(v) ? n * 1000 : n;
}
// Positioned panel, shared by Tooltip and PopoverMenu (internal, not exported). No popover API, no anchor
// positioning: the macOS 13 WebKit has neither. The panel lives in the nearest open dialog (already in the top
// layer) or the page body, is placed from the trigger rect below it, flipped above when it does not fit,
// kept inside the viewport, and re-placed on resize and on any scroll.
// opts (PopoverMenu): align "start" lines the panel's start edge up with the trigger's instead of centring it;
// clamp keeps a panel taller than the room on its side inside the viewport (it may then cover the trigger).
function panelHost(trigger) {
  var dialog = trigger.closest ? trigger.closest("dialog[open]") : null;
  return dialog || trigger.ownerDocument.body;
}
function placePanel(trigger, panel, opts) {
  var doc = trigger.ownerDocument, root = doc.documentElement, view = doc.defaultView;
  var t = trigger.getBoundingClientRect(), w = panel.offsetWidth, ht = panel.offsetHeight;
  var gap = tokenNumber(root, "--space-1"), edge = tokenNumber(root, "--space-2");
  var vw = root.clientWidth || view.innerWidth, vh = root.clientHeight || view.innerHeight;
  var below = t.bottom + gap, above = t.top - gap - ht;
  var side = below + ht <= vh - edge || (above < edge && vh - t.bottom >= t.top) ? "below" : "above";
  var start = opts && opts.align === "start" ? t.left : t.left + t.width / 2 - w / 2;
  var left = Math.min(Math.max(edge, start), Math.max(edge, vw - edge - w));
  var top = side === "below" ? below : above;
  if (opts && opts.clamp) top = Math.min(Math.max(edge, top), Math.max(edge, vh - edge - ht));
  panel.style.left = Math.round(left) + "px";
  panel.style.top = Math.round(top) + "px";
  panel.setAttribute("data-side", side);
}
function followTrigger(trigger, panel, opts) {
  var view = trigger.ownerDocument.defaultView;
  function place() { if (trigger.isConnected && panel.isConnected) placePanel(trigger, panel, opts); }
  place();
  view.addEventListener("resize", place);
  view.addEventListener("scroll", place, true);
  return function () { view.removeEventListener("resize", place); view.removeEventListener("scroll", place, true); };
}
// Input modality. A focus shows a Tooltip only right after keyboard navigation (Tab, arrows, Home, End, Page keys).
// WebKit matches :focus-visible for focus moved by script too, so this flag decides: focus restored after a dialog
// closes, or launch focus on Start, follows no navigation key and shows nothing. A pointer press or any other key clears it.
var NAV_KEYS = /^(Tab|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown)$/;
var modality = { keyboard: false };
if (typeof document !== "undefined") {
  document.addEventListener("keydown", function (e) { modality.keyboard = NAV_KEYS.test(e.key); }, true);
  document.addEventListener("pointerdown", function () { modality.keyboard = false; }, true);
  document.addEventListener("mousedown", function () { modality.keyboard = false; }, true);
}
// Tooltip
function Tooltip(p) {
  var anchor = R.useRef(null), timer = R.useRef(0);
  var hover = R.useState(false), focus = R.useState(false), dismissed = R.useState(false);
  // A menu trigger whose menu is open (aria-expanded true on the child) shows no tooltip, so Esc reaches the menu.
  var kid = p.children && p.children.props, expanded = kid ? kid["aria-expanded"] === true || kid["aria-expanded"] === "true" : false;
  var shown = !!p.label && (hover[0] || focus[0]) && !dismissed[0] && !expanded;
  function cancel() { if (timer.current) { clearTimeout(timer.current); timer.current = 0; } }
  function afterQuick(fn) {
    cancel();
    timer.current = setTimeout(function () { timer.current = 0; fn(); }, tokenNumber(anchor.current && anchor.current.ownerDocument.documentElement, "--duration-quick"));
  }
  function enter() { if (hover[0]) cancel(); else afterQuick(function () { hover[1](true); }); }
  function leave() { afterQuick(function () { hover[1](false); }); }
  R.useEffect(function () { return cancel; }, []);
  R.useEffect(function () { if (!hover[0] && !focus[0] && dismissed[0]) dismissed[1](false); }, [hover[0], focus[0], dismissed[0]]);
  // Esc hides the tooltip without moving focus and does nothing else on that press (no dialog cancel, no host key handler),
  // unless the press comes from inside an open PopoverMenu: then it hides the tooltip and still reaches the menu.
  R.useEffect(function () {
    if (!shown || !anchor.current) return;
    var doc = anchor.current.ownerDocument;
    function key(e) {
      if (e.key !== "Escape") return;
      var t = e.target, inMenu = t && t.closest && t.closest(".os-popover-panel");
      cancel(); dismissed[1](true);
      if (!inMenu) { e.preventDefault(); e.stopPropagation(); }
    }
    doc.addEventListener("keydown", key, true);
    return function () { doc.removeEventListener("keydown", key, true); };
  }, [shown]);
  R.useLayoutEffect(function () {
    var a = anchor.current;
    if (!shown || !a) return;
    var doc = a.ownerDocument, trigger = a.firstElementChild || a, panel = doc.createElement("div"), text = doc.createElement("span");
    panel.className = "os-tooltip os-tooltip-panel";
    panel.setAttribute("aria-hidden", "true");
    panel.setAttribute("data-placement", p.placement || "auto");
    text.className = "os-tooltip-label";
    text.textContent = p.label;
    panel.appendChild(text);
    if (p.shortcut) { var kbd = doc.createElement("span"); kbd.className = "os-kbd"; kbd.textContent = p.shortcut; panel.appendChild(kbd); }
    // Hoverable (WCAG 1.4.13): the pointer can move onto the panel and it stays.
    panel.addEventListener("pointerenter", enter);
    panel.addEventListener("pointerleave", leave);
    panelHost(a).appendChild(panel);
    var stop = followTrigger(trigger, panel);
    return function () { stop(); panel.removeEventListener("pointerenter", enter); panel.removeEventListener("pointerleave", leave); if (panel.parentNode) panel.parentNode.removeChild(panel); };
  }, [shown, p.label, p.shortcut, p.placement]);
  return h("span", { ref: anchor, className: "os-tip-anchor",
    onPointerEnter: enter, onPointerLeave: leave,
    onFocus: function () { if (modality.keyboard) focus[1](true); },
    onBlur: function (e) { if (!anchor.current || !anchor.current.contains(e.relatedTarget)) focus[1](false); } }, p.children);
}
// end Tooltip
// shortcut: one glyph string, or an array of chords (aria-keyshortcuts joins them with spaces).
// shortcutLabel: the text the tooltip Kbd shows when it differs from the chords (a range such as "\u23181\u20136").
// keyshortcuts={false}: the Kbd shows but the button sets no aria-keyshortcuts (the page, not this button, owns the key).
// IconButton
function IconButton(p) {
  var chords = p.shortcut == null ? [] : [].concat(p.shortcut), shown = p.shortcutLabel != null ? p.shortcutLabel : chords.join(" ");
  return h(Tooltip, { label: p.label, shortcut: shown || undefined },
    h("button", { type: "button", id: p.id, className: cx("os-iconbtn", p.size === "round" && "os-iconbtn-round"), "aria-label": p.label,
      "aria-keyshortcuts": chords.length && p.keyshortcuts !== false ? chords.map(function (c) { return describeShortcut(c).aria; }).join(" ") : undefined,
      "aria-describedby": p["aria-describedby"], "aria-haspopup": p["aria-haspopup"], "aria-expanded": p["aria-expanded"], "aria-controls": p["aria-controls"],
      disabled: p.disabled, onClick: p.onClick },
      h("span", { className: "os-iconbtn-icon", "aria-hidden": "true" }, p.icon)));
}
// end IconButton
// PopoverMenu (PopoverMenu README): a positioned panel, never a popover. React renders it into a slot; on mount it
// moves into the nearest open dialog that holds the anchor (the top layer) or the page body and is placed by
// placePanel, start-aligned with the anchor and clamped inside the viewport. It can sit outside the React root,
// so its keys and clicks are native listeners reading the latest props. The roving index is component state.
// It reads anchor only to place itself and to return focus; the host sets the trigger's aria-expanded and aria-controls.
var MENU_PLACE = { align: "start", clamp: true };
var MENU_ROLE = { radio: "menuitemradio", checkbox: "menuitemcheckbox", link: "menuitem" };
function menuRowLive(item, readOnly) { return !!item && !item.disabled && !(readOnly && item.kind !== "link"); }
function menuFocusTarget(a) { return !a ? null : a.matches && a.matches(FOCUSABLE) ? a : a.querySelector ? a.querySelector(FOCUSABLE) : null; }
// Tab out of a menu (WAI-ARIA APG): the next tabbable element after the trigger in DOM order, inside the open dialog
// that holds the trigger if there is one, never inside the menu itself. None: null (focus goes back to the trigger).
function menuNextTabbable(from, menu) {
  if (!from || !from.ownerDocument) return null;
  var scope = panelHost(from), all = scope.querySelectorAll(FOCUSABLE);
  for (var i = 0; i < all.length; i++) {
    var n = all[i];
    if (n === from || from.contains(n) || (menu && menu.contains(n)) || n.tabIndex < 0) continue;
    if (n.closest && n.closest("[hidden],[inert],[aria-hidden='true']")) continue;
    if (from.compareDocumentPosition(n) & 4) return n;
  }
  return null;
}
// PopoverMenu
function PopoverMenu(p) {
  var generated = R.useId(), id = p.id || generated, items = p.items || [];
  var slot = R.useRef(null), panel = R.useRef(null), rows = R.useRef([]), restore = R.useRef(true), latest = R.useRef(null);
  var roving = R.useState(function () {
    for (var i = 0; i < items.length; i++) if (items[i].kind === "radio" && items[i].checked) return i;
    return 0;
  });
  var index = Math.min(roving[0], Math.max(0, items.length - 1)), setIndex = roving[1];
  latest.current = { items: items, index: index, readOnly: !!p.readOnly, onSelect: p.onSelect, onClose: p.onClose, anchor: p.anchor };
  R.useLayoutEffect(function () {
    var el = panel.current, home = slot.current;
    if (!el) return;
    var doc = el.ownerDocument, a = p.anchor && p.anchor.current;
    // A theme set on a section around the trigger (as in the previews) travels with the panel.
    var themed = a && a.closest ? a.closest("[data-theme]") : null;
    if (themed && themed !== doc.documentElement) el.setAttribute("data-theme", themed.getAttribute("data-theme"));
    (a ? panelHost(a) : doc.body).appendChild(el);
    var stop = a ? followTrigger(a, el, MENU_PLACE) : function () {};
    function anchorEl() { var r = latest.current.anchor; return r && r.current; }
    function back() { var t = menuFocusTarget(anchorEl()); restore.current = false; if (t && t.focus) t.focus(); }
    function close() { back(); latest.current.onClose(); }
    function choose(i) {
      var cur = latest.current, item = cur.items[i];
      if (!menuRowLive(item, cur.readOnly)) return;
      back(); cur.onSelect(item.id); cur.onClose();
    }
    function key(e) {
      var cur = latest.current, n = cur.items.length, k = e.key;
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Home" || k === "End") {
        e.preventDefault(); e.stopPropagation();
        if (n) setIndex(k === "Home" ? 0 : k === "End" ? n - 1 : (cur.index + (k === "ArrowDown" ? 1 : -1) + n) % n);
      } else if (k === "Enter" || k === " " || k === "Spacebar") { e.preventDefault(); e.stopPropagation(); if (n) choose(cur.index); }
      else if (k === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
      else if (k === "Tab") {
        // Shift+Tab goes back to the trigger; Tab moves on to the next tabbable element after it.
        e.preventDefault(); e.stopPropagation();
        var next = e.shiftKey ? null : menuNextTabbable(menuFocusTarget(anchorEl()), el);
        if (!next) close();
        else { restore.current = false; next.focus(); latest.current.onClose(); }
      }
    }
    function click(e) {
      var row = e.target && e.target.closest ? e.target.closest("[data-menu-index]") : null;
      if (!row || !el.contains(row)) return;
      var i = Number(row.getAttribute("data-menu-index"));
      setIndex(i); choose(i);
    }
    // A press outside the menu and its trigger closes it and leaves focus where the press put it.
    function outside(e) {
      var a2 = anchorEl();
      if (el.contains(e.target) || (a2 && a2.contains(e.target))) return;
      restore.current = false; latest.current.onClose();
    }
    el.addEventListener("keydown", key);
    el.addEventListener("click", click);
    doc.addEventListener("pointerdown", outside, true);
    return function () {
      stop();
      el.removeEventListener("keydown", key);
      el.removeEventListener("click", click);
      doc.removeEventListener("pointerdown", outside, true);
      var had = el.contains(doc.activeElement);
      if (home) home.appendChild(el);
      if (had && restore.current) { var t = menuFocusTarget(anchorEl()); if (t && t.isConnected && t.focus) t.focus(); }
    };
  }, []);
  // Placed again after every render (rows can change), and focus follows the roving index.
  R.useLayoutEffect(function () { var a = p.anchor && p.anchor.current; if (a && panel.current) placePanel(a, panel.current, MENU_PLACE); });
  R.useLayoutEffect(function () {
    var row = rows.current[index];
    if (row && row.ownerDocument.activeElement !== row) row.focus({ preventScroll: true });
  }, [index, items.length]);
  var headingId = id + "-heading", descId = id + "-desc", list = [];
  items.forEach(function (it, i) {
    if (it.kind === "link" && i > 0 && items[i - 1].kind !== "link") list.push(h("hr", { key: "sep-" + i, className: "os-popover-sep" }));
    var live = menuRowLive(it, p.readOnly);
    list.push(h("div", { key: it.id, ref: function (n) { rows.current[i] = n; }, role: MENU_ROLE[it.kind] || "menuitem", tabIndex: i === index ? 0 : -1,
      "data-menu-index": i, className: cx("os-popover-item", "os-popover-" + it.kind),
      "aria-checked": it.kind === "radio" || it.kind === "checkbox" ? !!it.checked : undefined, "aria-disabled": live ? undefined : "true" },
      it.kind === "radio" ? h("span", { className: "os-radio-mark", "aria-hidden": "true" }) : null,
      it.kind === "checkbox" ? h("span", { className: "os-checkbox-mark", "aria-hidden": "true" }, it.checked ? h("svg", { viewBox: "0 0 20 20", focusable: "false" }, h("path", { d: "M5.5 10.5l3 3 6-7" })) : null) : null,
      h("span", { className: "os-popover-label" }, it.label),
      it.meta ? h("span", { className: "os-popover-meta" }, it.meta) : null,
      it.kind === "checkbox" ? h("span", { className: "os-popover-word", "aria-hidden": "true" }, it.checked ? "On" : "Off") : null));
  });
  rows.current.length = items.length;
  return h("span", { ref: slot, className: "os-popover-slot" },
    h("div", { ref: panel, className: "os-popover os-popover-panel", "data-side": "below" },
      h("div", { className: "os-popover-head" },
        h("div", { className: "os-popover-headline" },
          h("p", { className: "os-popover-title", id: headingId }, p.heading),
          p.singleKeys === true ? h(Kbd, { keys: "P", inTooltip: true }) : null),
        p.description ? h("p", { className: "os-popover-desc", id: descId }, p.description) : null),
      h("div", { id: id, role: "menu", className: "os-popover-list", "aria-labelledby": headingId, "aria-describedby": p.description ? descId : undefined }, list)));
}
// end PopoverMenu
// NowLine
function NowLine(p) { return h("div", { className: "os-nowline", "aria-label": "Now, " + p.time }, h("span", { className: "os-num" }, "Now · " + p.time), h("i", { "aria-hidden": "true" })); }
// end NowLine

export {
  ModeChip,
  TimerRing,
  TimerStrip,
  MenuBarTimer,
  TaskCard,
  TimeBlock,
  HabitDots,
  RoutineItem,
  WellnessNote,
  IntentPrompt,
  Dialog,
  FullScreenFocus,
  Input,
  TextArea,
  CapturePad,
  InlineNotice,
  Toast,
  NavRail,
  KanbanColumn,
  CommandPalette,
  EmptyState,
  StartButton,
  NowLine,
  PageFrame,
  ScrollRegion,
  SettingsIndex,
  SettingsRow,
  IconButton,
  Tooltip,
  PopoverMenu,
  timerLayout,
};
