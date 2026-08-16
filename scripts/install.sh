#!/usr/bin/env bash
# =============================================================================
# dsh-web-search-ollama — install into a DeepSeek Harness profile
#
# Copies the two plugin packages (host + client) into the profile's hoisted
# node_modules and merges the loader patch into cordis.patch.yml.
#
# Usage:
#   ./scripts/install.sh            # install into the default "web" profile
#   ./scripts/install.sh <profile>  # install into another profile
#
# No network access is required — the packages are copied verbatim from this
# repo. After installing, (re)start `dsh web` and open
# 设置 → 插件设置 → 插件配置 → Ollama 网页搜索  to configure.
# =============================================================================
set -euo pipefail

PROFILE="${1:-web}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
NM_DIR="$DSH_HOME/profiles/node_modules"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

HOST_PKG="$REPO_DIR/packages/dsh-web-search-ollama"
CLIENT_PKG="$REPO_DIR/packages/dsh-web-search-ollama-client"
PATCH_SRC="$REPO_DIR/profile/cordis.patch.yml"

echo "==> Installing dsh-web-search-ollama into profile '$PROFILE'"

# --- 1. host package ---------------------------------------------------------
echo "==> host package   -> $NM_DIR/dsh-web-search-ollama"
mkdir -p "$NM_DIR/dsh-web-search-ollama"
cp "$HOST_PKG/index.js"       "$NM_DIR/dsh-web-search-ollama/index.js"
cp "$HOST_PKG/package.json"   "$NM_DIR/dsh-web-search-ollama/package.json"

# --- 2. client package -------------------------------------------------------
echo "==> client package -> $NM_DIR/dsh-web-search-ollama-client"
mkdir -p "$NM_DIR/dsh-web-search-ollama-client"
cp "$CLIENT_PKG/index.js"     "$NM_DIR/dsh-web-search-ollama-client/index.js"
cp "$CLIENT_PKG/client.js"    "$NM_DIR/dsh-web-search-ollama-client/client.js"
cp "$CLIENT_PKG/package.json" "$NM_DIR/dsh-web-search-ollama-client/package.json"

# --- 3. loader patch (cordis.patch.yml) --------------------------------------
echo "==> loader patch    -> $PROFILE_DIR/cordis.patch.yml"
if [ ! -f "$PROFILE_DIR/cordis.patch.yml" ]; then
  echo "    profile has no cordis.patch.yml yet; copying the bundled example"
  mkdir -p "$PROFILE_DIR"
  cp "$PATCH_SRC" "$PROFILE_DIR/cordis.patch.yml"
elif grep -q "web-search-ollama" "$PROFILE_DIR/cordis.patch.yml"; then
  echo "    already contains web-search-ollama entries; leaving it untouched"
else
  cp "$PROFILE_DIR/cordis.patch.yml" "$PROFILE_DIR/cordis.patch.yml.bak.$(date +%s)"
  { cat "$PROFILE_DIR/cordis.patch.yml"; echo; cat "$PATCH_SRC"; } > "$PROFILE_DIR/cordis.patch.yml.tmp"
  mv "$PROFILE_DIR/cordis.patch.yml.tmp" "$PROFILE_DIR/cordis.patch.yml"
  echo "    merged the bundled patch (backup saved as cordis.patch.yml.bak.*)"
fi

echo
echo "==> Done. Restart dsh web (or hot-reload the patch), then configure:"
echo "    设置 → 插件设置 → 插件配置 → Ollama 网页搜索"
echo
echo "    Verify the loader picked both halves up:"
echo "    curl -s -X POST http://127.0.0.1:3080/api/pluginInventory/list \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"type\":\"client-request\",\"rpcId\":\"v\",\"method\":\"pluginInventory/list\",\"payload\":{\"args\":{}}}'"
