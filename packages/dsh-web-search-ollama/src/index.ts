/**
 * dsh-web-search-ollama
 *
 * An Ollama-backed web capability plugin for the DeepSeek Harness `ctx.web`
 * seam. Modeled on @deepseek-ai/dsh-web-search-deepseek: it installs a
 * settings section (`web-search-ollama`), registers BOTH a search provider
 * (Ollama `/api/web_search`) and a fetch provider (Ollama `/api/web_fetch`),
 * resolves the credential per operation through `ctx.credentials`, classifies
 * failures as WebError codes, and records secret-free requests in the
 * initiating Agent session.
 *
 * Wire calls:
 *   POST {baseURL}{searchPath}   body: { query, max_results? }
 *     -> { results: [{ title, url, content }] }
 *   POST {baseURL}{fetchPath}    body: { url }
 *     -> { title, content, links }
 *
 * Config (loader entry `config` / settings section `web-search-ollama`):
 *   baseURL        - Ollama API root.        Default https://ollama.com
 *   searchPath     - search endpoint path.   Default /api/web_search
 *   fetchPath      - fetch endpoint path.   Default /api/web_fetch
 *   apiKeyEnv      - credential ref.         Default OLLAMA_API_KEY
 *   apiKey         - literal key (secret).   Default none
 *   apiVersion     - audit-event API version label. Default v1
 *   snippetMax     - cap on search snippet.  Default 2000
 *   fetchTimeoutMs - fetch abort timeout.    Default 15000
 */

import Schema from '@deepseek-ai/schemastery';
import { WebError } from '@deepseek-ai/dsh-web';
import type { Context } from '@deepseek-ai/cordis';
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource,
  WebFetchProvider, WebFetchRequest, WebFetchResult, WebFetchBody } from '@deepseek-ai/dsh-web';

const name = 'web-search-ollama';
const inject = ['web'];
const NS = 'web-search-ollama';

const DEFAULT_API_KEY_ENV = 'OLLAMA_API_KEY';
const DEFAULT_BASE_URL = 'https://ollama.com';
const DEFAULT_SEARCH_PATH = '/api/web_search';
const DEFAULT_FETCH_PATH = '/api/web_fetch';
const DEFAULT_SNIPPET_MAX = 2000;
const DEFAULT_FETCH_TIMEOUT_MS = 15000;
/** API generation label recorded in the audit event payload (Ollama has no version header). */
const DEFAULT_API_VERSION = 'v1';

const ConfigSchema = Schema.object({
  /** Literal API key; wins over `apiKeyEnv`. Never rides a describe() response. */
  apiKey: Schema.string().role('secret'),
  /** Credential reference resolved per operation; defaults to OLLAMA_API_KEY. */
  apiKeyEnv: Schema.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  /** Ollama API root; `/api/web_search` and `/api/web_fetch` are appended via the paths below. */
  baseURL: Schema.string().default(DEFAULT_BASE_URL),
  searchPath: Schema.string().default(DEFAULT_SEARCH_PATH),
  fetchPath: Schema.string().default(DEFAULT_FETCH_PATH),
  /** Audit-event API version label (informational; Ollama has no version header). */
  apiVersion: Schema.string().default(DEFAULT_API_VERSION),
  /** Cap on the per-source snippet length (search). */
  snippetMax: Schema.number().step(1).min(1).default(DEFAULT_SNIPPET_MAX),
  /** Abort timeout for fetch operations (ms). */
  fetchTimeoutMs: Schema.number().step(1).min(1).default(DEFAULT_FETCH_TIMEOUT_MS),
});

type Config = ReturnType<typeof ConfigSchema>;

interface ResolveOptions {
  apiKey: string | undefined;
  resolveApiKey: () => Promise<string | undefined>;
  apiKeyEnv: string;
  baseURL: string;
  searchPath: string;
  fetchPath: string;
  apiVersion: string;
  snippetMax: number;
  fetchTimeoutMs: number;
  recordRequest: (payload: any) => void;
}

/**
 * Project one resolved section into the options both providers serve their
 * next operation with. Environment/credential fallbacks stay here.
 */
