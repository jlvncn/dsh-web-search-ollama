# dsh-web-search-ollama

**Host half** of the Ollama web-search plugin for DeepSeek Harness. Runs in the
Node.js process and registers, on the `ctx.web` seam:

- a **search provider** (`POST {baseURL}{searchPath}` → `{ results: [...] }`) — always
- a **fetch provider** (`POST {baseURL}{fetchPath}` → `{ title, content }`) — opt-in
  via `config.enableFetchProvider: true`. Off by default so a second usable fetch
  provider cannot fight the built-in `http` one for seam auto-selection.
- the `web-search-ollama` **settings namespace** (schema with 10 fields; the Web UI
  card edits 8 of them)

It writes **no session events**. Since v0.1.5 it stays out of the session log on
purpose: earlier versions recorded an Ollama payload under the first-party event
name `web/deepseek-search-llm-request`, and the frozen v0→v1 migration refuses
that event shape — making any v0-format session containing it unopenable. A
third-party plugin cannot register its own required event type either, so the
safe default is to write nothing.

## Install

This package must be resolvable from your DSH profile's node_modules
(`$DSH_HOME/profiles/node_modules/dsh-web-search-ollama/`). Use the repo's
`./scripts/install.sh`, or copy `index.js` + `package.json` there manually.

It is loaded by `cordis.patch.yml` as:

```yaml
- insert:
    - id: web-search-ollama
      name: 'dsh-web-search-ollama'
      config:
        baseURL: https://ollama.com
        searchPath: /api/web_search
        fetchPath: /api/web_fetch
        apiKeyEnv: OLLAMA_API_KEY
```

## Peer dependencies

| Package | Scope |
|---|---|
| `@deepseek-ai/dsh-settings` | settings section installation |
| `@deepseek-ai/dsh-web` | `ctx.web` seam & `WebError` |
| `@deepseek-ai/schemastery` | config schema (`dependencies`) |

All are provided by a DSH profile; nothing extra to install.

## Test

```bash
pnpm test          # from the monorepo root (after pnpm install)
# runs test.mjs (module shape) + test-providers.mjs (8 behavioral tests,
# including the "never writes a session event" regression guard)
```

See the repo root `README.md` for full configuration & troubleshooting.
