#!/usr/bin/env bash
# Tests scripts/docs-only.sh. Needs only bash and git.
set -euo pipefail
script="$(cd "$(dirname "$0")" && pwd)/docs-only.sh"
failures=0

expect() { # name, expected, actual
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected $2, got $3"; failures=$((failures + 1)); fi
}

classify() { printf '%s\0' "$@" | "$script" --classify; }
expect "docs only" true "$(classify docs/SPEC.md README.md a/b/c.md docs/x.json)"
expect "mixed" false "$(classify docs/SPEC.md src/a.ts)"
expect "empty" false "$(classify)"
expect "lookalikes" false "$(classify notmd docs.txt)"
expect "unusual names" true "$(classify $'docs/we ird "quoted" \xc3\xa9.txt' $'a\nb.md')"
expect "unusual code name" false "$(classify $'we ird "q".ts')"

# Real repo: renames must not hide the old code path.
tmp="$(mktemp -d)"
out="$(mktemp)"
trap 'rm -rf "$tmp" "$out"' EXIT
cd "$tmp"
git init -q -b main .
git config user.email t@example.com
git config user.name t
git config commit.gpgsign false
mkdir -p crates/core/src docs
printf 'fn main() {}\n' > crates/core/src/foo.rs
printf 'code\n' > crates/core/src/bar.rs
git add . && git commit -q -m base

run() { GITHUB_EVENT_NAME=pull_request CI_BASE_REF=main GITHUB_OUTPUT="$out" "$script" >/dev/null && tail -n 1 "$out"; }

git checkout -q -b rename-into-docs
git mv crates/core/src/foo.rs docs/foo.rs
git commit -q -m mv
expect "code renamed into docs/" docs_only=false "$(run)"

git checkout -q main && git checkout -q -b rename-to-md
git mv crates/core/src/bar.rs crates/core/src/bar.md
git commit -q -m mv
expect "code renamed to .md" docs_only=false "$(run)"

git checkout -q main && git checkout -q -b docs-edit
mkdir -p docs && printf "x\n" > docs/new.md
git add . && git commit -q -m docs
expect "docs added" docs_only=true "$(run)"

git checkout -q main && git checkout -q -b empty
expect "no changes" docs_only=false "$(run)"

expect "push event" docs_only=false "$(GITHUB_EVENT_NAME=push GITHUB_OUTPUT="$out" "$script" >/dev/null && tail -n 1 "$out")"

[ "$failures" -eq 0 ] || exit 1
