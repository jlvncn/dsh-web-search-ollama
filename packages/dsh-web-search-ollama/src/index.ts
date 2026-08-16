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
 *   snippetMax     - cap on search snippet.  Default 2000
 *   fetchTimeoutMs - fetch abort timeout.    Default 15000
 */

import Schema from '@deepseek-ai/schemastery';
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
import { WebError } from '@deepseek-ai/dsh-web';
import type { Context } from '@deepseek-ai/cordis';
import type { WebSearchProvider, WebSearchRequest, WebSearchResult, WebSearchSource,
  WebFetchProvider, WebFetchRequest, WebFetchResult, WebFetchBody } from '@deepseek-ai/dsh-web';

const name = 'web-search-ollama';
const inject = ['web'];
const NS = settingsNamespace('web-search-ollama');

const DEFAULT_API_KEY_ENV = 'OLLAMA_API_KEY';
const DEFAULT_BASE_URL = 'https://ollama.com';
const DEFAULT_SEARCH_PATH = '/api/web_search';
const DEFAULT_FETCH_PATH = '/api/web_fetch';
const DEFAULT_SNIPPET_MAX = 2000;
const DEFAULT_FETCH_TIMEOUT_MS = 15000;

const ConfigSchema = Schema.object({
  /** Literal API key; wins over `apiKeyEnv`. Never rides a describe() response. */
  apiKey: Schema.string().role('secret'),
  /** Credential reference resolved per operation; defaults to OLLAMA_API_KEY. */
  apiKeyEnv: Schema.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  /** Ollama API root; `/api/web_search` and `/api/web_fetch` are appended via the paths below. */
  baseURL: Schema.string().default(DEFAULT_BASE_URL),
  searchPath: Schema.string().default(DEFAULT_SEARCH_PATH),
  fetchPath: Schema.string().default(DEFAULT_FETCH_PATH),
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
    snippetMax: Number.isInteger(config.snippetMax) && config.snippetMax > 0
      ? config.snippetMax
      : DEFAULT_SNIPPET_MAX,
    fetchTimeoutMs: Number.isInteger(config.fetchTimeoutMs) && config.fetchTimeoutMs > 0
      ? config.fetchTimeoutMs
      : DEFAULT_FETCH_TIMEOUT_MS,
    recordRequest: (payload) => {
      try {
        ctx.get('agents')?.currentInitiator()?.session?.append?.('web/ollama-search-request', payload);
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

//#region search provider
class OllamaSearchProvider implements WebSearchProvider {
  readonly id = 'ollama';
  constructor(private resolveOptions: () => ResolveOptions) {}
  available(): boolean {
    const o = this.resolveOptions();
    return typeof o.baseURL === 'string' && o.baseURL.length > 0;
  }
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const o = this.resolveOptions();
    const apiKey = await o.resolveApiKey();
    const endpoint = `${o.baseURL.replace(/\/+$/, '')}${o.searchPath}`;
    const payload: Record<string, any> = { query: request.query };
    if (request.maxResults != null && typeof request.maxResults === 'number' && request.maxResults > 0) {
      // Ollama: max_results default 5, max 10 — the seam truncates regardless.
      payload.max_results = Math.min(request.maxResults, 10);
    }
    o.recordRequest?.({ endpoint, body: payload });
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
      if (signal?.aborted === true) throw new WebError('Ollama web search aborted', 'WEB_ABORTED', { cause: err });
      throw new WebError(`Ollama web search request failed: ${String(err)}`, 'WEB_PROVIDER_ERROR', { cause: err });
    }
    if (!response.ok) {
      throw new WebError(`Ollama web search API error (HTTP ${response.status})`, 'WEB_PROVIDER_ERROR');
    }
    let body: any;
    try {
      body = await response.json();
    } catch (error) {
      const err = error as unknown;
      throw new WebError('Ollama web search returned an unprocessable response body', 'WEB_PROVIDER_ERROR', { cause: err });
    }
    const items = Array.isArray(body?.results) ? body.results : [];
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
    return typeof o.baseURL === 'string' && o.baseURL.length > 0;
  }
  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    const o = this.resolveOptions();
    const apiKey = await o.resolveApiKey();
    const endpoint = `${o.baseURL.replace(/\/+$/, '')}${o.fetchPath}`;
    const payload: Record<string, any> = { url: request.url };
    o.recordRequest?.({ endpoint, body: payload });
    // Combine abort signals: user signal + timeout
    let abortSignal: AbortSignal | undefined = undefined;
    if (signal !== undefined) {
      abortSignal = signal;
    }
    const timeoutSignal = AbortSignal.timeout(o.fetchTimeoutMs);
    if (abortSignal !== undefined) {
      abortSignal = AbortSignal.any([abortSignal, timeoutSignal]);
    } else {
      abortSignal = timeoutSignal;
    }
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
      if (abortSignal?.aborted === true) throw new WebError('Ollama web fetch aborted', 'WEB_ABORTED', { cause: err });
      if (err instanceof Error && err.name === 'TimeoutError') throw new WebError(`Ollama web fetch timed out after ${o.fetchTimeoutMs}ms`, 'WEB_PROVIDER_ERROR', { cause: err });
      throw new WebError(`Ollama web fetch request failed: ${String(err)}`, 'WEB_PROVIDER_ERROR', { cause: err });
    }
    if (!response.ok) {
      throw new WebError(`Ollama web fetch API error (HTTP ${response.status})`, 'WEB_PROVIDER_ERROR');
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

function apply(ctx: Context, config: Config) {
  let current = () => config;
  installSettingsSection(ctx, NS, ConfigSchema, config, {
    setSource: (source) => { current = source; },
    onChange: () => {},
  });
  ctx.web.registerSearchProvider(new OllamaSearchProvider(() => resolveOptions(ctx, current())));
  ctx.web.registerFetchProvider(new OllamaFetchProvider(() => resolveOptions(ctx, current())));
}

export { ConfigSchema as Config };
export default { name, inject, apply };