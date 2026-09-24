// Behavioral tests for the dsh-web-search-ollama providers.
//
// These drive the real plugin module through a minimal mock Cordis context and
// a mocked global fetch, so they exercise the shipped `index.js` without booting
// the Harness. They guard the fixes that matter:
//   - the provider writes NO session event (the v0-session-corruption root cause)
//   - a timeout is WEB_PROVIDER_ERROR, not WEB_ABORTED (and vice versa)
//   - the Ollama fetch provider is opt-in, so it cannot fight the built-in http one
//   - the API key resolves through the launcher's launch-environment snapshot
//
// Run: node test-providers.mjs   (from this package directory)
import assert from 'node:assert/strict';

const pluginModule = await import('./index.js');
const plugin = pluginModule.default ?? pluginModule;

/**
 * Stand-in for the loader's Config. On harness >= 0.1.7 the loader hands every
 * editable field over as a live ref with its schema default applied, so the
 * helper seeds those defaults and wraps each editable field. `enableFetchProvider`
 * is the one structural field and stays plain.
 */
const ConfigSchema = pluginModule.Config ?? pluginModule.default?.Config;
/** Schema defaults, as the loader applies them before Config reaches `apply`. */
const schemaDefaults = Object.fromEntries(
  Object.entries(ConfigSchema?.dict ?? {}).map(([key, schema]) => [key, schema.meta?.default]),
);
const FALLBACK_DEFAULTS = {
  apiKey: undefined,
  apiKeyEnv: 'OLLAMA_API_KEY',
  baseURL: 'https://ollama.com',
  searchPath: '/api/web_search',
  fetchPath: '/api/web_fetch',
  apiVersion: 'v1',
  snippetMax: 2000,
  searchTimeoutMs: 30000,
  fetchTimeoutMs: 15000,
  enableFetchProvider: false,
};

function config(values = {}) {
  const merged = { ...FALLBACK_DEFAULTS, ...schemaDefaults, ...values };
  const out = {};
  for (const [key, value] of Object.entries(merged)) {
    out[key] = key === 'enableFetchProvider' ? value : { get: () => value };
  }
  return out;
}

/** Minimal Cordis-shaped context capturing what `apply` registers. */
function makeCtx({ env = {}, credentials, agents } = {}) {
  const ctx = {
    web: {
      searchProviders: [],
      fetchProviders: [],
      registerSearchProvider(provider) { ctx.web.searchProviders.push(provider); return () => {}; },
      registerFetchProvider(provider) { ctx.web.fetchProviders.push(provider); return () => {}; },
    },
    // The settings section install runs inside this callback; these tests use the
    // loader config directly, so the callback is intentionally never invoked.
    inject() {},
    get(name) {
      if (name === 'launchEnvironment') {
        return {
          get: (key) => (Object.prototype.hasOwnProperty.call(env, key) ? { value: env[key] } : undefined),
        };
      }
      if (name === 'credentials') return credentials;
      if (name === 'agents') return agents;
      return undefined;
    },
  };
  return ctx;
}

const realFetch = globalThis.fetch;
let fetchCalls = [];

function mockFetch(impl) {
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return impl(url, init);
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A fetch that never settles until the request's signal aborts. */
function hangingFetch() {
  return (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  });
}

/**
 * Keep the event loop alive while awaiting a promise. `AbortSignal.timeout`
 * uses an unref'd timer, so a hanging fetch would otherwise let Node drain the
 * loop and exit with an "unsettled top-level await" before the timeout fires.
 */
