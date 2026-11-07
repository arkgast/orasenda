# Orasenda

Orasenda is a calm, local-first macOS focus and time-management app.

## Sources of truth
- What we build and why: `docs/SPEC.md`. Phases: `docs/ROADMAP.md`. Decisions: `docs/DECISIONS.md`.
- How it looks and behaves: the **Orasenda design system**.
  - Live version: https://claude.ai/artifact/Sk5N75HzRwY8v7dBxhsH73
  - Repo copy: `design/system/`
  - Start with `design/system/README.md`, then `tokens.json` and `components/<Name>/README.md`.
- Design review history: `design/reviews/`.

## UI rules (every change that touches UI)
1. **Build only from the design system.**
   - Use tokens for every color, font, size, spacing, radius, shadow and duration.
   - Never hard-code a hex value, px spacing or font name in app code.
   - Reuse an existing component before writing a new one.
2. **Follow the spec's principles** (SPEC section 1 and design system README):
   - one primary action per screen;
   - state is never shown by color alone: always a word or shape too;
   - no red for time or performance; `amber` means "almost up", and `critical` is only for destructive actions;
   - copy is kind and plain, with no shaming, exclamation marks or emoji;
   - motion is slow and disappears under reduce-motion.
3. **Accessibility is part of done:**
   - contrast of 4.5:1 for text and 3:1 for UI marks, in both themes;
   - a visible keyboard focus ring;
   - VoiceOver labels;
   - hit targets from the design system README.
4. **Both themes, every time.** Check light and dark before calling UI work done.

## Keeping the design system in sync
Current mode: **design-first** (until the end of P1). The artifact is the source of truth.
- **To add or change a component or token:**
  1. Update the design system artifact first: ask Claude to "update the Orasenda design system", which reads the live version, changes only what's needed and republishes it.
  2. Refresh `design/system/` from it in the same change.
  3. Then implement in code.
- **Don't edit `design/system/` by hand** without also updating the artifact; the two must match.
- **After P1:** switch to **code-first**. App tokens and components become the source, and `/design-sync` in Claude Code pushes them to the design system, which then becomes read-only. Update this section when that switch happens.

## Workflow
- This repo uses baton (`.baton/config.json`):
  spec → plan → backlog → implement → verify → review → integrate.
- Checks run through `./scripts/ci.sh`.