function resolveOptions(ctx: Context, config: Config): ResolveOptions {
  const apiKeyEnv = config.apiKeyEnv ?? DEFAULT_API_KEY_ENV;
  return {
    apiKey: (config.apiKey?.length ?? 0) > 0 ? config.apiKey : undefined,
    resolveApiKey: async () => {
      if ((config.apiKey?.length ?? 0) > 0) return config.apiKey;
      const credentials = ctx.get('credentials');
      if (credentials !== void 0) {
        try {
          const hit = await credentials.resolve(apiKeyEnv);
          if (hit?.value != null && hit.value.length > 0) return hit.value;
        } catch { /* fall through to process environment */ }
      }
      const ambient = process.env[apiKeyEnv];
      return ambient != null && ambient.length > 0 ? ambient : undefined;
    },
    apiKeyEnv,
    baseURL: config.baseURL ?? DEFAULT_BASE_URL,
    searchPath: config.searchPath ?? DEFAULT_SEARCH_PATH,
    fetchPath: config.fetchPath ?? DEFAULT_FETCH_PATH,
    apiVersion: typeof config.apiVersion === 'string' && config.apiVersion.length > 0
      ? config.apiVersion
      : DEFAULT_API_VERSION,
    snippetMax: Number.isInteger(config.snippetMax) && config.snippetMax > 0
      ? config.snippetMax
      : DEFAULT_SNIPPET_MAX,
    fetchTimeoutMs: Number.isInteger(config.fetchTimeoutMs) && config.fetchTimeoutMs > 0
      ? config.fetchTimeoutMs
      : DEFAULT_FETCH_TIMEOUT_MS,
    recordRequest: (payload) => {
      try {
        ctx.get('agents')?.currentInitiator()?.session?.append?.('web/deepseek-search-llm-request', payload);
      } catch { /* best-effort audit logging */ }
    },
  };
}

function authHeaders(apiKey: string | undefined) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (apiKey !== undefined) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

/** True for a parseable absolute URL (guards `available()` without `URL.canParse`). */
function isUrlParseable(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Build the stable cancellation error while retaining the caller's reason. */
function aborted(label: string, signal?: AbortSignal, fallback?: unknown) {
  return new WebError(`${label} aborted`, 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  });
}

/** Throw the stable cancellation error when the caller already aborted. */
function throwIfAborted(signal: AbortSignal | undefined, label: string) {
  if (signal?.aborted === true) throw aborted(label, signal);
}

/**
 * Race a same-process asynchronous preflight against caller cancellation. The
 * attached settlement handlers keep observing an uncooperative operation after
 * abort so a later rejection cannot become unhandled.
 */
function abortable<T>(operation: Promise<T> | undefined, label: string, signal?: AbortSignal): Promise<T | undefined> {
  if (signal === undefined) return Promise.resolve(operation);
  if (signal.aborted) return Promise.reject(aborted(label, signal));
  return new Promise<T | undefined>((resolve, reject) => {
    const onAbort = () => reject(aborted(label, signal));
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(operation).then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        // ES2020 target: `new Error(msg, { cause })` needs ES2022, so attach cause manually.
        const err = new Error(String(error).replace(/^Error: /u, ''));
        Object.defineProperty(err, 'cause', { value: error, enumerable: false });
        reject(err);
      },
    );
  });
}

/**
 * Resolve one operation's credential without retaining it on the provider.
 * @throws {@link WebError} with `WEB_PROVIDER_CREDENTIAL_MISSING` when no key is available.
 */
