#!/usr/bin/env bash
# =============================================================================
# dsh-web-search-ollama — install into a DeepSeek Harness profile
#
# Copies both plugin packages (host + browser half) into the profile's hoisted
# node_modules and merges the loader patch into cordis.patch.yml.
#
# The browser half is what puts the configure control on the host plugin's row
# on the Plugins page: harness >= 0.1.7 shows that control only when a client
# plugin registers the keyed slot `plugins.row.config` under the key
# `@jlvncn/dsh-web-search-ollama#web-search-ollama`.
#
# Usage:
#   ./scripts/install.sh            # install into the default "web" profile
#   ./scripts/install.sh <profile>  # install into another profile
#
# No network access is required — the packages are copied verbatim from this
# repo. After installing, (re)start `dsh web` and open
# Web sidebar -> Plugins -> bundle @jlvncn/dsh-web-search-ollama -> row
#   web-search-ollama -> Configure   to configure (harness >= 0.1.7; the
#   Settings plugin list is read-only and holds no editable forms).
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
# npm packages are scoped (@jlvncn/...), so they install under a scope dir.
HOST_DST="$NM_DIR/@jlvncn/dsh-web-search-ollama"
CLIENT_DST="$NM_DIR/@jlvncn/dsh-web-search-ollama-client"

echo "==> Installing @jlvncn/dsh-web-search-ollama into profile '$PROFILE'"

# --- 1. host package ---------------------------------------------------------
echo "==> host package   -> $HOST_DST"
mkdir -p "$HOST_DST"
cp "$HOST_PKG/index.js"       "$HOST_DST/index.js"
cp "$HOST_PKG/package.json"   "$HOST_DST/package.json"
cp "$HOST_PKG/cordis.patch.yml" "$HOST_DST/cordis.patch.yml"

# --- 2. browser half (the Plugins page configure control) -------------------
echo "==> client package -> $CLIENT_DST"
mkdir -p "$CLIENT_DST"
cp "$CLIENT_PKG/index.js"       "$CLIENT_DST/index.js"
cp "$CLIENT_PKG/client.js"      "$CLIENT_DST/client.js"
cp "$CLIENT_PKG/package.json"   "$CLIENT_DST/package.json"
cp "$CLIENT_PKG/cordis.patch.yml" "$CLIENT_DST/cordis.patch.yml"

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
echo "    侧边栏 Plugins → 组合包 @jlvncn/dsh-web-search-ollama → 行 web-search-ollama → 配置"
echo
echo "    Verify the loader picked both halves up:"
echo "    curl -s -X POST http://127.0.0.1:3080/api/pluginInventory/list \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"type\":\"client-request\",\"rpcId\":\"v\",\"method\":\"pluginInventory/list\",\"payload\":{\"args\":{}}}'"
