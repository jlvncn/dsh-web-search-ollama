/**
 * dsh-web-search-ollama-client — browser half.
 *
 * A "web-search-ollama" card inside the Web UI's plugin-configuration tab
 * (设置 → 插件设置 → 插件配置): edits the `web-search-ollama` settings
 * namespace (baseURL, search/fetch paths, snippet cap, timeouts, key ref)
 * through the settings scope transport. Changes hot-apply via the host
 * settings provider — no restart needed.
 *
 * Hand-written ModuleLoader bundle — no build step required.
 */
window.__ModuleLoader__.load({
  id: "dsh-web-search-ollama-client",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");
    var h = react.createElement;

    // ── CSS (theme tokens) ────────────────────────────────────────────────
    // Card chrome mirrors the official PluginCard.module.css so this card looks
    // and behaves like the built-in ones: a clickable header that discloses the
    // body in place, with a CSS-drawn chevron (no icon dependency).
    var CSS =
      ".__wso_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}" +
      ".__wso_card:hover{border-color:var(--dsw-alias-label-dimmed)}" +
      ".__wso_card_open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}" +
      ".__wso_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}" +
      ".__wso_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}" +
      ".__wso_header_text{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}" +
      ".__wso_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}" +
      ".__wso_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}" +
      ".__wso_chevron{display:inline-block;width:8px;height:8px;flex:none;border-right:1.5px solid var(--dsw-alias-label-tertiary);border-bottom:1.5px solid var(--dsw-alias-label-tertiary);transform:rotate(45deg);transition:transform .16s}" +
      ".__wso_chevron_open{transform:rotate(225deg)}" +
      ".__wso_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}" +
      ".__wso_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}" +
      ".__wso_field+.__wso_field{border-top:1px solid var(--dsw-alias-border-l2)}" +
      ".__wso_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5;display:flex;align-items:center;gap:6px}" +
      ".__wso_override{font-size:10px;color:var(--dsw-alias-state-business-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:4px;padding:0 4px}" +
      ".__wso_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}" +
      ".__wso_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;box-sizing:border-box;width:100%}" +
      ".__wso_input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}" +
      ".__wso_actions{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}" +
      ".__wso_btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:5px 14px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}" +
      ".__wso_btn:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary)}" +
      ".__wso_btn:disabled{opacity:.5;cursor:default}" +
      ".__wso_btnPrimary{border-color:var(--dsw-alias-state-business-primary,#3964fe);background:var(--dsw-alias-state-business-primary,#3964fe);color:#fff}" +
      ".__wso_status{font-size:12px;color:var(--dsw-alias-label-tertiary)}" +
      ".__wso_error{font-size:12px;color:var(--dsw-alias-state-error-primary)}" +
      ".__wso_unavailable{font-size:13px;color:var(--dsw-alias-label-tertiary);padding:14px 16px}";
    var tagId = "dsh-web-search-ollama-client/main.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-web-search-ollama-client";
      tag.dataset.pluginCss = tagId;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    // ── locale ────────────────────────────────────────────────────────────
    var NS = "webSearchOllama";
    var inject = ["slots", "locale", "settingsScope"];
    var zh = {
      title: "Ollama 网页搜索",
      description: "Ollama 云端搜索 / 抓取提供方。",
      intro: "Ollama 云端搜索配置：修改后即时生效（settings.yaml 热重载）。",
      apiKey: "API Key",
      apiKeyHint: "留空保持当前密钥。密钥只写不读，不会回显。",
      apiKeyEnv: "密钥环境变量",
      apiKeyEnvHint: "apiKey 为空时从该环境变量读取（credentials 解析）。",
      baseURL: "API 地址",
      baseURLHint: "Ollama API 根地址。",
      searchPath: "搜索路径",
      searchPathHint: "POST 搜索端点路径。",
      fetchPath: "抓取路径",
      fetchPathHint: "POST 抓取端点路径。",
      snippetMax: "摘要上限（字符）",
      snippetMaxHint: "每条搜索结果的 content 截断长度。",
      fetchTimeoutMs: "抓取超时（毫秒）",
      fetchTimeoutMsHint: "抓取请求的 abort 超时。",
      save: "保存",
      reset: "恢复默认",
      saved: "已保存",
      saving: "保存中…",
      error: "保存失败",
      unavailable: "设置命名空间不可用（服务端未注册 web-search-ollama 命名空间？）",
      overridden: "已覆盖",
      loading: "加载中…",
      collapse: "折叠",
      expand: "展开"
    };
    var en = {
      title: "Ollama Web Search",
      description: "Ollama cloud search / fetch provider.",
      intro: "Ollama cloud search config: changes apply immediately (settings.yaml hot-reload).",
      apiKey: "API Key",
      apiKeyHint: "Leave blank to keep the current key. The key is write-only and never echoed.",
      apiKeyEnv: "Key environment variable",
      apiKeyEnvHint: "Read from this env var when apiKey is empty (resolved via credentials).",
      baseURL: "API base URL",
      baseURLHint: "Ollama API root.",
      searchPath: "Search path",
      searchPathHint: "POST search endpoint path.",
      fetchPath: "Fetch path",
      fetchPathHint: "POST fetch endpoint path.",
      snippetMax: "Snippet cap (chars)",
      snippetMaxHint: "Truncated content length per search result.",
      fetchTimeoutMs: "Fetch timeout (ms)",
      fetchTimeoutMsHint: "Abort timeout for fetch requests.",
      save: "Save",
      reset: "Reset",
      saved: "Saved",
      saving: "Saving…",
      error: "Save failed",
      unavailable: "Settings namespace unavailable (web-search-ollama namespace not registered server-side?)",
      overridden: "overridden",
      loading: "Loading…",
      collapse: "Collapse",
      expand: "Expand"
    };

    // ── field spec ────────────────────────────────────────────────────────
    var FIELDS = [
      { key: "baseURL", label: "baseURL", type: "text", placeholder: "https://ollama.com" },
      { key: "apiKey", label: "apiKey", type: "password", secret: true },
      { key: "apiKeyEnv", label: "apiKeyEnv", type: "text" },
      { key: "searchPath", label: "searchPath", type: "text", placeholder: "/api/web_search" },
      { key: "fetchPath", label: "fetchPath", type: "text", placeholder: "/api/web_fetch" },
      { key: "snippetMax", label: "snippetMax", type: "number" },
      { key: "fetchTimeoutMs", label: "fetchTimeoutMs", type: "number" }
    ];
    var ZH_HINTS = {
      apiKey: "apiKeyHint",
      apiKeyEnv: "apiKeyEnvHint",
      baseURL: "baseURLHint",
      searchPath: "searchPathHint",
      fetchPath: "fetchPathHint",
      snippetMax: "snippetMaxHint",
      fetchTimeoutMs: "fetchTimeoutMsHint"
    };

    function labelOf(f, t) {
      return t(f.key) !== f.key ? t(f.key) : f.label;
    }

    // ── component ─────────────────────────────────────────────────────────
    function OllamaCard(props) {
      var t = props.t;
      var scope = props.scope;
      var [open, setOpen] = react.useState(false);
      var [snapshot, setSnapshot] = react.useState(function () { return scope.getSnapshot(); });
      var ready = snapshot.status === "ready" && snapshot.value !== void 0;
      var [draft, setDraft] = react.useState({});
      var [busy, setBusy] = react.useState(false);
      var [notice, setNotice] = react.useState(null);
      var [error, setError] = react.useState(null);

      react.useEffect(function () {
        scope.load();
        var alive = true;
        var sync = function () { if (alive) setSnapshot(scope.getSnapshot()); };
        var un = typeof scope.subscribe === "function" ? scope.subscribe(sync) : null;
        return function () { alive = false; if (un) un(); if (scope.dispose) scope.dispose(); };
      }, [scope]);

      react.useEffect(function () {
        if (ready) setDraft(function (prev) { return Object.assign({}, prev, valueToDraft(snapshot.value)); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [ready]);

      if (snapshot.status === "unavailable") {
        return h("li", { className: "__wso_unavailable" }, t("unavailable"));
      }
      if (!ready) return h("li", { className: "__wso_status" }, t("loading"));

      var value = snapshot.value;
      var user = snapshot.user || {};

      function fieldDraft(f) {
        return draft[f.key] !== void 0 ? draft[f.key] : String(value[f.key] ?? "");
      }
      function setField(f, v) {
        setDraft(function (prev) {
          var next = Object.assign({}, prev);
          next[f.key] = v;
          return next;
        });
        setNotice(null);
        setError(null);
      }

      function onSave() {
        setBusy(true); setNotice(null); setError(null);
        var writes = FIELDS.map(function (f) {
          var d = fieldDraft(f);
          if (f.type === "password") {
            if (!d) return Promise.resolve();
            if (d === String(value[f.key] ?? "")) return Promise.resolve();
            return scope.set(f.key, d);
          }
          if (String(d) === String(value[f.key] ?? "")) return Promise.resolve();
          if (String(d).trim() === "" && !(f.key in user)) return Promise.resolve();
          return String(d).trim() === "" ? scope.unset(f.key) : scope.set(f.key, f.type === "number" ? Number(d) : d);
        });
        Promise.all(writes).then(function () {
          setBusy(false); setNotice(t("saved"));
          if (scope.load) scope.load();
        }).catch(function (e) {
          setBusy(false); setError(t("error") + ": " + String(e && e.message || e));
        });
      }

      function onReset() {
        setBusy(true); setNotice(null); setError(null);
        Promise.all(FIELDS.map(function (f) { return scope.unset(f.key); })).then(function () {
          setBusy(false); setNotice(t("saved"));
          reseedDraft();
        }).catch(function (e) {
          setBusy(false); setError(t("error") + ": " + String(e && e.message || e));
        });
      }

      function reseedDraft() {
        if (typeof scope.load === "function") {
          var p = scope.load();
          if (p && typeof p.then === "function") {
            p.then(function () {
              var fresh = scope.getSnapshot();
              if (fresh.status === "ready" && fresh.value !== void 0) setDraft(Object.assign({}, valueToDraft(fresh.value)));
            }).catch(function () {});
            return;
          }
        }
        setTimeout(function () {
          var fresh = scope.getSnapshot();
          if (fresh.status === "ready" && fresh.value !== void 0) setDraft(Object.assign({}, valueToDraft(fresh.value)));
        }, 120);
      }

      return h("li", { className: open ? "__wso_card __wso_card_open" : "__wso_card" },
        h("button", {
          type: "button",
          className: "__wso_header",
          "aria-expanded": open,
          "aria-label": (open ? t("collapse") : t("expand")) + ": " + t("title"),
          onClick: function () { setOpen(!open); }
        },
          h("span", { className: "__wso_header_text" },
            h("span", { className: "__wso_name" }, t("title")),
            h("span", { className: "__wso_description" }, t("description"))
          ),
          h("span", { className: open ? "__wso_chevron __wso_chevron_open" : "__wso_chevron" })
        ),
        open ? h("div", { className: "__wso_body" },
          h("p", { className: "__wso_hint", style: { margin: "0 0 4px" } }, t("intro")),
          FIELDS.map(function (f) {
            var overridden = f.key in user;
            var hintKey = ZH_HINTS[f.key];
            return h("label", { key: f.key, className: "__wso_field" },
              h("span", { className: "__wso_label" },
                labelOf(f, t),
                overridden ? h("span", { className: "__wso_override" }, t("overridden")) : null
              ),
              h("input", {
                className: "__wso_input",
                type: f.type === "password" ? "password" : f.type === "number" ? "number" : "text",
                value: fieldDraft(f),
                placeholder: f.type === "password" ? (overridden ? "••••••••" : t("apiKeyHint")) : (f.placeholder || ""),
                onChange: function (e) { setField(f, e.target.value); }
              }),
              hintKey && t(hintKey) ? h("span", { className: "__wso_hint" }, t(hintKey)) : null
            );
          }),
          h("div", { className: "__wso_actions" },
            h("button", { type: "button", className: "__wso_btn __wso_btnPrimary", onClick: onSave, disabled: busy || !snapshot.writable }, t("save")),
            h("button", { type: "button", className: "__wso_btn", onClick: onReset, disabled: busy || !snapshot.writable }, t("reset")),
            notice ? h("span", { className: "__wso_status" }, notice) : null,
            busy ? h("span", { className: "__wso_status" }, t("saving")) : null,
            error ? h("span", { className: "__wso_error" }, error) : null
          )
        ) : null
      );
    }

    function valueToDraft(value) {
      var out = {};
      for (var i = 0; i < FIELDS.length; i += 1) {
        var f = FIELDS[i];
        out[f.key] = String(value[f.key] ?? "");
      }
      return out;
    }

    // ── plugin ────────────────────────────────────────────────────────────
    function apply(ctx) {
      var t = ctx.locale.bind(NS);
      ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }); }, "dsh-web-search-ollama-client: dictionaries");
      var scope = ctx.settingsScope.bind({ namespace: "web-search-ollama" });
      ctx.slots.inject("settings.plugin.item", function () {
        return ctx.slots.register({
          name: "settings.plugin.item",
          id: "web-search-ollama",
          key: "web-search-ollama",   // settings.plugin.item is a keyed slot; key = namespace
          order: 30,
          locale: NS,
          inject: function () { return { hooks: {} }; }
        }, function (props) {
          return h(OllamaCard, Object.assign({}, props, { scope: scope }));
        });
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
