#!/usr/bin/env bash
# Tests scripts/file-size.sh against temp git repos. Needs only bash and git.
set -euo pipefail
script="$(cd "$(dirname "$0")" && pwd)/file-size.sh"
failures=0
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

expect() { # name, expected exit, actual exit, output, [substring]
  local ok=1
  [ "$2" = "$3" ] || ok=0
  if [ -n "${5:-}" ] && ! printf '%s' "$4" | grep -qF -- "$5"; then ok=0; fi
  if [ "$ok" = 1 ]; then echo "ok   $1"; else echo "FAIL $1: expected exit $2 (with '${5:-}'), got $3: $4"; failures=$((failures + 1)); fi
}

lines() { # path, count
  mkdir -p "$(dirname "$1")"
  : > "$1"
  local i=0
  while [ "$i" -lt "$2" ]; do echo "x" >> "$1"; i=$((i + 1)); done
}

# Each case: a fresh repo with a clean small file and an empty allowlist.
fresh() {
  rm -rf "$tmp/repo"; mkdir -p "$tmp/repo"
  cd "$tmp/repo"
  git init -q -b main .
  git config user.email t@example.com; git config user.name t
  lines src/small.rs 10
  mkdir -p scripts; printf '# comment\n' > scripts/file-size-allowlist.txt
}
run() { git add -A; set +e; out="$("$script" 2>&1)"; rc=$?; set -e; }

fresh; run
expect "clean tree passes" 0 "$rc" "$out"

fresh; lines src/big.rs 501; run
expect "new offender fails" 1 "$rc" "$out" "src/big.rs"

fresh; lines src/edge.ts 500; run
expect "exactly 500 passes" 0 "$rc" "$out"

fresh; lines src/big.rs 600; printf '600 src/big.rs\n' >> scripts/file-size-allowlist.txt; run
expect "listed file at its count passes" 0 "$rc" "$out"

fresh; lines src/big.rs 601; printf '600 src/big.rs\n' >> scripts/file-size-allowlist.txt; run
expect "listed file grown fails" 1 "$rc" "$out" "src/big.rs"

fresh; lines src/big.rs 550; printf '600 src/big.rs\n' >> scripts/file-size-allowlist.txt; run
expect "listed file shrunk but still over passes" 0 "$rc" "$out"

fresh; lines src/big.rs 400; printf '600 src/big.rs\n' >> scripts/file-size-allowlist.txt; run
expect "listed file under 500 is stale" 1 "$rc" "$out" "stale"

fresh; printf '600 src/gone.rs\n' >> scripts/file-size-allowlist.txt; run
expect "listed path that no longer exists fails" 1 "$rc" "$out" "src/gone.rs"

fresh
lines apps/orasenda/src/bindings.ts 900
lines packages/tokens/tokens.css 900
lines packages/tokens/theme.css 900
lines pkg/dist/a.js 900
lines crates/x/gen/b.rs 900
lines design/reviews/c.tsx 900
run
expect "generated and archived paths are exempt" 0 "$rc" "$out"

fresh; lines notes.md 900; lines data.json 900; run
expect "other file types are ignored" 0 "$rc" "$out"

fresh; lines "src/with space.tsx" 501; run
expect "paths with spaces are checked" 1 "$rc" "$out" "with space.tsx"

[ "$failures" = 0 ] || { echo "$failures failure(s)"; exit 1; }
echo "all file-size tests passed"
