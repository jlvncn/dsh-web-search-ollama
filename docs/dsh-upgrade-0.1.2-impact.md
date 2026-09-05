# dsh-web-search-ollama × DSH 0.1.2 升级影响评估与复验清单

> 评估日期：2026-09-03 · 评估对象：官方 `@deepseek-ai/dsh` **0.1.2-rc.1**（next 通道，2026-09-03 发布）
> 评估时基线：`0.1.1-rc.2`（= npm `latest` 稳定通道）
> 方法：npm 实物对比两版 8 个官方子包（dsh-settings / dsh-web / dsh-session / dsh-client-modules / dsh-client-runtime / dsh-host-apiproxy / dsh-api-gateway / dsh-cordis-client-runner）+ 官方 `dsh-web-search-deepseek` 两版样板对比 + 官方 Discussions 追踪。

---

## 执行状态更新（2026-09-05）

> 本插件已按 §4.1 完成适配并发布 **v0.1.2**（host 包代码 + 构建产物）。

- ✅ **host 适配完成**：`installSettingsSection` / `settingsNamespace` → `ctx.inject(["settings"])` + `settingsCtx.settings.installSection(...)`（命名空间用字符串字面量），与官方 0.1.2 `dsh-web-search-deepseek` 样板一致；`tsc` 零错误、模块加载测试通过。
- ✅ **profile 同步并冒烟验证**：构建产物已同步到 `$DSH_HOME/profiles/node_modules/`；`dsh web`（dsh 0.1.2-rc.1）插件树加载成功（进程仅因 3080 端口被另一实例占用而止步于 webserver 监听，非插件错误）。
- ⚠️ **运行时最低要求变更**：dsh-settings 0.1.1-rc.2 尚无 `installSection` 服务方法 → 插件 v0.1.2 **仅适配 dsh ≥ 0.1.2-rc.1**；0.1.1 环境请停留在 v0.1.1。
- ✅ **v0.1.3（2026-09-05）彻底弃旧**：peerDependencies 与 devDeps 全部收紧到 `^0.1.2-rc.1`，删除本地类型 shim（改用 `import type {}` 引入官方 `Context.settings` augmentation）；自 v0.1.3 起插件**不再兼容 dsh < 0.1.2-rc.1**（安装期即报 peer 冲突）。v0.1.0/v0.1.1/v0.1.2 的 tag 与 release 保留，可回退。
- ⏳ **未执行项**（受官方未修 bug / 策略影响，见 §0、§3）：client 前端整树加载验证（官方 #5544）、dsh-session 事件落库实测、credentials 双路实测、正式版复验清单。

---

## 0. 一句话结论

