/**
 * @jlvncn/dsh-web-search-ollama-client — browser half.
 *
 * Registers the "row configuration" page of the plugin's own loader row on the
 * Web UI's Plugins page: bundle `@jlvncn/dsh-web-search-ollama` → row
 * `web-search-ollama` → the configure control opens this card.
 *
 * Harness >= 0.1.7 contract (see the slot contract shipped by
 * `@deepseek-ai/dsh-client-ui-plugin-manager`): a row gains its configure
 * control only when a client plugin registers the keyed slot
 * `plugins.row.config` under the key `<bundle package name>#<row id>`, and the
 * page passes `{ view, form }` to that registration. `form` carries the
 * namespace's live snapshot plus `mutate(ops, revision)`; the page resolves it
 * with the row id (`web-search-ollama`), which is exactly this plugin's
 * settings namespace.
 *
 * Hand-written ModuleLoader bundle — no build step required.
 */
window.__ModuleLoader__.load({
  id: "@jlvncn/dsh-web-search-ollama-client",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");
    var primitives = require("@deepseek-ai/dsh-client-ui-primitives");

    /** Locale namespace owned by this card. */
    var NS = "settings.webSearchOllama";
    /** Settings namespace (the loader entry id) this card edits. */
    var TARGET_NS = "web-search-ollama";
    /** Slot key: `<bundle package name>#<row id>`, as the bundle's patch declares them. */
    var ROW_KEY = "@jlvncn/dsh-web-search-ollama#web-search-ollama";

    var zh = {
      title: "Ollama 网页搜索",
      description: "Ollama 云端搜索 / 抓取提供方。",
      baseURL: "API 地址",
      baseURLHint: "Ollama API 根地址；搜索/抓取路径拼在其后。",
      searchPath: "搜索路径",
      searchPathHint: "POST 搜索端点路径，默认 /api/web_search。",
      fetchPath: "抓取路径",
      fetchPathHint: "POST 抓取端点路径，默认 /api/web_fetch。",
      apiKeyEnv: "密钥环境变量",
      apiKeyEnvHint: "apiKey 为空时从这里解析（credentials 优先，其次启动环境）。",
      snippetMax: "摘要上限（字符）",
      snippetMaxHint: "每条搜索结果 content 的截断长度。",
      searchTimeoutMs: "搜索超时（毫秒）",
      searchTimeoutMsHint: "一次搜索的取消上限。",
      fetchTimeoutMs: "抓取超时（毫秒）",
      fetchTimeoutMsHint: "一次抓取的取消上限。",
      apiVersion: "apiVersion（已弃用）",
      apiVersionHint: "保留字段，插件已不再使用。",
      apiKey: "API Key",
      apiKeyHint: "只写不读：留空保持当前密钥；也可留空并改用上面的环境变量。",
      overridden: "已覆盖",
      reset: "恢复默认",
      invalidNumber: "请填数字；留空表示恢复默认。",
      unavailable: "该插件当前未加载，暂时无法配置。",
      readOnly: "本部署的设置为只读。",
      saveFailed: "本部署没有接受这些值，已保留供你修改。",
      save: "保存",
      saving: "保存中…"
    };

    var en = {
      title: "Ollama web search",
      description: "Ollama-backed search and fetch provider.",
      baseURL: "Endpoint",
      baseURLHint: "Ollama API root; the search and fetch paths are appended to it.",
      searchPath: "Search path",
      searchPathHint: "POST search endpoint path, default /api/web_search.",
      fetchPath: "Fetch path",
      fetchPathHint: "POST fetch endpoint path, default /api/web_fetch.",
      apiKeyEnv: "Key variable",
      apiKeyEnvHint: "Resolved here when apiKey is empty (credentials first, then the launch environment).",
      snippetMax: "Snippet cap (characters)",
      snippetMaxHint: "Truncation length for each search result's content.",
      searchTimeoutMs: "Search timeout (ms)",
      searchTimeoutMsHint: "Cancellation bound for one search.",
      fetchTimeoutMs: "Fetch timeout (ms)",
      fetchTimeoutMsHint: "Cancellation bound for one fetch.",
      apiVersion: "apiVersion (unused)",
      apiVersionHint: "Retained field; the plugin no longer reads it.",
      apiKey: "API key",
      apiKeyHint: "Write-only: leave blank to keep the current key, or use the variable above instead.",
      overridden: "Overridden",
      reset: "Reset to default",
      invalidNumber: "Enter a number, or leave blank to use the default.",
      unavailable: "This plugin is not loaded, so it cannot be configured right now.",
      readOnly: "This deployment stores settings read-only.",
      saveFailed: "The deployment did not accept these values; they were left for you to correct.",
      save: "Save",
      saving: "Saving…"
    };

    /**
     * The section fields this card edits, in display order. `kind` decides how a
     * draft is parsed: `number` blocks the save until it is a finite number (an
     * empty draft clears the field back to the schema default).
     */
    var FIELDS = [
      { name: "baseURL", kind: "text" },
      { name: "searchPath", kind: "text" },
      { name: "fetchPath", kind: "text" },
      { name: "apiKeyEnv", kind: "text" },
      { name: "snippetMax", kind: "number" },
      { name: "searchTimeoutMs", kind: "number" },
      { name: "fetchTimeoutMs", kind: "number" },
      { name: "apiVersion", kind: "text" }
    ];

    /** Render one value the way its field shows it when no draft is staged. */
    function formatValue(value, kind) {
      if (kind === "number") return typeof value === "number" ? String(value) : "";
      return typeof value === "string" ? value : "";
    }

    /**
     * Turn one staged draft into a settings path operation.
     * @returns the op, or `undefined` when the draft cannot be written as it stands.
     */
    function parseDraft(text, kind, field) {
      var trimmed = String(text == null ? "" : text).trim();
      if (trimmed === "") return { op: "unset", path: [field] };
      if (kind === "number") {
        var parsed = Number(trimmed);
        return Number.isFinite(parsed) ? { op: "set", path: [field], value: parsed } : undefined;
      }
      return { op: "set", path: [field], value: trimmed };
    }

    /**
     * Build the card bound to one translator.
     *
     * The card stages edits locally and writes them only on save: each write is a
     * durable revision-fenced mutation, so committing as the user types would
     * turn one edit into writes nobody asked for.
     */
    function makeCard(t) {
      return function OllamaRowConfig(props) {
        var stagedState = react.useState({});
        var staged = stagedState[0];
        var setStaged = stagedState[1];
        var savingState = react.useState(false);
        var saving = savingState[0];
        var setSaving = savingState[1];
        var failedState = react.useState(false);
        var failed = failedState[0];
        var setFailed = failedState[1];

        if (props.view === "summary") return t("description");

        var form = props.form;
        var snapshot = form === undefined ? undefined : form.state;
        var ready = snapshot !== undefined && snapshot.status === "ready";
        var writable = ready && snapshot.writable !== false;
        var value = (ready && snapshot.value) || {};

        var textOf = function (field) {
          return staged[field.name] !== undefined ? staged[field.name] : formatValue(value[field.name], field.kind);
        };
        var changed = FIELDS.filter(function (field) {
          return staged[field.name] !== undefined && staged[field.name] !== formatValue(value[field.name], field.kind);
        });
        var invalidFields = changed.filter(function (field) {
          return parseDraft(textOf(field), field.kind, field.name) === undefined;
        });
        var keyDraft = staged.apiKey;
        var dirty = changed.length > 0 || (keyDraft !== undefined && keyDraft !== "");
        var labels = {
          unavailable: t("unavailable"),
          readOnly: t("readOnly"),
          saveFailed: t("saveFailed"),
          save: t("save"),
          saving: t("saving")
        };

        var onSave = function () {
          if (!form || !writable || saving || invalidFields.length > 0) return;
          var ops = [];
          changed.forEach(function (field) {
            var op = parseDraft(textOf(field), field.kind, field.name);
            if (op !== undefined) ops.push(op);
          });
          if (keyDraft !== undefined && keyDraft !== "") {
            ops.push({ op: "set", path: ["apiKey"], value: String(keyDraft) });
          }
          if (ops.length === 0) return;
          setSaving(true);
          setFailed(false);
          Promise.resolve(form.mutate(ops, snapshot.revision)).then(function (landed) {
            if (landed === true) setStaged({});
            else setFailed(true);
          }).catch(function () {
            setFailed(true);
          }).then(function () {
            setSaving(false);
          });
        };

        var onDiscard = function () {
          setStaged({});
          setFailed(false);
        };

        var fields = FIELDS.map(function (field) {
          var draftInvalid = staged[field.name] !== undefined && parseDraft(textOf(field), field.kind, field.name) === undefined;
          return react.createElement(primitives.SettingsValueField, {
            key: field.name,
            id: "plugin-config-ollama-" + field.name,
            label: t(field.name),
            hint: t(field.name + "Hint"),
            overriddenLabel: t("overridden"),
            resetLabel: t("reset"),
            invalidLabel: t("invalidNumber"),
            numeric: field.kind === "number",
            disabled: !writable,
            text: textOf(field),
            overridden: false,
            invalid: draftInvalid,
            onEdit: function (next) {
              setStaged(function (prev) {
                var copy = Object.assign({}, prev);
                copy[field.name] = next;
                return copy;
              });
            },
            onReset: function () {
              setStaged(function (prev) {
                var copy = Object.assign({}, prev);
                copy[field.name] = formatValue(value[field.name], field.kind);
                return copy;
              });
            }
          });
        });

        fields.push(react.createElement(primitives.SettingsSecretField, {
          key: "apiKey",
          id: "plugin-config-ollama-apiKey",
          label: t("apiKey"),
          hint: t("apiKeyHint"),
          disabled: !writable,
          text: keyDraft === undefined ? "" : keyDraft,
          configured: false,
          stateLabel: t("apiKeyHint"),
          onEdit: function (next) {
            setStaged(function (prev) {
              var copy = Object.assign({}, prev);
              copy.apiKey = next;
              return copy;
            });
          }
        }));

        return react.createElement(primitives.SettingsForm, {
          labels: labels,
          state: {
            available: ready,
            writable: writable,
            dirty: dirty,
            invalid: invalidFields.length > 0,
            saving: saving,
            failed: failed
          },
          onSave: onSave,
          onDiscard: onDiscard
        }, fields);
      };
    }

    /** Required services (cordis fiber inject). */
    var inject = ["slots", "locale", "configForms"];

    /**
     * Mount the row's configuration card while the Host serves the namespace.
     * @param ctx - the browser plugin context.
     */
    function apply(ctx) {
      var t = ctx.locale.bind(NS);
      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: zh, en: en });
      }, "web-search-ollama-client: dictionaries");
      ctx.effect(function () {
        return ctx.configForms.whileServed([TARGET_NS], function () {
          return ctx.slots.inject("plugins.row.config", function () {
            return ctx.slots.register({ name: "plugins.row.config", key: ROW_KEY }, makeCard(t));
          });
        });
      }, "web-search-ollama-client: row configuration");
    }

    exports.NS = NS;
    exports.TARGET_NS = TARGET_NS;
    exports.ROW_KEY = ROW_KEY;
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
