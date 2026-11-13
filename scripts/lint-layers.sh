#!/usr/bin/env bash
# Layer lint check: lints each apps/orasenda/lint-fixtures/*.ts as if it lived at the virtual path
# named in its "// virtual:" header (relative to apps/orasenda/src/) and checks its "// expect:" header.
# "report" means Biome must report noRestrictedImports; "clean" means it must not.
# Biome 2.6.6 `lint --stdin-file-path` never prints diagnostics (it only returns fixed code), so each
# fixture is copied to its virtual path in a scratch tree that holds only biome.json, and linted by path.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"
dir=apps/orasenda/lint-fixtures
biome="$root/node_modules/.bin/biome"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
cp biome.json "$scratch/biome.json"
failures=0
count=0
for fx in "$dir"/*.ts; do
  [ -f "$fx" ] || continue
  virtual="$(sed -n 's|^// virtual: ||p' "$fx" | head -1)"
  expect="$(sed -n 's|^// expect: ||p' "$fx" | head -1)"
  if [ -z "$virtual" ] || { [ "$expect" != report ] && [ "$expect" != clean ]; }; then
    echo "lint-layers: $fx needs '// virtual: <path>' and '// expect: report|clean' headers"
    failures=$((failures + 1)); continue
  fi
  count=$((count + 1))
  target="apps/orasenda/src/$virtual"
  mkdir -p "$scratch/$(dirname "$target")"
  cp "$fx" "$scratch/$target"
  set +e
  out="$(cd "$scratch" && "$biome" lint --vcs-enabled=false --colors=off "$target" 2>&1)"
  rc=$?
  set -e
  # Biome must really have linted the file: rc 1 for a report, rc 0 and "Checked 1 file" for clean.
  if [ "$expect" = report ] && [ "$rc" -ne 1 ]; then
    echo "lint-layers: $fx: Biome exited $rc, expected 1 (not linted?)"; printf '%s\n' "$out"
    failures=$((failures + 1)); continue
  fi
  if [ "$expect" = clean ] && { [ "$rc" -ne 0 ] || ! printf '%s' "$out" | grep -q 'Checked 1 file'; }; then
    echo "lint-layers: $fx: Biome exited $rc without checking 1 file"; printf '%s\n' "$out"
    failures=$((failures + 1)); continue
  fi
  if printf '%s' "$out" | grep -q 'noRestrictedImports'; then reported=1; else reported=0; fi
  if [ "$expect" = report ] && [ "$reported" = 0 ]; then
    echo "lint-layers: $fx was not reported at $virtual"; failures=$((failures + 1))
  elif [ "$expect" = clean ] && [ "$reported" = 1 ]; then
    echo "lint-layers: $fx was reported at $virtual but should be clean"; failures=$((failures + 1))
  else
    echo "ok   $(basename "$fx") ($expect)"
  fi
done
[ "$count" -gt 0 ] || { echo "lint-layers: no fixtures found in $dir"; exit 1; }
[ "$failures" -eq 0 ] || { echo "lint-layers: $failures problem(s)"; exit 1; }
echo "lint-layers: ok"
