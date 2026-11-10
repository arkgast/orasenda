# Orasenda task runner. `just --list` shows every recipe.
# All checks live in `ci`; scripts/ci.sh runs it for baton validate and GitHub Actions.

set shell := ["bash", "-euo", "pipefail", "-c"]
set windows-shell := ["bash", "-euo", "pipefail", "-c"]
set script-interpreter := ["bash", "-euo", "pipefail"]

python := if os_family() == "windows" { "python" } else { "python3" }
mobile_targets := "--target aarch64-apple-ios --target aarch64-linux-android"

default:
    @"{{ just_executable() }}" --list

# Run the app with hot reload (Vite dev server and a debug Tauri build).
dev:
    pnpm --filter orasenda tauri dev

# Build the app (release; on macOS a .app and .dmg under target/release/bundle).
build:
    pnpm --filter orasenda tauri build

# Regenerate apps/orasenda/src/bindings.ts from the Rust commands and events.
bindings:
    cargo test -p orasenda --locked export_bindings

# Format Rust and TypeScript in place.
fmt:
    cargo fmt --all
    pnpm exec biome check --write .

# Lint Rust and TypeScript without changing files.
lint:
    cargo clippy --workspace --all-targets --locked -- -D warnings
    pnpm exec biome lint .
    "{{ just_executable() }}" tailwind-strict

# Run every test suite.
test:
    cargo test --workspace --locked
    pnpm --filter orasenda test
    pnpm --filter @orasenda/tokens test
    pnpm --filter @orasenda/ui test

# Check the declared colour pairs (verification/contrast-pairs.json) in both themes.
contrast:
    {{ python }} -m unittest discover -s verification -p "contrast_test.py"
    {{ python }} verification/contrast.py

# Regenerate packages/tokens/tokens.css and theme.css from packages/tokens/tokens.json.
tokens:
    pnpm --filter @orasenda/tokens build

# Build the Design System artifact's files (components/bundle.js, bundle.css, index.d.ts, lib/, previews,
# README, tokens.json, design-system.json) into design/system/ (git-ignored), or into --out <dir>.
design-system *args:
    pnpm --filter @orasenda/ui design-system {{ args }}

# Fails on an arbitrary Tailwind value (w-[13px], bg-(--x), text-[#fff]) in packages/ui/src or apps/orasenda/src.
tailwind-strict:
    node tools/tailwind-strict.ts

# Build the library, then typecheck the app's type test against the built declarations.
ui-build:
    pnpm --filter @orasenda/ui build
    pnpm --filter @orasenda/ui design-system --out dist/system
    pnpm --filter orasenda exec tsc -p tsconfig.ui-built.json

# Build the Design System artifact files into a scratch folder and load them as classic scripts.
design-system-check:
    "{{ just_executable() }}" design-system --out "$(mktemp -d)"
    pnpm --filter @orasenda/ui exec vitest run designSystem.test.ts

# Every check, fastest first. Stops at the first failure.
ci:
    @# Scan commits after CI_BASE_REF (CI passes the PR base or the pushed range); empty means origin/main.
    @base="${CI_BASE_REF:-origin/main}"; echo "==> secrets (gitleaks, commits ${base}..HEAD)"; gitleaks git --no-banner --redact --log-opts="${base}..HEAD"
    @echo "==> docs-only classifier (tests)"
    ./scripts/docs-only.test.sh
    @echo "==> install (pnpm, frozen lockfile)"
    pnpm install --frozen-lockfile --prefer-offline
    @echo "==> format (rustfmt)"
    cargo fmt --all --check
    @echo "==> format, lint, imports (biome)"
    pnpm exec biome ci .
    @echo "==> core boundary (no tauri, tao, wry, objc2, block2, windows, windows-core or SQLite)"
    "{{ just_executable() }}" core-boundary
    @echo "==> core purity (no target_os in core)"
    "{{ just_executable() }}" core-purity
    @echo "==> contrast (self test, then the declared pairs)"
    "{{ just_executable() }}" contrast
    @echo "==> tokens (tokens.css and theme.css are up to date)"
    "{{ just_executable() }}" tokens
    git diff --exit-code -- packages/tokens/tokens.css packages/tokens/theme.css
    @echo "==> tokens (tests)"
    pnpm --filter @orasenda/tokens test
    @echo "==> lint (no arbitrary Tailwind values)"
    "{{ just_executable() }}" tailwind-strict
    @echo "==> ui (typecheck)"
    pnpm --filter @orasenda/ui typecheck
    @echo "==> typecheck (verification)"
    pnpm --filter @orasenda/ui exec tsc -p ../../verification/layout/tsconfig.json
    @echo "==> ui (tests)"
    pnpm --filter @orasenda/ui test
    @echo "==> ui (library build and the app's types against it)"
    "{{ just_executable() }}" ui-build
    @echo "==> design system (files build and load as classic scripts)"
    "{{ just_executable() }}" design-system-check
    @echo "==> typecheck (tsc)"
    pnpm --filter orasenda typecheck
    @echo "==> test (vitest)"
    pnpm --filter orasenda test
    @echo "==> lint (clippy)"
    cargo clippy --workspace --all-targets --locked -- -D warnings
    @echo "==> test (cargo)"
    cargo test --workspace --locked
    @echo "==> layout (real-engine WebKit checks, macOS only)"
    "{{ just_executable() }}" layout
    @echo "==> bindings (committed and current)"
    git ls-files --error-unmatch apps/orasenda/src/bindings.ts
    git diff --exit-code -- apps/orasenda/src/bindings.ts
    @echo "==> mobile (cargo check core, store and app for iOS and Android)"
    "{{ just_executable() }}" mobile
    @echo "==> app build (debug, no bundle)"
    pnpm --filter orasenda tauri build --debug --no-bundle --ci

