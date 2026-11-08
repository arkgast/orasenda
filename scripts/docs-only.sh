#!/usr/bin/env bash
# Decides whether a pull request changes only docs (docs/** or any *.md), so CI can skip the heavy checks.
# Needs only bash and git: the docs-only CI path installs no node, rust or just.
#
#   docs-only.sh              CI mode: prints the changed files and the decision, and appends
#                             docs_only=true|false to $GITHUB_OUTPUT. Reads GITHUB_EVENT_NAME and CI_BASE_REF.
#   docs-only.sh --classify   Reads NUL-separated paths on stdin and prints true or false.
#
# Fails closed: anything but a non-empty diff on a pull_request prints false (run everything).
set -euo pipefail

classify() {
  local path any=false
  while IFS= read -r -d '' path; do
    any=true
    case "$path" in
      docs/* | *.md) ;;
      *)
        echo false
        return
        ;;
    esac
  done
  echo "$any"
}

if [ "${1:-}" = --classify ]; then
  classify
  exit 0
fi

docs_only=false
if [ "${GITHUB_EVENT_NAME:-}" = pull_request ]; then
  # --no-renames: a moved file lists its old path as a deletion, so code renamed into docs/ or to *.md still counts as code.
  # -z: paths are NUL-separated and never quoted, so unusual names are matched as they are.
  if files="$(git diff --name-only --no-renames -z "${CI_BASE_REF:?}"...HEAD | tr '\0' '\001')" && [ -n "$files" ]; then
    echo "Changed files:"
    printf '%s' "$files" | tr '\001' '\n'
    echo
    docs_only="$(printf '%s' "$files" | tr '\001' '\0' | classify)"
  else
    echo "No changed files found, or the diff failed: running every check."
  fi
else
  echo "Not a pull request: running every check."
fi
echo "docs_only=$docs_only"
echo "docs_only=$docs_only" >> "${GITHUB_OUTPUT:-/dev/null}"
