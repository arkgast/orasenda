# Orasenda task runner. `just --list` shows every recipe.
# All checks live in `ci`; scripts/ci.sh runs it for baton validate and GitHub Actions.

set shell := ["bash", "-euo", "pipefail", "-c"]
set windows-shell := ["bash", "-euo", "pipefail", "-c"]
set script-interpreter := ["bash", "-euo", "pipefail"]

# Commits to scan for secrets start after this ref (CI passes the PR base or the pushed range).
base := env("CI_BASE_REF", "origin/main")
mobile_targets := "--target aarch64-apple-ios --target aarch64-linux-android"

default:
    @just --list

# Format Rust and TypeScript in place.
fmt:
    cargo fmt --all
    pnpm exec biome check --write .

# Lint Rust and TypeScript without changing files.
lint:
    cargo clippy --workspace --all-targets --locked -- -D warnings
    pnpm exec biome lint .

# Run every test suite.
test:
    cargo test --workspace --locked

# Every check, fastest first. Stops at the first failure.
ci:
    @echo "==> secrets (gitleaks, commits {{ base }}..HEAD)"
    gitleaks git --no-banner --redact --log-opts="{{ base }}..HEAD"
    @echo "==> install (pnpm, frozen lockfile)"
    pnpm install --frozen-lockfile --prefer-offline
    @echo "==> format (rustfmt)"
    cargo fmt --all --check
    @echo "==> format, lint, imports (biome)"
    pnpm exec biome ci .
    @echo "==> core boundary (no tauri, tao or wry)"
    "{{ just_executable() }}" core-boundary
    @echo "==> lint (clippy)"
    cargo clippy --workspace --all-targets --locked -- -D warnings
    @echo "==> test (cargo)"
    cargo test --workspace --locked
    @echo "==> core mobile (cargo check for iOS and Android)"
    cargo check -p orasenda-core --locked {{ mobile_targets }}

# Fails when orasenda-core depends on tauri, tao or wry on any target.
[private]
[script]
core-boundary:
    tree="$(cargo tree -p orasenda-core --locked --target all -e normal,build,dev --prefix none --format '{p}')"
    if offenders="$(grep -E '^(tauri|tao|wry)' <<<"$tree")"; then
        echo "orasenda-core must not depend on tauri, tao or wry (ADR-001):" >&2
        echo "$offenders" >&2
        exit 1
    fi
