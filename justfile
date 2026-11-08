# Orasenda task runner. `just --list` shows every recipe.
# All checks live in `ci`; scripts/ci.sh runs it for baton validate and GitHub Actions.

set shell := ["bash", "-euo", "pipefail", "-c"]
set windows-shell := ["bash", "-euo", "pipefail", "-c"]
set script-interpreter := ["bash", "-euo", "pipefail"]

mobile_targets := "--target aarch64-apple-ios --target aarch64-linux-android"

default:
    @"{{ just_executable() }}" --list

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

# Regenerate packages/tokens/tokens.css from design/system/tokens.json.
tokens:
    pnpm --filter @orasenda/tokens build

# Every check, fastest first. Stops at the first failure.
ci:
    @# Scan commits after CI_BASE_REF (CI passes the PR base or the pushed range); empty means origin/main.
    @base="${CI_BASE_REF:-origin/main}"; echo "==> secrets (gitleaks, commits ${base}..HEAD)"; gitleaks git --no-banner --redact --log-opts="${base}..HEAD"
    @echo "==> install (pnpm, frozen lockfile)"
    pnpm install --frozen-lockfile --prefer-offline
    @echo "==> format (rustfmt)"
    cargo fmt --all --check
    @echo "==> format, lint, imports (biome)"
    pnpm exec biome ci .
    @echo "==> core boundary (no tauri, tao, wry, objc2, block2, windows or windows-core)"
    "{{ just_executable() }}" core-boundary
    @echo "==> tokens (tokens.css is up to date)"
    "{{ just_executable() }}" tokens
    git diff --exit-code -- packages/tokens/tokens.css
    @echo "==> tokens (tests)"
    pnpm --filter @orasenda/tokens test
    @echo "==> lint (clippy)"
    cargo clippy --workspace --all-targets --locked -- -D warnings
    @echo "==> test (cargo)"
    cargo test --workspace --locked
    @echo "==> core mobile (cargo check for iOS and Android)"
    cargo check -p orasenda-core --locked {{ mobile_targets }}

# Fails when orasenda-core depends on tauri, tao, wry, objc2, block2, windows or windows-core on any target.
[private]
[script]
core-boundary:
    tree="$(cargo tree -p orasenda-core --locked --target all -e normal,build,dev --prefix none --format '{p}')"
    status=0
    offenders="$(grep -E '^(tauri|tao|wry|objc2|block2)|^windows(-core)? v' <<<"$tree")" || status=$?
    if [ "$status" -eq 0 ]; then
        echo "orasenda-core must not depend on tauri, tao, wry, objc2, block2, windows or windows-core (ADR-001, ADR-010):" >&2
        echo "$offenders" >&2
        exit 1
    elif [ "$status" -ne 1 ]; then
        echo "core boundary check failed: grep exited $status" >&2
        exit "$status"
    fi
