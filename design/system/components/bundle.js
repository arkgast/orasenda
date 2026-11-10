/* @ds-bundle: {"format":4,"namespace":"Orasenda","components":[{"name":"Button"},{"name":"ModeChip"},{"name":"TimerRing"},{"name":"MenuBarTimer"},{"name":"TaskCard"},{"name":"TimeBlock"},{"name":"HabitDots"},{"name":"RoutineItem"},{"name":"WellnessNote"},{"name":"IntentPrompt"},{"name":"Dialog"},{"name":"FullScreenFocus"},{"name":"Input"},{"name":"TextArea"},{"name":"CapturePad"},{"name":"InlineNotice"},{"name":"Toast"},{"name":"NavRail"},{"name":"KanbanColumn"},{"name":"CommandPalette"},{"name":"EmptyState"},{"name":"StartButton"},{"name":"NowLine"},{"name":"PageFrame"},{"name":"ScrollRegion"},{"name":"SettingsIndex"},{"name":"SettingsRow"}]} */
(function () {
  "use strict";
  var R = window.React, h = R.createElement;
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
  function ModeChip(p) {
    var mode = p.mode || "focus";
    return h("span", { className: "os-chip os-mode-" + mode }, h(Shape, { mode: mode }), p.children || MODE_LABEL[mode]);
  }
  function timerLabel(p, mode) {
    return mode === "idle" ? "No session" : MODE_LABEL[mode] + ", " + (p.remainingLabel || p.remaining || "25:00") + " remaining" + (p.task ? ", " + p.task : "") + (p.clock ? ", Wall clock, " + p.clock : "");
  }
  function TimerRing(p) {
    var size = Math.max(160, p.size || 280), stroke = Math.max(2, Math.min(size / 4, p.stroke || Math.round(size / 40)));
    var r = (size - stroke) / 2, c = 2 * Math.PI * r, progress = clamp(p.progress), mode = p.mode || "focus";
    return h("div", { className: cx("os-timer", "os-timer-" + mode, size >= 480 && "os-timer-full"), style: { width: size }, role: "timer", "aria-live": "off", "aria-label": timerLabel(p, mode) },
      h("svg", { className: "os-timer-ring", viewBox: "0 0 " + size + " " + size, "aria-hidden": "true" },
        h("circle", { className: "track", cx: size / 2, cy: size / 2, r: r, strokeWidth: Math.max(2, stroke / 3) }),
        mode !== "idle" ? h("circle", { className: "prog", cx: size / 2, cy: size / 2, r: r, strokeWidth: stroke, strokeDasharray: c, strokeDashoffset: c * progress }) : null),
      h("div", { className: "os-timer-center", "aria-hidden": "true" },
        h(ModeChip, { mode: mode }),
        mode !== "idle" ? h("div", { className: "os-timer-digits" }, p.remaining || "25:00") : null,
        p.task ? h("div", { className: "os-timer-task" }, p.task) : null,
        p.clock ? h("div", { className: "os-timer-clock" }, "Clock · " + p.clock) : null),
      p.clock ? h("span", { className: "os-sr-only" }, "Wall clock, " + p.clock) : null);
  }
  function MenuBarTimer(p) {
    var mode = p.mode || "focus", c = 2 * Math.PI * 5;
    return h("span", { className: cx("os-menubar", "os-menubar-" + mode, p.compact === false && "os-menubar-floating"), role: "timer", "aria-live": "off", "aria-label": timerLabel(p, mode) },
      mode === "focus" ? h("svg", { className: "os-menu-ring", viewBox: "0 0 14 14", "aria-hidden": "true" },
        h("circle", { className: "ring-track", cx: 7, cy: 7, r: 5 }),
        h("circle", { className: "ring-prog", cx: 7, cy: 7, r: 5, strokeDasharray: c, strokeDashoffset: c * clamp(p.progress) })) : h(Shape, { mode: mode }),
      mode !== "idle" ? h("span", { "aria-hidden": "true" }, p.remaining || "25:00") : null,
      p.compact === false && p.task ? h("span", { className: "os-menubar-task", "aria-hidden": "true" }, p.task) : null);
  }
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
  var BLOCK_LABEL = { deep: "Deep", shallow: "Shallow", break: "Break", routine: "Routine", personal: "Personal", overflow: "Overflow" };
  var BLOCK_SHAPE = { deep: "focus", shallow: "shallow", break: "break", routine: "routine", personal: "routine", overflow: "overflow" };
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
  function RoutineItem(p) {
    var st = R.useState(!!(p.defaultDone == null ? p.done : p.defaultDone)), done = p.onChange ? !!p.done : st[0];
    return h("button", { type: "button", className: cx("os-ritem", done && "os-ritem-done"), role: "checkbox", "aria-checked": done, disabled: p.disabled,
      onClick: function () { if (p.onChange) p.onChange(!done); else st[1](!done); } },
      h("span", { className: "os-check", "aria-hidden": "true" }, done ? h("svg", { viewBox: "0 0 12 12" }, h("path", { d: "M2 6.5 5 9.2 10 3" })) : null),
      h("span", null, h("span", { className: "os-ritem-label" }, p.label, p.optional ? h("span", { className: "os-optional" }, "Optional") : null),
        p.detail ? h("span", { className: "os-ritem-detail" }, p.detail) : null));
  }
  function WellnessNote(p) {
    return h(p.as || "span", { className: "os-note", role: "note" }, h("svg", { viewBox: "0 0 14 14", "aria-hidden": "true" }, h("circle", { cx: 7, cy: 7, r: 6 }), h("path", { d: "M7 6v4M7 4.2v.1" })), p.children || "Wellness suggestion, not medical advice.");
  }
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
  function Dialog(p) {
    return h(Modal, { open: p.open, title: p.title, description: p.description, onSafe: p.onCancel, scrim: p.scrim || p.destructive },
      p.children,
      h("div", { className: "os-dialog-actions" },
        h(Button, { variant: "ghost", onClick: p.onCancel, "data-initial-focus": true }, p.cancelLabel || "Cancel"),
        h(Button, { variant: p.destructive ? "critical" : "primary", onClick: p.onConfirm, loading: p.loading }, p.confirmLabel)));
  }
  // Two steps in one native modal. Step 1: Back to focus (the one primary), Wait, "I need <app> now".
  // Step 2: the reason group, Continue (aria-disabled until a reason is picked) and Back to focus.
  // Back to focus stays the primary in both steps so the loud button never changes meaning; Escape calls it in both.
  var INTENT_REASONS = ["Work", "Quick check", "Other"];
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
  function FullScreenFocus(p) {
    var leaving = R.useState(false), root = R.useRef(null);
    R.useEffect(function () { if (root.current) root.current.focus(); }, []);
    return h("section", { ref: root, className: "os-fullscreen", tabIndex: -1, "aria-label": "Full-screen focus", onKeyDown: function (e) { if (e.key === "Escape" && !leaving[0]) { e.preventDefault(); e.stopPropagation(); leaving[1](true); } } },
      h(TimerRing, { remaining: p.remaining, remainingLabel: p.remainingLabel, progress: p.progress, mode: p.mode, task: p.task, clock: p.clock, size: 560 }),
      h(Button, { variant: "ghost", onClick: function () { leaving[1](true); } }, "Leave full screen"),
      leaving[0] ? h(Dialog, { title: "Leave full screen?", description: "Your focus session will keep running.", confirmLabel: "Leave full screen", cancelLabel: "Stay focused", scrim: true, onCancel: function () { leaving[1](false); }, onConfirm: function () { leaving[1](false); p.onExit(); } }) : null);
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
  function Input(p) { return h(Field, p); }
  function TextArea(p) { return h(Field, Object.assign({ rows: 4 }, p, { multiline: true })); }
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
  function StatusRow(p) {
    var tone = p.tone === "attention" || p.tone === "warning" || p.tone === "rest" ? p.tone : "neutral";
    var glyph = tone === "attention" ? h(AlertGlyph) : tone === "warning" ? h(Shape, { mode: "warning" }) : null;
    var action = p.actionLabel && p.onAction ? h(Button, { variant: p.actionVariant === "quiet" ? "quiet" : "ghost", "aria-label": p.actionName || undefined, onClick: p.onAction }, p.actionLabel) : null;
    return h("div", { className: cx("os-statusrow", tone === "warning" && "os-statusrow-warning") },
      h("p", { className: cx("os-statusrow-msg", tone === "rest" && "os-statusrow-rest"), role: "status", "aria-live": "polite" }, glyph, p.children), action);
  }
  function InlineNotice(p) {
    if (p.variant === "row") return h(StatusRow, p);
    return h("div", { className: cx("os-notice", p.tone === "warning" && "os-notice-warning") },
      h("div", { className: "os-notice-message", role: "status", "aria-atomic": "true" }, h(Shape, { mode: p.tone === "warning" ? "warning" : "shallow" }), h("span", null, p.children)),
      p.actionLabel && p.onAction ? h(Button, { variant: "ghost", "aria-label": p.actionName || undefined, onClick: p.onAction }, p.actionLabel) : null);
  }
  function Toast(p) {
    return h("div", { className: "os-toast" }, h(InlineNotice, p), p.onDismiss ? h(Button, { variant: "ghost", onClick: p.onDismiss }, "Dismiss") : null);
  }
  var NAV = ["Today", "Board", "Calendar", "Routines", "Review", "Settings"];
  var NAV_PATHS = ["M3 4h14v13H3zM3 8h14M7 2v4M13 2v4", "M2 3h6v14H2zM12 3h6v14h-6z", "M3 4h14v13H3zM3 8h14M7 11h2M12 11h2M7 14h2", "M3 5l2 2 3-4M10 5h7M3 13l2 2 3-4M10 13h7", "M3 17V9M9 17V3M15 17V6M2 18h16", "M3 5h14M3 10h14M3 15h14M7 3v4M13 8v4M8 13v4"];
  function NavRail(p) {
    return h("nav", { className: "os-nav", "aria-label": "Main navigation" }, NAV.map(function (label, i) {
      var id = label.toLowerCase();
      return h("button", { key: id, type: "button", "aria-current": p.current === id ? "page" : undefined, onClick: function () { p.onNavigate(id); } },
        h("svg", { viewBox: "0 0 20 20", "aria-hidden": "true" }, h("path", { d: NAV_PATHS[i] })), h("span", null, label));
    }));
  }
  function KanbanColumn(p) {
    var id = R.useId(), n = count(p.count), limit = p.limit == null ? null : count(p.limit), atLimit = limit != null && n >= limit;
    return h("section", { className: "os-kanban", "aria-labelledby": id },
      h("header", null, h("h2", { id: id }, p.title), atLimit ? h(ModeChip, { mode: "warning" }, n > limit ? n + " of " + limit : "At limit") : h("span", { className: "os-caption os-num" }, limit == null ? n + " tasks" : n + " of " + limit)),
      p.children || h("p", { className: "os-muted" }, p.emptyMessage || "Nothing here yet. That's fine."));
  }
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
  function EmptyState(p) {
    if (p.variant === "inline") return h("p", { className: "os-empty-inline" }, p.message || "Nothing here yet.");
    return h("div", { className: "os-empty" }, h("h2", null, p.title || "Nothing here yet"), h("p", null, p.message || "That's fine. Start when you're ready."), p.actionLabel && p.onAction ? h(Button, { onClick: p.onAction }, p.actionLabel) : null);
  }
  function StartButton(p) {
    return h("div", { className: "os-start" }, h("div", { className: "os-actions" }, h(Button, { variant: "primary", size: "lg", onClick: p.onStart, disabled: p.disabled, loading: p.loading }, p.loading ? "Starting…" : "Start focus"), h(Button, { onClick: p.onQuickStart, disabled: p.disabled || p.loading }, "Just 2 minutes")), p.finishTime ? h("p", { className: "os-muted" }, "Realistic finish · ", h("span", { className: "os-num" }, p.finishTime)) : null);
  }
  var FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
  function PageFrame(p) {
    var flow = p.variant === "flow";
    var title = p.compactPicker ? h("div", { className: "os-page-title" }, p.compactPicker, h("h1", { className: "os-sr-only", tabIndex: -1 }, p.title)) : h("h1", { tabIndex: -1 }, p.title);
    return h("div", { className: cx("os-page", flow && "os-page-flow") },
      h("header", { className: "os-page-head" }, title, p.primary || (p.step ? h("span", { className: "os-page-step" }, p.step) : null)),
      h("div", { className: "os-page-status" }, p.status),
      h("div", { className: "os-page-body" }, p.children),
      flow ? h("footer", { className: "os-page-foot" }, p.footer) : null);
  }
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
  function NowLine(p) { return h("div", { className: "os-nowline", "aria-label": "Now, " + p.time }, h("span", { className: "os-num" }, "Now · " + p.time), h("i", { "aria-hidden": "true" })); }
  window.Orasenda = Object.assign(window.Orasenda || {}, { Button: Button, ModeChip: ModeChip, TimerRing: TimerRing, MenuBarTimer: MenuBarTimer, TaskCard: TaskCard, TimeBlock: TimeBlock, HabitDots: HabitDots, RoutineItem: RoutineItem, WellnessNote: WellnessNote, IntentPrompt: IntentPrompt, Dialog: Dialog, FullScreenFocus: FullScreenFocus, Input: Input, TextArea: TextArea, CapturePad: CapturePad, InlineNotice: InlineNotice, Toast: Toast, NavRail: NavRail, KanbanColumn: KanbanColumn, CommandPalette: CommandPalette, EmptyState: EmptyState, StartButton: StartButton, NowLine: NowLine, PageFrame: PageFrame, ScrollRegion: ScrollRegion, SettingsIndex: SettingsIndex, SettingsRow: SettingsRow });
})();
