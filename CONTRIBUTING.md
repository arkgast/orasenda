# Contributing to Orasenda

Thank you for helping. Orasenda is a calm, local-first focus and time app, and contributions are
welcome under the terms below.

## Licence and sign-off
- Orasenda is licensed under the [Mozilla Public License 2.0](LICENSE). By contributing, you agree
  that your contribution is licensed under the MPL-2.0. A directory with its own `LICENSE` file
  (for example a future `crates/sync-protocol` under Apache-2.0) uses that licence instead.
- You keep the copyright to your contribution. There is no contributor licence agreement.
- Every commit must be signed off under the [Developer Certificate of Origin 1.1](DCO), which
  certifies that you have the right to submit it. Add the sign-off with `git commit -s`:
  ```
  Signed-off-by: Your Name <you@example.com>
  ```
- The name and logo are covered by the [trademark policy](TRADEMARKS.md): forks are welcome under
  a different name.

## What we accept
- Bug fixes, accessibility improvements, documentation and tests: open a pull request.
- New features or modules: open an issue first. They follow the project's spec → plan →
  implementation workflow (see [CLAUDE.md](CLAUDE.md) and `.baton/config.json`), so a short spec
  comes before code.
- The product principles in [docs/SPEC.md](docs/SPEC.md) are not negotiable: calm by default, the
  user in control, private by design. No telemetry, ads or tracking without explicit opt-in.

## How to contribute
1. Work on a branch; keep one change per pull request.
2. Run `./scripts/ci.sh` before pushing. CI runs the same script.
3. Fill in the pull request sections: Summary, Checks, Not yet verified, How to review.
4. UI changes use the design system only (see [CLAUDE.md](CLAUDE.md)) and are checked in light
   and dark themes.
