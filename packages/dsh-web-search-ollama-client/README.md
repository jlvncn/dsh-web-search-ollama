# @jlvncn/dsh-web-search-ollama-client

**Browser half** of the Ollama web-search plugin for DeepSeek Harness. Runs in
the browser and provides the **configure control** on the host plugin's row in
the Web UI's **Plugins page** (sidebar → Plugins → bundle
`@jlvncn/dsh-web-search-ollama` → row `web-search-ollama` → 配置).

> Harness >= 0.1.7 contract: a bundle row only gains its configure control
> when a client plugin registers the **keyed slot** `plugins.row.config` under
> the key `<bundle package name>#<row id>` — here
> `@jlvncn/dsh-web-search-ollama#web-search-ollama`. There is no auto-generated
> fallback page; without this package the row's config form has no UI entry.

## How it works

- `client.js` is a hand-written `window.__ModuleLoader__.load({...})` bundle
  (no build step) that:
  - injects `["slots", "locale", "configForms"]`
  - waits for the host to serve the `web-search-ollama` namespace
    (`ctx.configForms.whileServed([...])`), then registers the keyed slot
    `plugins.row.config` with a card built from the official
    `@deepseek-ai/dsh-client-ui-primitives` (`SettingsForm` /
    `SettingsValueField` / `SettingsSecretField`)
  - stages edits locally and writes them on save via
    `form.mutate(ops, revision)` (path ops + revision fence, durable, hot-applied
    by the host — no restart). The `apiKey` field is write-only; the host-only
    `enableFetchProvider` switch is intentionally not exposed here.
  - ships zh/en dictionaries through `ctx.locale`.
- `index.js` is an empty host-side `apply()` — the entry must exist in the
  Cordis loader so `dsh-client-modules` discovers the client bundle.

## Why it must be a separate package

`dsh-client-modules` scans loader entries for package names whose
`package.json` declares `exports["./client"]` + `dsh.client`. Hence the client
half is a distinct package:

```json
{
  "name": "@jlvncn/dsh-web-search-ollama-client",
  "exports": { "./client": "./client.js" },
  "dsh": { "client": { "platform": "web", "inject": [
    "@deepseek-ai/dsh-client-ui-plugin-manager",
    "@deepseek-ai/dsh-client-ui-primitives"
  ] } }
}
```

and is mounted by its own bundle patch as
`name: '@jlvncn/dsh-web-search-ollama-client'` (quote it — a YAML plain scalar
may not start with `@`).

## Install

```bash
dsh plugin --profile web add @jlvncn/dsh-web-search-ollama-client   # npm registry
dsh plugin --profile web add /path/to/packages/dsh-web-search-ollama-client  # local dir
```

Copy channel: put `index.js` + `client.js` + `package.json` +
`cordis.patch.yml` into
`$DSH_HOME/profiles/node_modules/@jlvncn/dsh-web-search-ollama-client/` (the
repo's `./scripts/install.sh` does this). Always keep it paired with the host
package `@jlvncn/dsh-web-search-ollama` — the card edits the namespace that the
host registers, and its slot key embeds the host bundle's package name.
