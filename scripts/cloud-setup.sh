#!/usr/bin/env bash
# Sets up a Claude Code cloud session (Ubuntu 24.04, root) to build and test Orasenda.
# It is the environment's setup script: it runs from the folder that holds the checkout,
# before Claude starts. It also works from the repo root: `sudo ./scripts/cloud-setup.sh`.
# Idempotent. GitHub release downloads are blocked there, so just and gitleaks are built
# from crates.io and the Go proxy instead of the release archives CI uses.
set -euo pipefail

# Tauri v2 Linux build dependencies (clippy, cargo test and the app build of apps/orasenda),
# plus Xvfb to run the app without a display.
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev librsvg2-dev libayatana-appindicator3-dev libssl-dev \
  libxdo-dev pkg-config build-essential file xvfb

# Node 24.22.2 (.node-version) and pnpm 12.18.0 (packageManager), linked into ~/.local/bin,
# which comes before the image's /opt/node22/bin on PATH.
NODE_V=24.22.2
BIN="$HOME/.local/bin"
mkdir -p "$BIN"
N="/opt/node-v$NODE_V-linux-x64/bin"
if [ ! -x "$N/node" ]; then
  curl -fsSL "https://nodejs.org/dist/v$NODE_V/node-v$NODE_V-linux-x64.tar.xz" | tar -xJ -C /opt
fi
for b in node npm npx corepack; do ln -sf "$N/$b" "$BIN/$b"; done
"$N/npm" install -g pnpm@12.18.0
ln -sf "$N/pnpm" "$BIN/pnpm"
export PATH="$BIN:$PATH"

# just 1.59.0 and gitleaks 8.30.1, the versions .github/workflows/ci.yml pins.
command -v just >/dev/null || cargo install --locked --root /usr/local just@1.59.0
if ! command -v gitleaks >/dev/null; then
  GOBIN=/usr/local/bin go install \
    -ldflags "-X github.com/zricethezav/gitleaks/v8/version.Version=v8.30.1" \
    github.com/zricethezav/gitleaks/v8@v8.30.1
fi

# The Rust toolchain from rust-toolchain.toml, and the workspace's JS dependencies.
repo=""
if [ -f rust-toolchain.toml ] && [ -f pnpm-workspace.yaml ]; then
  repo="."
elif [ -d orasenda ]; then
  repo="orasenda"
fi
if [ -n "$repo" ]; then
  (cd "$repo" && rustup toolchain install && pnpm install --frozen-lockfile)
fi
