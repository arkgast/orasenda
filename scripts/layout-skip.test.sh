#!/usr/bin/env bash
# Tests the ORASENDA_LAYOUT=skip branch of `just layout` and the `just ci` default. Needs only bash and just.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
failures=0

expect() { # name, expected, actual
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected $2, got $3"; failures=$((failures + 1)); fi
}

# A stub pnpm first on PATH: the skip branch must never reach it.
stubs="$(mktemp -d)"
trap 'rm -rf "$stubs"' EXIT
printf '#!/usr/bin/env bash\necho "pnpm was called" >&2\nexit 97\n' > "$stubs/pnpm"
chmod +x "$stubs/pnpm"

cd "$root"
rc=0
out="$(PATH="$stubs:$PATH" ORASENDA_LAYOUT=skip just layout 2>&1)" || rc=$?
expect "skip exits 0" 0 "$rc"
expect "skip prints the line" "layout: skipped (ORASENDA_LAYOUT=skip; run just ci-full or just layout)" "$out"

# `just ci` skips layout unless the caller sets ORASENDA_LAYOUT; `just ci-full` sets it to run (#743).
ci_skips="$(just --dry-run ci 2>&1 | grep -cF 'ORASENDA_LAYOUT="${ORASENDA_LAYOUT:-skip}"' || true)"
expect "just ci defaults layout to skip" 1 "$ci_skips"
full_runs="$(just --dry-run ci-full 2>&1 | grep -cF 'ORASENDA_LAYOUT=run' || true)"
expect "just ci-full runs layout" 1 "$full_runs"

# Args pass through to Playwright (Darwin only: other hosts skip before pnpm).
if [ "$(uname -s)" = Darwin ]; then
  printf '#!/usr/bin/env bash\necho "$*" > "%s/args"\n' "$stubs" > "$stubs/pnpm"
  rc=0
  out="$(PATH="$stubs:$PATH" ORASENDA_LAYOUT=skip just layout verification/layout/x.spec.ts --shard=1/4 2>&1)" || rc=$?
  if [[ $out == *"WebKit is not installed"* ]]; then
    echo "skip pass-through (WebKit not installed here)"
  else
    expect "args run pnpm" 0 "$rc"
    case "$(cat "$stubs/args" 2>/dev/null)" in
      *"--shard=1/4"*) echo "ok   --shard reaches playwright" ;;
      *) echo "FAIL --shard did not reach playwright"; failures=$((failures + 1)) ;;
    esac
  fi
fi

[ "$failures" -eq 0 ]
