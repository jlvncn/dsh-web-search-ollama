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
else
  # Locate the dsh installation so node can resolve its bundled `yaml`.
  DSH_ANCHOR=""
  if command -v dsh >/dev/null 2>&1; then
    DSH_BIN="$(command -v dsh)"
    DSH_REAL="$(python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$DSH_BIN" 2>/dev/null || echo "$DSH_BIN")"
    DSH_ANCHOR="$(dirname "$(dirname "$DSH_REAL")")"
  fi
  cp "$PROFILE_DIR/cordis.patch.yml" "$PROFILE_DIR/cordis.patch.yml.bak.$(date +%s)"
  echo "    merging the bundled patch (backup saved as cordis.patch.yml.bak.*)"
  DSH_ANCHOR="$DSH_ANCHOR" node - "$PROFILE_DIR/cordis.patch.yml" "$PATCH_SRC" "$REPO_DIR" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const [existingPath, patchPath, repoDir] = process.argv.slice(2);
const anchors = [
  process.env.DSH_ANCHOR,
  repoDir,
  '/opt/homebrew/lib/node_modules/@deepseek-ai/dsh',
  '/usr/local/lib/node_modules/@deepseek-ai/dsh',
  '/usr/lib/node_modules/@deepseek-ai/dsh',
].filter(Boolean);
let YAML = null;
for (const anchor of anchors) {
  try { YAML = createRequire(path.join(anchor, 'noop.js'))('yaml'); break; } catch { /* try next */ }
}
if (!YAML) {
  console.error('    ERROR: cannot resolve the `yaml` package (tried the dsh install and the monorepo);');
  console.error('           run `pnpm install` in the monorepo root first.');
  process.exit(1);
}

function readArray(file, what) {
  try {
    const data = YAML.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(data)) return data;
    console.error('    WARN: ' + what + ' is not a YAML array; starting from []');
    return [];
  } catch (e) {
    console.error('    WARN: ' + what + ' is invalid YAML (' + (e.message.split('\n')[0]) + '); starting from []');
    return [];
  }
}

const existing = readArray(existingPath, 'existing cordis.patch.yml');
const patch = readArray(patchPath, 'bundled patch');
if (patch.length === 0) {
  console.error('    ERROR: bundled patch is empty; nothing to merge');
  process.exit(1);
}

function mergeEntry(target, entry) {
  if (entry && typeof entry === 'object' && typeof entry.id === 'string') {
    const idx = target.findIndex((e) => e && typeof e === 'object' && e.id === entry.id);
    if (idx >= 0) {
      const prev = target[idx];
      // Deep-merge config objects so existing keys not named in the patch survive.
      target[idx] = (entry.config && prev.config && typeof entry.config === 'object' && typeof prev.config === 'object')
        ? { ...prev, ...entry, config: { ...prev.config, ...entry.config } }
        : { ...prev, ...entry };
    } else {
      target.push(entry);
    }
    return;
  }
  if (entry && typeof entry === 'object' && Array.isArray(entry.insert)) {
    const existingInsert = target.find((e) => e && typeof e === 'object' && Array.isArray(e.insert));
    if (existingInsert) {
      for (const item of entry.insert) {
        if (!existingInsert.insert.some((i) => i && typeof i === 'object' && i.id === item.id)) {
          existingInsert.insert.push(item);
        }
      }
    } else {
      target.push(entry);
    }
    return;
  }
  target.push(entry);
}

for (const entry of patch) mergeEntry(existing, entry);

// Preserve the original leading comments and blank lines (DSH header).
const lines = fs.readFileSync(existingPath, 'utf8').split('\n');
const header = [];
for (const line of lines) {
  if (/^\s*#/.test(line) || line.trim() === '') header.push(line);
  else break;
}
const out = header.join('\n') + '\n' + YAML.stringify(existing, { lineWidth: 0 });
fs.writeFileSync(existingPath, out);
console.log('    merged patch entries: ' + existing.length + ' top-level entries');
NODE
fi

echo
echo "==> Done. Restart dsh web (or hot-reload the patch), then configure:"
echo "    设置 → 插件设置 → 插件配置 → Ollama 网页搜索"
echo
echo "    Verify the loader picked both halves up:"
echo "    curl -s -X POST http://127.0.0.1:3080/api/pluginInventory/list \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"type\":\"client-request\",\"rpcId\":\"v\",\"method\":\"pluginInventory/list\",\"payload\":{\"args\":{}}}'"