**rc 阶段不要升级**：0.1.2-rc.1 存在官方自身的前端 client-modules 加载 bug（Discussion [#5544](https://github.com/deepseek-ai/deepseek-harness/discussions/5544)，Web UI 整树加载失败，官方未回复，workaround = 留在 latest），且插件 host 侧有一个**必须改代码才能兼容**的 breaking change（`dsh-settings` 移除两个 API）。等 0.1.2 正式版 + #5544 修复后再升；升级时按本文件 §4 适配、§5 复验。

## 1. 影响分级总表

| 插件接触面 | 0.1.2 变化 | 影响 | 动作 |
|---|---|---|---|
| `@deepseek-ai/dsh-settings`：`installSettingsSection` / `settingsNamespace` | **移除**（改为 `SettingsProvider` 方法 `installSection`，逻辑等价） | 🔴 **Breaking**：插件 `index.js` import 即崩 | §4.1 改 host 代码 |
| 官方 `dsh-web-search-deepseek` 样板 | 已切换到新 `installSection` 写法 + `@deepseek-ai/dsh-credentials` | 参照物 | 照抄其 apply 结构 |
| `@deepseek-ai/dsh-web`：`WebError` / `registerSearchProvider` / `registerFetchProvider` | 导出面、错误码枚举、选择语义**完全一致**；新增 `$DSH_WEB_SEARCH_PROVIDER` env 覆盖 | 🟢 兼容 | 无 |
| provider 抛出的 code（`WEB_PROVIDER_ERROR` 等） | 开放字符串 code 机制不变，dsh-web 只枚举 provider 注册类错误 | 🟢 兼容 | 无 |
| `dsh-session` known-event-types | `web/deepseek-search-llm-request` 两版均在 | 🟢 兼容 | 无 |
| `dsh-session` 会话 API | 0.1.2 重构（append-only log / surfaceOp / seq 强类型，`Session.events` 被 `seq`+`eventAt()`+`snapshotEvents()` 取代） | 🟡 需实测 | 插件的审计 `session.append(...)` 是 best-effort + try/catch，预计可用；升级后实测事件是否落库 |
| `ctx.credentials.resolve(envName)` | 0.1.2 独立成 `@deepseek-ai/dsh-credentials`（`CredentialProvider`），服务名与 `resolve` 保留 | 🟢/🟡 兼容性高 | 升级后实测环境变量与 credentials 两路取 key |
| **client 包加载机制** | `dsh-client-runtime` **0.1.2 移除**；`dsh-client-modules` 规则面措辞不变，但 **0.1.2-rc.1 自身有 externals drift bug**（#5544：官方 controller 包的 `require` 未编入 manifest → 前端整树加载失败） | 🔴 **阻塞验证** | §3：等官方修复 |
| settings RPC 通道（host-apiproxy） | `dsh-host-apiproxy` **0.1.2 移除**，功能并入 `dsh-api-gateway`（29KB→80KB） | 🟡 需实测 | 升级后复验 `settings.describe` 仍返回 `web-search-ollama`；client 走官方 settingsScope 抽象，应跟随官方 |
| Web GUI 访问鉴权 | 0.1.2 引入一次性 token auth（`?token=` → signed cookie，见 [#5519](https://github.com/deepseek-ai/deepseek-harness/discussions/5519)） | 🟡 影响验证脚本 | README 的 localhost curl 复验命令若被鉴权拦截需调整 |
| peerDependencies 声明 | 插件 peer 为 `^0.1.0-rc.6`（<0.2.0），0.1.2-rc.1 在范围内 | 🟢 可解析 | 不阻安装（但代码不兼容，见上） |

## 2. 代码级证据（2026-09-03 实测）

### 2.1 `dsh-settings` 导出面变化（Breaking 实证）

```
0.1.1: export { SettingsConflictError, SettingsProvider, SettingsProvider as default,
               deepEqualJson, installSettingsSection, redactSecrets, settingsNamespace }
0.1.2: export { SettingsConflictError, SettingsProvider, SettingsProvider as default,
               redactSecrets }
       # installSettingsSection / settingsNamespace / deepEqualJson 已移除
```

0.1.2 中 `SettingsProvider.installSection(owner, ns, schema, entry, hooks)`（lib/index.js:327）的实现在逻辑上是 0.1.1 模块级 `installSettingsSection` 的**原样搬迁**：`register(ns, schema, {base, validate})` + `hooks.setSource(() => scope.get())` + 卸载回退 `setSource(() => entry)` + `onChange()` + `scope.watch`。hook 契约 `{setSource, onChange, validate?}` 不变。命名空间由内部 `parseSettingsNamespace` 校验（小写连字符格式，`web-search-ollama` 合规）。

### 2.2 官方 0.1.2 样板（`dsh-web-search-deepseek`）

```js
// 0.1.2 官方写法（apply 内）：
ctx.inject(["settings"], (settingsCtx) => {
  settingsCtx.settings.installSection(ctx, NS, Config, config, {
    setSource: (source) => { current = source; },
    onChange: () => {}
  });
});
ctx.web.registerSearchProvider(new DeepSeekSearchProvider(() => resolveOptions(ctx, current())));
// 0.1.1 官方写法 == 本插件 0.1.1 写法 == 已移除的模块级 installSettingsSection
```

### 2.3 其余面（结论已列于 §1，均有源码比对依据）

## 3. 升级时机的阻塞项

| # | 阻塞 | 出处 | 影响 |
|---|---|---|---|
| B1 | `dsh-host-apiproxy` / `dsh-client-runtime` 在 0.1.2 移除、api-gateway 吸收——settings RPC 与 client 运行时的**新契约未经官方插件生态验证** | npm tarball 对比 | 需 0.1.2 生态稳定后实测 |
| B2 | **0.1.2-rc.1 前端 client-modules externals drift**：官方 controller 包加载即失败，第三方 client bundle 同理 | Discussion [#5544](https://github.com/deepseek-ai/deepseek-harness/discussions/5544)（2026-09-03，0 回复） | Web UI 起不来 → 任何 client 侧验证无法进行 |
| B3 | 官方 release notes「Remote 网关统一、旧版 APIProxy 迁移移除」——插件 client 的 settings 读写通道底层变化 | release notes v0.1.2-rc.1 | 需升级后实测配置卡片读写 |

**结论：等 B2（#5544）被官方修复、0.1.2 出正式版后再升级。**

## 4. 升级时的插件适配改动（host 包，届时执行）

`packages/dsh-web-search-ollama/index.js` 需三处修改（client 包暂不预判，等 B2/B3 实测）：

1. **删除** `import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';`（dsh-settings 依赖保留与否待定——schema 校验是否还需要该包；`@deepseek-ai/schemastery` 保留）。
2. `const NS = settingsNamespace('web-search-ollama')` → `const NS = 'web-search-ollama';`（字符串字面量，格式合规即可）。
3. `apply()` 内的注册调用改为官方 0.1.2 样板：

```js
function apply(ctx, config) {
  let current = () => config;
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, NS, ConfigSchema, config, {
      setSource: (source) => { current = source; },
      onChange: () => {},
    });
  });
  ctx.web.registerSearchProvider(new OllamaSearchProvider(() => resolveOptions(ctx, current())));
  ctx.web.registerFetchProvider(new OllamaFetchProvider(() => resolveOptions(ctx, current())));
}
```

同步改 `src/index.ts` 源码与 `index.js` 构建产物（或跑 `npm run build`），并 `./scripts/install.sh` 同步 profile。peerDependencies 建议随后抬到 `^0.1.2-rc.1`（当前 `^0.1.0-rc.6` 虽能解析但不反映实际要求）。

## 5. 升级复验清单（升级 0.1.2 后逐项过）

### 5.1 加载与注册
- [ ] `dsh web` 启动无 host 插件报错（无 import/apply 崩溃）
- [ ] `POST /api/pluginInventory/list`：`web-search-ollama` 与 `web-search-ollama-client` 均 `enabled=true`（注意 0.1.2 若启用 token auth，localhost curl 需带 `?token=` 或改本地豁免方式）
- [ ] host 日志无 `settings namespace ... is not registered` / provider 注册失败

### 5.2 settings 通道（APIProxy → api-gateway 迁移验证）
- [ ] `POST /api/settings.describe`：namespaces 含 `web-search-ollama`，schema 仍为 8 字段（含 apiVersion）
- [ ] `settings.update` 写一个字段（如 snippetMax）→ `settings.yaml` 落盘 → 改回
- [ ] Web UI：设置 → 插件设置 → 插件配置 → Ollama 网页搜索卡片可展开、可保存（client-modules 修复后）

### 5.3 功能实测
- [ ] 搜索：`searchProvider: ollama` 生效（发起一次联网提问，命中 `/api/web_search`）
- [ ] 抓取：fetchProvider 走 `/api/web_fetch` 正常返回正文
- [ ] 凭证两路：`OLLAMA_API_KEY` 环境变量 / credentials 均能解析；无 key 时报 `WEB_PROVIDER_CREDENTIAL_MISSING`
- [ ] 审计事件：会话记录含 `web/deepseek-search-llm-request` 且**重启后可加载**（0.1.2 session 重构后重点验）

### 5.4 回归
- [ ] 取消语义：中断请求不残留、错误归类正常
- [ ] 超时：fetchTimeoutMs abort 生效

### 5.5 收尾
- [ ] 上述清单通过后更新插件 README/CHANGELOG，注明最低 DSH 版本要求
- [ ] 若 B2/B3 有变化（官方修复/新契约），回到本文件 §3 修订

## 6. 回滚方案

- 升级前备份：`~/.dsh/profiles/web/cordis.patch.yml`（install.sh 自带 .bak）、插件目录 `~/.dsh/profiles/node_modules/dsh-web-search-ollama{,-client}/`、`~/.dsh/settings.yaml`
- 回滚：`npm install -g @deepseek-ai/dsh@0.1.1-rc.2`（latest 通道）→ 重启 `dsh web` → 插件无需改动即回到 0.1.1 行为
- 数据安全：settings.yaml / credentials / profiles 均在 `~/.dsh`，升级/回滚不触碰

## 7. 参考文献

- 官方 release v0.1.2-rc.1（2026-09-03）：https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-rc.1
- Discussion #5544（client-modules drift，阻塞项）：https://github.com/deepseek-ai/deepseek-harness/discussions/5544
- Discussion #5545（官方网页搜索卡片 key UX 坑，参考）：https://github.com/deepseek-ai/deepseek-harness/discussions/5545
- Discussion #5519（0.1.2 token auth 副作用）：https://github.com/deepseek-ai/deepseek-harness/discussions/5519
- npm：`@deepseek-ai/dsh@0.1.2-rc.1`（next）/ `0.1.1-rc.2`（latest）

---

*本文件随仓库维护。到期建议：官方发布 0.1.2 正式版（或 #5544 修复）时复查 §3 的 B1/B2/B3 状态并更新本文。*