async function keepAliveWhile(promise) {
  const timer = setTimeout(() => {}, 5000);
  try {
    return await promise;
  } finally {
    clearTimeout(timer);
  }
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('search: posts the Ollama body, maps sources, dedupes and caps', async () => {
  fetchCalls = [];
  mockFetch(async () => jsonResponse({
    results: [
      { title: 'A', url: 'https://a.test', content: 'aaa' },
      { title: 'dup', url: 'https://a.test', content: 'duplicate url dropped' },
      { url: 'https://b.test', content: 'x'.repeat(50) },
      { title: 'no url' },
    ],
  }));
  const ctx = makeCtx();
  plugin.apply(ctx, config({ baseURL: 'https://api.test/', apiKey: 'secret', snippetMax: 10 }));

  const result = await ctx.web.searchProviders[0].search({ query: 'hello', maxResults: 20 });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://api.test/api/web_search');
  assert.deepEqual(JSON.parse(fetchCalls[0].init.body), { query: 'hello', max_results: 10 });
  assert.equal(fetchCalls[0].init.headers.authorization, 'Bearer secret');
  assert.equal(result.sources.length, 2);
  assert.equal(result.sources[0].url, 'https://a.test');
  assert.equal(result.sources[1].snippet, `${'x'.repeat(10)}\u2026`);
});

test('search: writes NO session event (v0-corruption regression guard)', async () => {
  const appended = [];
  const agents = { currentInitiator: () => ({ session: { append: (...args) => appended.push(args) } }) };
  mockFetch(async () => jsonResponse({ results: [] }));
  const ctx = makeCtx({ agents });
  plugin.apply(ctx, config({ baseURL: 'https://api.test', apiKey: 'k' }));

  await ctx.web.searchProviders[0].search({ query: 'q' });

  assert.deepEqual(appended, []);
});

test('search: a timeout is WEB_PROVIDER_ERROR, not WEB_ABORTED', async () => {
  mockFetch(hangingFetch());
  const ctx = makeCtx();
  plugin.apply(ctx, config({ baseURL: 'https://api.test', apiKey: 'k', searchTimeoutMs: 25 }));

  await keepAliveWhile(assert.rejects(
    () => ctx.web.searchProviders[0].search({ query: 'q' }),
    (error) => {
      assert.equal(error.code, 'WEB_PROVIDER_ERROR', `expected provider error, got ${error.code}`);
      assert.match(String(error.message), /timed out/);
      return true;
    },
  ));
});

test('search: caller cancellation is WEB_ABORTED', async () => {
  mockFetch(hangingFetch());
  const ctx = makeCtx();
  plugin.apply(ctx, config({ baseURL: 'https://api.test', apiKey: 'k', searchTimeoutMs: 5000 }));

  const controller = new AbortController();
  const pending = ctx.web.searchProviders[0].search({ query: 'q' }, controller.signal);
  setTimeout(() => controller.abort(new Error('caller stopped it')), 20);

  await assert.rejects(
    () => pending,
    (error) => {
      assert.equal(error.code, 'WEB_ABORTED', `expected cancellation, got ${error.code}`);
      return true;
    },
  );
});

test('provider registration: fetch is opt-in', async () => {
  const off = makeCtx();
  plugin.apply(off, config({ baseURL: 'https://api.test', apiKey: 'k' }));
  assert.equal(off.web.searchProviders.length, 1);
  assert.equal(off.web.fetchProviders.length, 0, 'fetch provider must not register by default');

  const on = makeCtx();
  plugin.apply(on, config({ baseURL: 'https://api.test', apiKey: 'k', enableFetchProvider: true }));
  assert.equal(on.web.fetchProviders.length, 1);
});

test('credential: resolves the API key from the launch-environment snapshot', async () => {
  fetchCalls = [];
  mockFetch(async () => jsonResponse({ results: [] }));
  const ctx = makeCtx({ env: { OLLAMA_API_KEY: 'from-env' } });
  plugin.apply(ctx, config({ baseURL: 'https://api.test' }));

  await ctx.web.searchProviders[0].search({ query: 'q' });

  assert.equal(fetchCalls[0].init.headers.authorization, 'Bearer from-env');
});

test('fetch (opt-in): maps the text body', async () => {
  fetchCalls = [];
  mockFetch(async () => jsonResponse({ content: 'page text' }));
  const ctx = makeCtx();
  plugin.apply(ctx, config({ baseURL: 'https://api.test', apiKey: 'k', enableFetchProvider: true }));

  const result = await ctx.web.fetchProviders[0].fetch({ url: 'https://target.test' });

  assert.equal(fetchCalls[0].url, 'https://api.test/api/web_fetch');
  assert.deepEqual(JSON.parse(fetchCalls[0].init.body), { url: 'https://target.test' });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { kind: 'text', content: 'page text' });
});

test('fetch (opt-in): a timeout is WEB_PROVIDER_ERROR, not WEB_ABORTED', async () => {
  mockFetch(hangingFetch());
  const ctx = makeCtx();
  plugin.apply(ctx, config({ baseURL: 'https://api.test', apiKey: 'k', enableFetchProvider: true, fetchTimeoutMs: 25 }));

  await keepAliveWhile(assert.rejects(
    () => ctx.web.fetchProviders[0].fetch({ url: 'https://target.test' }),
    (error) => {
      assert.equal(error.code, 'WEB_PROVIDER_ERROR', `expected provider error, got ${error.code}`);
      assert.match(String(error.message), /timed out/);
      return true;
    },
  ));
});

let failed = 0;
try {
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`  ok   ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`  FAIL ${name}`);
      console.error(error);
    }
  }
} finally {
  globalThis.fetch = realFetch;
}

if (failed > 0) {
  console.error(`\n${failed}/${tests.length} provider test(s) failed`);
  process.exit(1);
}
console.log(`\nOK: ${tests.length} provider test(s) passed`);
