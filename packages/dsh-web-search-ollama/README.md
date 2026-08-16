# dsh-web-search-ollama

**Host half** of the Ollama web-search plugin for DeepSeek Harness. Runs in the
Node.js process and registers, on the `ctx.web` seam:

- a **search provider** (`POST {baseURL}{searchPath}` → `{ results: [...] }`)
- a **fetch provider** (`POST {baseURL}{fetchPath}` → `{ title, content }`)
- the `web-search-ollama` **settings namespace** (schema with 7 fields)

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
# or run test.mjs from a DSH profile node_modules tree
```

See the repo root `README.md` for full configuration & troubleshooting.