# Serve the specimens for a person (VoiceOver pass, screenshots): http://localhost:4179/?c=Seed&theme=dark
specimens:
    pnpm --filter @orasenda/ui specimens --port 4179 --strictPort

# Real-engine layout checks: runs every spec in verification/layout with Playwright WebKit. macOS only
# (other hosts skip); fails with the install command when WebKit is missing.
[script]
layout:
    host="$(uname -s)"
    if [ "$host" != Darwin ]; then
        echo "layout: skipped on $host; the required macOS ci job runs the WebKit checks"
        exit 0
    fi
    if ! node -e "const {webkit}=require('@playwright/test'); process.exit(require('fs').existsSync(webkit.executablePath()) ? 0 : 1)"; then
        echo "layout: Playwright's WebKit is not installed. Run: pnpm exec playwright install webkit" >&2
        exit 1
    fi
    pnpm exec playwright test --config verification/layout/playwright.config.ts

# Fails when orasenda-core source branches on the target OS (ADR-001).
[private]
[script]
core-purity:
    [ -d crates/core/src ] || { echo "core purity: crates/core/src not found" >&2; exit 2; }
    status=0
    raw="$(grep -rnE 'target_os|target_family|target_vendor|cfg(_attr)?!?\((.*[(, ])?(unix|windows) *[,)]' crates/core/src)" || status=$?
    if [ "$status" -eq 1 ]; then
        exit 0
    elif [ "$status" -ne 0 ]; then
        echo "core purity check failed: grep exited $status" >&2
        exit "$status"
    fi
    status=0
    hits="$(grep -vE '^[^:]+:[0-9]+:\s*//' <<<"$raw")" || status=$?
    if [ "$status" -ge 2 ]; then
        echo "core purity check failed: grep exited $status" >&2
        exit "$status"
    fi
    if [ -n "$hits" ]; then
        echo "orasenda-core must not branch on the target OS (ADR-001):" >&2
        echo "$hits" >&2
        exit 1
    fi

# Fails when orasenda-core depends on tauri, tao, wry, objc2, block2, windows, windows-core, rusqlite
# or libsqlite3-sys on any target.
[private]
[script]
core-boundary:
    tree="$(cargo tree -p orasenda-core --locked --target all -e normal,build,dev --prefix none --format '{p}')"
    status=0
    offenders="$(grep -E '^(tauri|tao|wry|objc2|block2)|^windows(-core)? v|^rusqlite|^libsqlite3-sys' <<<"$tree")" || status=$?
    if [ "$status" -eq 0 ]; then
        echo "orasenda-core must not depend on tauri, tao, wry, objc2, block2, windows, windows-core or SQLite (ADR-001, ADR-002, ADR-010):" >&2
        echo "$offenders" >&2
        exit 1
    elif [ "$status" -ne 1 ]; then
        echo "core boundary check failed: grep exited $status" >&2
        exit "$status"
    fi

# Checks core, store and app for iOS and Android. The store builds SQLite from C, so the Android
# target needs the NDK's clang and llvm-ar. NDK lookup, first match wins: ANDROID_NDK_HOME,
# NDK_HOME, ANDROID_NDK_LATEST_HOME, then the newest folder under
# ${ANDROID_HOME:-$HOME/Library/Android/sdk}/ndk/.
# Runs only on macOS: the iOS check builds Objective-C and needs Xcode; on other hosts it skips, and
# the required macOS ci job covers both targets (#78).
[private]
[script]
mobile:
    host="$(uname -s)"
    if [ "$host" != Darwin ]; then
        echo "mobile: skipped on $host; iOS needs Xcode, and the required macOS ci job checks iOS and Android"
        exit 0
    fi
    ndk="${ANDROID_NDK_HOME:-${NDK_HOME:-${ANDROID_NDK_LATEST_HOME:-}}}"
    if [ -z "$ndk" ]; then
        installed=()
        for dir in "${ANDROID_HOME:-$HOME/Library/Android/sdk}"/ndk/*/; do
            [ -d "$dir" ] && installed+=("${dir%/}")
        done
        if [ "${#installed[@]}" -gt 0 ]; then
            ndk="$(printf '%s\n' "${installed[@]}" | sort -V | tail -n 1)"
        fi
    fi
    if [ -z "$ndk" ]; then
        echo "no Android NDK found: set ANDROID_NDK_HOME" >&2
        exit 1
    fi
    # Apple silicon NDKs ship only the darwin-x86_64 folder; its tools run under Rosetta.
    bin="$ndk/toolchains/llvm/prebuilt/$(uname -s | tr '[:upper:]' '[:lower:]')-x86_64/bin"
    if [ ! -x "$bin/aarch64-linux-android24-clang" ]; then
        echo "the Android NDK at $ndk has no $bin/aarch64-linux-android24-clang" >&2
        exit 1
    fi
    export CC_aarch64_linux_android="$bin/aarch64-linux-android24-clang"
    export AR_aarch64_linux_android="$bin/llvm-ar"
    cargo check -p orasenda-core -p orasenda-store -p orasenda --locked {{ mobile_targets }}
