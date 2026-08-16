"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = void 0;
const schemastery_1 = __importDefault(require("@deepseek-ai/schemastery"));
const dsh_settings_1 = require("@deepseek-ai/dsh-settings");
const dsh_web_1 = require("@deepseek-ai/dsh-web");
const name = 'web-search-ollama';
const inject = ['web'];
const NS = (0, dsh_settings_1.settingsNamespace)('web-search-ollama');
const DEFAULT_API_KEY_ENV = 'OLLAMA_API_KEY';
const DEFAULT_BASE_URL = 'https://ollama.com';
const DEFAULT_SEARCH_PATH = '/api/web_search';
const DEFAULT_FETCH_PATH = '/api/web_fetch';
const DEFAULT_SNIPPET_MAX = 2000;
const DEFAULT_FETCH_TIMEOUT_MS = 15000;
const ConfigSchema = schemastery_1.default.object({
    apiKey: schemastery_1.default.string().role('secret'),
    apiKeyEnv: schemastery_1.default.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
    baseURL: schemastery_1.default.string().default(DEFAULT_BASE_URL),
    searchPath: schemastery_1.default.string().default(DEFAULT_SEARCH_PATH),
    fetchPath: schemastery_1.default.string().default(DEFAULT_FETCH_PATH),
    snippetMax: schemastery_1.default.number().step(1).min(1).default(DEFAULT_SNIPPET_MAX),
    fetchTimeoutMs: schemastery_1.default.number().step(1).min(1).default(DEFAULT_FETCH_TIMEOUT_MS),
});
exports.Config = ConfigSchema;
function resolveOptions(ctx, config) {
    const apiKeyEnv = config.apiKeyEnv ?? DEFAULT_API_KEY_ENV;
    return {
        apiKey: (config.apiKey?.length ?? 0) > 0 ? config.apiKey : undefined,
        resolveApiKey: async () => {
            if ((config.apiKey?.length ?? 0) > 0)
                return config.apiKey;
            const credentials = ctx.get('credentials');
            if (credentials !== void 0) {
                try {
                    const hit = await credentials.resolve(apiKeyEnv);
                    if (hit?.value != null && hit.value.length > 0)
                        return hit.value;
                }
                catch { }
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
            }
            catch { }
        },
    };
}
function authHeaders(apiKey) {
    const headers = {
        'content-type': 'application/json',
        accept: 'application/json',
    };
    if (apiKey !== undefined) {
        headers.authorization = `Bearer ${apiKey}`;
    }
    return headers;
}
class OllamaSearchProvider {
    constructor(resolveOptions) {
        this.resolveOptions = resolveOptions;
        this.id = 'ollama';
    }
    available() {
        const o = this.resolveOptions();
        return typeof o.baseURL === 'string' && o.baseURL.length > 0;
    }
    async search(request, signal) {
        const o = this.resolveOptions();
        const apiKey = await o.resolveApiKey();
        const endpoint = `${o.baseURL.replace(/\/+$/, '')}${o.searchPath}`;
        const payload = { query: request.query };
        if (request.maxResults != null && typeof request.maxResults === 'number' && request.maxResults > 0) {
            payload.max_results = Math.min(request.maxResults, 10);
        }
        o.recordRequest?.({ endpoint, body: payload });
        let response;
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: authHeaders(apiKey),
                body: JSON.stringify(payload),
                signal,
            });
        }
        catch (error) {
            const err = error;
            if (signal?.aborted === true)
                throw new dsh_web_1.WebError('Ollama web search aborted', 'WEB_ABORTED', { cause: err });
            throw new dsh_web_1.WebError(`Ollama web search request failed: ${String(err)}`, 'WEB_PROVIDER_ERROR', { cause: err });
        }
        if (!response.ok) {
            throw new dsh_web_1.WebError(`Ollama web search API error (HTTP ${response.status})`, 'WEB_PROVIDER_ERROR');
        }
        let body;
        try {
            body = await response.json();
        }
        catch (error) {
            const err = error;
            throw new dsh_web_1.WebError('Ollama web search returned an unprocessable response body', 'WEB_PROVIDER_ERROR', { cause: err });
        }
        const items = Array.isArray(body?.results) ? body.results : [];
        const seen = new Set();
        const sources = [];
        for (const item of items) {
            const url = item?.url;
            if (typeof url !== 'string' || url.length === 0 || seen.has(url))
                continue;
            seen.add(url);
            const raw = typeof item?.content === 'string' ? item.content : undefined;
            let snippet = undefined;
            if (raw !== undefined) {
                if (raw.length > o.snippetMax) {
                    snippet = `${raw.slice(0, o.snippetMax)}…`;
                }
                else {
                    snippet = raw;
                }
            }
            const source = {
                url,
                ...(typeof item?.title === 'string' && item.title.length > 0 ? { title: item.title } : {}),
                ...(snippet !== undefined ? { snippet } : {}),
                ...(typeof item?.publishedAt === 'string' && item.publishedAt.length > 0 ? { publishedAt: item.publishedAt } : {}),
            };
            sources.push(source);
        }
        return { content: undefined, sources, truncated: false };
    }
}
class OllamaFetchProvider {
    constructor(resolveOptions) {
        this.resolveOptions = resolveOptions;
        this.id = 'ollama';
    }
    available() {
        const o = this.resolveOptions();
        return typeof o.baseURL === 'string' && o.baseURL.length > 0;
    }
    async fetch(request, signal) {
        const o = this.resolveOptions();
        const apiKey = await o.resolveApiKey();
        const endpoint = `${o.baseURL.replace(/\/+$/, '')}${o.fetchPath}`;
        const payload = { url: request.url };
        o.recordRequest?.({ endpoint, body: payload });
        let abortSignal = undefined;
        if (signal !== undefined) {
            abortSignal = signal;
        }
        const timeoutSignal = AbortSignal.timeout(o.fetchTimeoutMs);
        if (abortSignal !== undefined) {
            abortSignal = AbortSignal.any([abortSignal, timeoutSignal]);
        }
        else {
            abortSignal = timeoutSignal;
        }
        let response;
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: authHeaders(apiKey),
                body: JSON.stringify(payload),
                signal: abortSignal,
            });
        }
        catch (error) {
            const err = error;
            if (abortSignal?.aborted === true)
                throw new dsh_web_1.WebError('Ollama web fetch aborted', 'WEB_ABORTED', { cause: err });
            if (err instanceof Error && err.name === 'TimeoutError')
                throw new dsh_web_1.WebError(`Ollama web fetch timed out after ${o.fetchTimeoutMs}ms`, 'WEB_PROVIDER_ERROR', { cause: err });
            throw new dsh_web_1.WebError(`Ollama web fetch request failed: ${String(err)}`, 'WEB_PROVIDER_ERROR', { cause: err });
        }
        if (!response.ok) {
            throw new dsh_web_1.WebError(`Ollama web fetch API error (HTTP ${response.status})`, 'WEB_PROVIDER_ERROR');
        }
        let body;
        try {
            body = await response.json();
        }
        catch (error) {
            const err = error;
            throw new dsh_web_1.WebError('Ollama web fetch returned an unprocessable response body', 'WEB_PROVIDER_ERROR', { cause: err });
        }
        const content = typeof body?.content === 'string' ? body.content : '';
        const finalUrl = response.url != null && response.url !== endpoint ? response.url : request.url;
        const fetchBody = { kind: 'text', content };
        return {
            url: finalUrl,
            statusCode: response.status,
            body: fetchBody,
            truncated: false,
        };
    }
}
function apply(ctx, config) {
    let current = () => config;
    (0, dsh_settings_1.installSettingsSection)(ctx, NS, ConfigSchema, config, {
        setSource: (source) => { current = source; },
        onChange: () => { },
    });
    ctx.web.registerSearchProvider(new OllamaSearchProvider(() => resolveOptions(ctx, current())));
    ctx.web.registerFetchProvider(new OllamaFetchProvider(() => resolveOptions(ctx, current())));
}
exports.default = { name, inject, apply };
