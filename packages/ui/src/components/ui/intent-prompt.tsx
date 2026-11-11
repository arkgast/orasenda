import { Dialog as DialogPrimitive } from "radix-ui";
import { type JSX, useEffect, useId, useRef, useState } from "react";
import { isTopmostLayer } from "../../lib/layer";
import { cn } from "../../lib/utils";
import { Button } from "./button";

/** The reasons offered on step 2, in order. */
export type IntentReason = "Work" | "Quick check" | "Other";

/** Two steps. Wait renders on step 1 only when onWait is passed; "I need <app> now" and step 2 only when onContinue is passed. onContinue always receives the picked reason. */
export interface IntentPromptProps {
  open?: boolean;
  app?: string;
  title?: string;
  message?: string;
  waitLabel?: string;
  onReturn?: () => void;
  onWait?: () => void;
  onContinue?: (reason: IntentReason) => void;
}

const REASONS: IntentReason[] = ["Work", "Quick check", "Other"];

const actions = "flex w-full flex-col gap-2";

/**
 * The breathing circle: one slow scale loop (the only loop in the app). Tailwind has no keyframes here, so
 * the loop runs through the Web Animations API with the duration and easing read from the tokens, and it
 * does not run at all under reduced motion.
 */
function Breath(): JSX.Element {
  const dot = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = dot.current;
    if (!el || typeof el.animate !== "function") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let running: Animation | null = null;
    const sync = () => {
      running?.cancel();
      running = null;
      if (reduce?.matches) return;
      const style = getComputedStyle(el);
      const duration = style.getPropertyValue("--duration-breath").trim();
      const ms = duration.endsWith("ms")
        ? Number.parseFloat(duration)
        : Number.parseFloat(duration) * 1000;
      running = el.animate(
        [{ transform: "scale(0.7)" }, { transform: "scale(1.4)" }, { transform: "scale(0.7)" }],
        {
          duration: Number.isFinite(ms) && ms > 0 ? ms : 8000,
          iterations: Number.POSITIVE_INFINITY,
          easing: style.getPropertyValue("--easing-calm").trim() || "ease-in-out",
        },
      );
    };
    sync();
    reduce?.addEventListener?.("change", sync);
    return () => {
      reduce?.removeEventListener?.("change", sync);
      running?.cancel();
    };
  }, []);
  return (
    <div
      data-slot="intent-prompt-breath"
      aria-hidden="true"
      className="grid flex-none place-items-center rounded-pill bg-focus-soft p-5"
    >
      <i ref={dot} className="block size-7 rounded-pill bg-focus" />
    </div>
  );
}

/**
 * The Gentle overlay in two steps inside a Radix Dialog. "Back to focus" is the one primary in both steps and
 * the initial focus; Escape calls it. Backdrop clicks never dismiss.
 */
export function IntentPrompt({
  open: openProp,
  app: appProp,
  title,
  message,
  waitLabel,
  onReturn,
  onWait,
  onContinue,
}: IntentPromptProps): JSX.Element {
  const app = appProp || "this app";
  const open = openProp !== false;
  const [stepState, setStep] = useState(1);
  const step = onContinue ? stepState : 1;
  const [reason, setReason] = useState<IntentReason | "">("");
  const name = useId();
  const hintId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLFieldSetElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // Reopening or a new app starts again at step 1. Reset during render (previous-value pattern), not in an
  // effect, so no stale step is ever shown.
  const [shown, setShown] = useState({ open, app });
  if (shown.open !== open || shown.app !== app) {
    setShown({ open, app });
    if ((open && !shown.open) || app !== shown.app) {
      setStep(1);
      setReason("");
    }
  }
  // Entering step 2 the "I need" button unmounts, so focus moves to the first reason; VoiceOver reads it
  // with the group's question.
  useEffect(() => {
    if (step === 2) group.current?.querySelector("input")?.focus();
  }, [step]);

  const back = (
    <Button
      key="back"
      variant="primary"
      size="lg"
      onClick={onReturn}
      data-initial-focus={step === 1 ? "true" : undefined}
    >
      Back to focus
    </Button>
  );
  const body =
    step === 1
      ? message || `You opened ${app} during a focus session. Take one breath, then choose.`
      : undefined;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onReturn?.()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="dialog-overlay"
          data-scrim="true"
          className="fixed inset-0 z-overlay grid place-items-center bg-scrim p-3"
        >
          <DialogPrimitive.Content
            aria-modal="true"
            // Step 2 has no description: pass undefined so Radix does not point at a missing id. Step 1 keeps
            // Radix's own link to the Description.
            {...(body ? {} : { "aria-describedby": undefined })}
            data-slot="dialog-content"
            data-intent-prompt="true"
            ref={contentRef}
            className="flex max-h-full w-full max-w-panel-width flex-col items-center gap-5 overflow-auto rounded-lg border border-line-strong bg-surface-overlay p-5 text-center text-ink shadow-overlay"
            onOpenAutoFocus={(event) => {
              const active = document.activeElement as HTMLElement | null;
              opener.current = active && active !== document.body ? active : null;
              event.preventDefault();
              contentRef.current?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (opener.current?.isConnected) opener.current.focus();
            }}
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              if (contentRef.current && !isTopmostLayer(contentRef.current)) event.preventDefault();
            }}
          >
            <DialogPrimitive.Title data-slot="dialog-title" className="m-0 text-title text-ink">
              {title || "Is this what you intended?"}
            </DialogPrimitive.Title>
            {body ? (
              <DialogPrimitive.Description
                data-slot="dialog-description"
                className="m-0 text-body text-ink-muted"
              >
                {body}
              </DialogPrimitive.Description>
            ) : null}
            <Breath />
            {step === 1 ? (
              <div key="step1" className={actions}>
                {back}
                {onWait ? (
                  <Button key="wait" variant="quiet" onClick={onWait}>
                    {waitLabel || "Wait 10 minutes, then decide"}
                  </Button>
                ) : null}
                {onContinue ? (
                  <Button key="need" variant="ghost" onClick={() => setStep(2)}>
                    {`I need ${app} now`}
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                <div key="step2" className="flex w-full flex-col gap-3">
                  <fieldset
                    ref={group}
                    className="os-choice-group justify-center"
                    aria-describedby={hintId}
                  >
                    <legend className="mb-3 w-full p-0 text-heading text-ink">
                      {`What do you need ${app} for?`}
                    </legend>
                    {REASONS.map((value) => (
                      <label className="os-choice" key={value}>
                        <input
                          type="radio"
                          name={name}
                          value={value}
                          checked={reason === value}
                          onChange={() => setReason(value)}
                        />
                        {value}
                      </label>
                    ))}
                  </fieldset>
                  <p id={hintId} className={cn("m-0 text-body-sm text-ink-muted")}>
                    Pick one to continue. Your reason stays on this device.
                  </p>
                </div>
                <div key="step2-actions" className={actions}>
                  <Button
                    key="continue"
                    variant="quiet"
                    aria-disabled={reason ? undefined : "true"}
                    aria-describedby={reason ? undefined : hintId}
                    onClick={() => {
                      if (reason) onContinue?.(reason);
                    }}
                  >
                    {`Continue to ${app}`}
                  </Button>
                  {back}
                </div>
              </>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