async function resolveApiKeyForOperation(o: ResolveOptions, label: string, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal, label);
  if (o.apiKey !== undefined && o.apiKey.length > 0) return o.apiKey;
  let resolved: string | undefined;
  try {
    resolved = await abortable(o.resolveApiKey(), label, signal);
  } catch (error) {
    if (signal?.aborted === true || isAbortError(error)) throw aborted(label, signal, error);
    throw new WebError(`${label} credential resolution failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error });
  }
  if (resolved !== undefined && resolved.length > 0) return resolved;
  throw new WebError(
    `${label} has no API key for "${o.apiKeyEnv}"; configure it through the credentials service, `
    + `set the ${o.apiKeyEnv} environment variable, or set a literal "apiKey" in the web-search-ollama config`,
    'WEB_PROVIDER_CREDENTIAL_MISSING',
  );
}

/**
 * Surface the provider's own error detail from an HTTP failure body when one
 * exists, falling back to a generic status message. Deliberately defensive:
 * Ollama error shapes vary, so any parse failure keeps the base message.
 */
async function httpErrorDetail(label: string, response: Response): Promise<string> {
  const base = `${label} API error (HTTP ${response.status})`;
  try {
    const parsed: any = await response.json();
    const detail = typeof parsed?.error === 'string' ? parsed.error
      : typeof parsed?.error?.message === 'string' ? parsed.error.message
      : typeof parsed?.message === 'string' ? parsed.message
      : undefined;
    return detail !== undefined && detail.length > 0 ? detail : base;
  } catch {
    return base;
  }
}

//#region search provider
class OllamaSearchProvider implements WebSearchProvider {
  readonly id = 'ollama';
  constructor(private resolveOptions: () => ResolveOptions) {}
  available(): boolean {
    const o = this.resolveOptions();
    return typeof o.baseURL === 'string' && o.baseURL.length > 0
      && isUrlParseable(o.baseURL)
      && Number.isInteger(o.snippetMax) && o.snippetMax > 0;
  }
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const o = this.resolveOptions();
    const apiKey = await resolveApiKeyForOperation(o, 'Ollama web search', signal);
    throwIfAborted(signal, 'Ollama web search');
    const endpoint = `${o.baseURL.replace(/\/+$/, '')}${o.searchPath}`;
    const payload: Record<string, any> = { query: request.query };
    if (request.maxResults != null && typeof request.maxResults === 'number' && request.maxResults > 0) {
      // Ollama: max_results default 5, max 10 — the seam truncates regardless.
      payload.max_results = Math.min(request.maxResults, 10);
    }
    o.recordRequest?.({ endpoint, apiVersion: o.apiVersion, body: payload });
    throwIfAborted(signal, 'Ollama web search');
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify(payload),
        signal,
      });
    } catch (error) {
      const err = error as unknown;
      if (signal?.aborted === true || isAbortError(err)) throw aborted('Ollama web search', signal, err);
      throw new WebError(`Ollama web search request failed: ${String(err)}`, 'WEB_PROVIDER_ERROR', { cause: err });
    }
    if (!response.ok) {
      throw new WebError(await httpErrorDetail('Ollama web search', response), 'WEB_PROVIDER_ERROR');
    }
    let body: any;
    try {
      body = await response.json();
    } catch (error) {
      const err = error as unknown;
      throw new WebError('Ollama web search returned an unprocessable response body', 'WEB_PROVIDER_ERROR', { cause: err });
    }
    // An empty `results` array is a legitimate "no results"; a missing/non-array
    // `results` means the shape changed or an error slipped through with HTTP 200.
    if (!Array.isArray(body?.results)) {
      throw new WebError('Ollama web search returned an unprocessable response body: missing "results" array', 'WEB_PROVIDER_ERROR');
    }
    const items: any[] = body.results;
    const seen = new Set<string>();
    const sources: WebSearchSource[] = [];
    for (const item of items) {
      const url = item?.url;
      if (typeof url !== 'string' || url.length === 0 || seen.has(url)) continue;
      seen.add(url);
      const raw = typeof item?.content === 'string' ? item.content : undefined;
      let snippet: string | undefined = undefined;
      if (raw !== undefined) {
        if (raw.length > o.snippetMax) {
          snippet = `${raw.slice(0, o.snippetMax)}…`;
        } else {
          snippet = raw;
        }
      }
      const source: WebSearchSource = {
        url,
        ...(typeof item?.title === 'string' && item.title.length > 0 ? { title: item.title } : {}),
        ...(snippet !== undefined ? { snippet } : {}),
        ...(typeof item?.publishedAt === 'string' && item.publishedAt.length > 0 ? { publishedAt: item.publishedAt } : {}),
      };
      sources.push(source);
    }
    // content: provider-generated answer text; Ollama does not provide, so leave undefined.
    return { content: undefined, sources, truncated: false };
  }
}
//#endregion

//#region fetch provider
class OllamaFetchProvider implements WebFetchProvider {
  readonly id = 'ollama';
  constructor(private resolveOptions: () => ResolveOptions) {}
  available(): boolean {
    const o = this.resolveOptions();
    return typeof o.baseURL === 'string' && o.baseURL.length > 0
      && isUrlParseable(o.baseURL)
      && Number.isInteger(o.fetchTimeoutMs) && o.fetchTimeoutMs > 0;
  }
  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    const o = this.resolveOptions();
    const apiKey = await resolveApiKeyForOperation(o, 'Ollama web fetch', signal);
    throwIfAborted(signal, 'Ollama web fetch');
    const endpoint = `${o.baseURL.replace(/\/+$/, '')}${o.fetchPath}`;
    const payload: Record<string, any> = { url: request.url };
    o.recordRequest?.({ endpoint, apiVersion: o.apiVersion, body: payload });
    // Combine abort signals: user signal + timeout
    const timeoutSignal = AbortSignal.timeout(o.fetchTimeoutMs);
    const abortSignal = signal !== undefined ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify(payload),
        signal: abortSignal,
      });
    } catch (error) {
      const err = error as unknown;
      if (abortSignal?.aborted === true || isAbortError(err)) throw aborted('Ollama web fetch', abortSignal, err);
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new WebError(`Ollama web fetch timed out after ${o.fetchTimeoutMs}ms`, 'WEB_PROVIDER_ERROR', { cause: err });
      }
      throw new WebError(`Ollama web fetch request failed: ${String(err)}`, 'WEB_PROVIDER_ERROR', { cause: err });
    }
    if (!response.ok) {
      throw new WebError(await httpErrorDetail('Ollama web fetch', response), 'WEB_PROVIDER_ERROR');
    }
    let body: any;
    try {
      body = await response.json();
    } catch (error) {
      const err = error as unknown;
      throw new WebError('Ollama web fetch returned an unprocessable response body', 'WEB_PROVIDER_ERROR', { cause: err });
    }
    const content = typeof body?.content === 'string' ? body.content : '';
    const finalUrl = response.url != null && response.url !== endpoint ? response.url : request.url;
    // Determine kind: Ollama returns plain text, we treat as 'text'
    const fetchBody: WebFetchBody = { kind: 'text', content };
    return {
      url: finalUrl,
      statusCode: response.status,
      body: fetchBody,
      truncated: false,
    };
  }
}
//#endregion

// Local type shim for the settings section hook until the monorepo devDeps are
// raised to @deepseek-ai/dsh-settings@0.1.2-rc.1 (whose bundled `cordis`
// augmentation types `Context.settings`; 0.1.0-rc.6 / 0.1.1-rc.2 do not).
// Runtime behavior is identical either way — this only satisfies tsc.
interface SettingsSectionHooks<T> {
  setSource(source: () => T): void;
  onChange(): void;
}
interface SettingsLike {
  installSection<T>(owner: unknown, ns: string, schema: unknown, entry: T, hooks: SettingsSectionHooks<T>): void;
}

function apply(ctx: Context, config: Config) {
  let current = () => config;
  ctx.inject(['settings'], (settingsCtx) => {
    (settingsCtx as unknown as { settings: SettingsLike }).settings.installSection(ctx, NS, ConfigSchema, config, {
      setSource: (source) => { current = source; },
      onChange: () => {},
    });
  });
  ctx.web.registerSearchProvider(new OllamaSearchProvider(() => resolveOptions(ctx, current())));
  ctx.web.registerFetchProvider(new OllamaFetchProvider(() => resolveOptions(ctx, current())));
}

export { ConfigSchema as Config };
export default { name, inject, apply };
