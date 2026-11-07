# Orasenda

Orasenda is a calm, local-first focus and time-management app: macOS first, Windows next, iOS and Android later (see ADR-001 in `docs/DECISIONS.md`).

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
- **Worktrees always live inside this repo, at `.worktrees/<name>`** (git-ignored). Never create them outside the repo. Commits in the main checkout are refused.
- **Every change ends in a pull request.**
  1. Commit on a branch in its worktree.
  2. Push the branch.
  3. Open a PR against `main`.
  Never leave finished work only as local commits, and never push straight to `main`.

## Definition of done
A task is finished only when **all** of these are true. Until then, keep working or say clearly what blocks it.
1. The work is committed on its branch in `.worktrees/<name>`.
2. `./scripts/ci.sh` passes locally.
3. The branch is pushed, and a PR against `main` is open. One task means one PR.
4. The PR description has these sections:
   - **Summary:** what changed and why.
   - **Checks:** what was run and its result.
   - **Not yet verified:** anything untested.
   - **How to review:** where to look first, or how to try it.
5. CI on the PR is green. Check with `gh pr checks`.
6. The last message to the user starts with **"Ready for review:"** followed by the PR link and a two-line summary.

If any step can't be completed, the task is **not** done. Say "Not ready:" and the reason instead.
