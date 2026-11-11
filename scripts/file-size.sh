#!/usr/bin/env bash
# Size guard: a tracked source file is at most 500 lines, tests included.
# Offenders that predate the guard are listed in scripts/file-size-allowlist.txt
# as "<lines> <path>". The list only shrinks. Portable to bash 3.2 and Linux.
set -euo pipefail

limit=500
root="$(git rev-parse --show-toplevel)"
cd "$root"
allowlist="${FILE_SIZE_ALLOWLIST:-scripts/file-size-allowlist.txt}"

listed_paths=()
listed_counts=()
if [ -f "$allowlist" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    count="${line%% *}"
    path="${line#* }"
    listed_counts+=("$count")
    listed_paths+=("$path")
  done < "$allowlist"
fi

listed_count_of() { # path -> count, or empty
  local i=0
  while [ "$i" -lt "${#listed_paths[@]}" ]; do
    if [ "${listed_paths[$i]}" = "$1" ]; then echo "${listed_counts[$i]}"; return; fi
    i=$((i + 1))
  done
}

exempt() {
  case "$1" in
    apps/orasenda/src/bindings.ts | packages/tokens/tokens.css | packages/tokens/theme.css) return 0 ;;
    dist/* | */dist/* | gen/* | */gen/* | design/reviews/*) return 0 ;;
  esac
  return 1
}

failures=0
fail() { echo "file-size: $1"; failures=$((failures + 1)); }

while IFS= read -r -d '' path; do
  exempt "$path" && continue
  [ -f "$path" ] || continue
  n="$(wc -l < "$path" | tr -d ' ')"
  listed="$(listed_count_of "$path")"
  if [ -z "$listed" ]; then
    [ "$n" -le "$limit" ] || fail "$path has $n lines (limit $limit); split it"
  elif [ "$n" -le "$limit" ]; then
    fail "$path is stale in the allowlist: now $n lines (limit $limit); remove its entry"
  elif [ "$n" -gt "$listed" ]; then
    fail "$path grew to $n lines (allowlist says $listed); split it, do not grow it"
  fi
done < <(git ls-files -z -- '*.rs' '*.ts' '*.tsx' '*.js' '*.css')

for p in ${listed_paths[@]+"${listed_paths[@]}"}; do
  [ -f "$p" ] || fail "$p is in the allowlist but does not exist; remove its entry"
done

if [ "$failures" -gt 0 ]; then
  echo "file-size: $failures problem(s)"
  exit 1
fi
echo "file-size: ok"
