# @jlvncn/dsh-web-search-ollama

**Host half** of the Ollama web-search plugin for DeepSeek Harness. Runs in the
Node.js process and registers, on the `ctx.web` seam:

- a **search provider** (`POST {baseURL}{searchPath}` → `{ results: [...] }`) — always
- a **fetch provider** (`POST {baseURL}{fetchPath}` → `{ title, content }`) — opt-in
  via `config.enableFetchProvider: true`. Off by default so a second usable fetch
  provider cannot fight the built-in `http` one for seam auto-selection.
- the `web-search-ollama` **settings namespace** — projected automatically
  (harness >= 0.1.7) from this loader entry's Config schema; every field marked
  `volatile()` is live-editable and hot-applies on save.

It writes **no session events**. Since v0.1.5 it stays out of the session log on
purpose: earlier versions recorded an Ollama payload under the first-party event
name `web/deepseek-search-llm-request`, and the frozen v0→v1 migration refuses
that event shape — making any v0-format session containing it unopenable. A
third-party plugin cannot register its own required event type either, so the
safe default is to write nothing.

> **Package name note (v0.1.12).** This package used to be named
> `dsh-web-search-ollama`; that unscoped name was taken on npm by an unrelated
> third party on 2026-08-25, so the project now publishes under the
> `@jlvncn` scope. The loader row id and settings namespace
> (`web-search-ollama`) are unchanged.

## Install

Prefer the bundle channel (managed from the Web Plugins page / `dsh plugin`):

```bash
dsh plugin --profile web add @jlvncn/dsh-web-search-ollama       # npm registry
dsh plugin --profile web add /path/to/packages/dsh-web-search-ollama  # local dir
```

Or the copy channel: the package must be resolvable from your DSH profile's
node_modules (`$DSH_HOME/profiles/node_modules/@jlvncn/dsh-web-search-ollama/`).
Use the repo's `./scripts/install.sh`, or copy `index.js` + `package.json` +
`cordis.patch.yml` there manually.

As a bundle it mounts its own row via `dsh.bundle.patch`; the equivalent
hand-written loader patch is:

```yaml
- insert:
    - id: web-search-ollama
      name: '@jlvncn/dsh-web-search-ollama'   # YAML: quote — '@' starts a plain scalar illegally
      config:
        baseURL: https://ollama.com
        searchPath: /api/web_search
        fetchPath: /api/web_fetch
        apiKeyEnv: OLLAMA_API_KEY
```

The bundle deliberately does **not** seize the `web` seam; put
`searchProvider: ollama` (and `web-search-deepseek: disabled`) in your own
patch layer (install.sh does this for you).

## Dependencies

| Package | Kind | Purpose |
|---|---|---|
| `@deepseek-ai/dsh-web` | peer (`>=0.1.7-rc.1 <0.2.0`) | `ctx.web` seam & `WebError` |
| `@deepseek-ai/schemastery` | dependency (`~3.18.4`) | config schema; must be ≥ 3.18.4 for `volatile()` |
| `@deepseek-ai/cordis` | devDependency | `Context` / `Volatile` types at build time |

Runtime packages are provided by the DSH installation; nothing extra to install.

## Test

```bash
pnpm test          # from the monorepo root (after pnpm install)
# runs test.mjs (module shape) + test-providers.mjs (8 behavioral tests,
# including the "never writes a session event" regression guard)
```

See the repo root `README.md` for full configuration & troubleshooting.
