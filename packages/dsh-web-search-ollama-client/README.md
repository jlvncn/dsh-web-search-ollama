# dsh-web-search-ollama-client

**Browser half** of the Ollama web-search plugin for DeepSeek Harness. Runs in
the browser and registers the **Ollama 网页搜索** configuration card in the Web
UI's 设置 → 插件设置 → 插件配置 tab (the `settings.plugin.item` slot).

## How it works

- `client.js` is a hand-written `window.__ModuleLoader__.load({...})` bundle
  (no build step) that:
  - injects the card styles (theme tokens, mirrors the official `PluginCard`)
  - binds the `web-search-ollama` settings namespace via `settingsScope`
  - renders a **collapsible card** (header + chevron, like the built-in cards)
    with 7 editable fields and save/reset actions; writes hot-apply via the
    host settings provider (no restart).
- `index.js` is an empty host-side `apply()` — the entry must exist in the
  Cordis loader so `dsh-client-modules` discovers the client bundle.

## Why it must be a separate package

`dsh-client-modules` scans loader entries for package names whose
`package.json` declares `exports["./client"]` + `dsh.client`. Hence the client
half is a distinct package:

```json
{
  "name": "dsh-web-search-ollama-client",
  "exports": { "./client": "./client.js" },
  "dsh": { "client": { "platform": "web" } }
}
```

and is mounted in `cordis.patch.yml` as `name: 'dsh-web-search-ollama-client'`.

## Install

Copy `index.js` + `client.js` + `package.json` into
`$DSH_HOME/profiles/node_modules/dsh-web-search-ollama-client/` (the repo's
`./scripts/install.sh` does this). Always keep it paired with the host package
`dsh-web-search-ollama` — the card edits the namespace that the host registers.
