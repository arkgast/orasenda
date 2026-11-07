#!/usr/bin/env bash
# The one entry point for checks. baton validate and GitHub Actions both run this,
# so local and CI checks never drift. Add new checks here, fastest first.
set -euo pipefail

base="${CI_BASE_REF:-origin/main}"

echo "==> secrets (gitleaks, commits ${base}..HEAD)"
gitleaks git --no-banner --redact --log-opts="${base}..HEAD"
