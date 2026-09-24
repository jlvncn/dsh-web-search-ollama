# DSH 0.1.7-rc.1 升级影响评估（web-search-ollama）

- 评估日期：2026-09-24
- 上游：`@deepseek-ai/dsh` 0.1.6-rc.x → **0.1.7-rc.1**（core 自带 schemastery 3.18.4）
- 结论：**破坏性变更，已修复（v0.1.6）**

## 1. 破坏点

### 1.1 `settings.installSection` 被移除（启动即报错）

0.1.2 → 0.1.7 之间，配置节的所有权从“插件自己安装”改为“loader 条目 schema 自动投影”：

| 版本 | 配置节机制 |
|------|-----------|
| ≤ 0.1.1 | 模块导出 `installSettingsSection` / `settingsNamespace` |
| 0.1.2 – 0.1.6 | `SettingsService.installSection(ctx, ns, schema, config, hooks)` |
| **0.1.7** | 无安装调用：`SettingsForms.describe()` 扫描 loader 条目，用条目 schema 中**标记 `volatile()` 的字段**自动生成配置节；`settings.configure({auto})` 只控制是否生成页面 |

症状：`dsh web` 启动日志出现
`TypeError: settingsCtx.settings.installSection is not a function`，
插件 `apply` 中断，Ollama 搜索 provider 未注册（条目仍显示 active，属静默失败）。

### 1.2 具名导出的 `Config` 对 harness 不可见（配置卡片失效）

`cordis-plugin-loader` 的 `unwrapExports()`：

```js
exports = exports.default ?? exports;
if (!exports.__esModule) return exports;   // 普通对象到此为止，不再合并具名导出
```

模块同时有 `default`（`{name, inject, apply}`）与具名 `Config` 时，harness 只拿到 `default` → `fiber.runtime.Config === undefined` → 该条目既没有 volatile 实时值，也不进 `settings.describe()`，Web UI 卡片提示“命名空间不可用”。官方 in-tree 插件（如 `dsh-web-search-deepseek`）只有具名导出，故不受影响。

### 1.3 浏览器端 `settingsScope` 服务被移除（client 条目 pending）

服务端与浏览器端在 0.1.7 一起重构了配置机制：

| 0.1.2–0.1.6（浏览器） | 0.1.7（浏览器） |
|---|---|
| `settingsScope` 服务：`bind({namespace})` → describe/update | `configForms` 服务：`get(entryId)` 取表单、`whileServed([ns], cb)` 跟随可用性、`describe()` 读镜像 |
| 卡片注册进 `settings.plugin.item` 插槽 | 注册进 `plugins.item` 插槽，控件用 `@deepseek-ai/dsh-client-ui-primitives` 的 `SettingsForm` / `SettingsValueField` / `SettingsSecretField` + `SettingsFormModel` |

`dsh-web-search-ollama-client` 的 `inject = ["slots","locale","settingsScope"]` 里已无 `settingsScope`，条目永远 pending，Web UI 启动时提示 `web boot: 1 entry did not activate`。

**处理（v0.1.7）：停用浏览器半**，改用内置自动生成表单（宿主 schema 已可见，`autoGenerate: true`）。这样配置入口回归 harness 官方机制，不再随客户端 API 变动而失效。若要恢复自定义卡片，按上表新契约重写。

#### 浏览器半若要移植（0.1.7 契约要点）

- `inject = ["slots", "locale", "remote", "remote.credentials", "configForms"]`
- `ctx.configForms.get("web-search-ollama")` → 传入 `new SettingsFormModel(scope, [settingsTextField("baseURL"), settingsNumberField("snippetMax"), …], [{field:"apiKey", write}])`
- 注册：`ctx.effect(() => ctx.configForms.whileServed([NS], () => ctx.slots.inject("plugins.item", () => ctx.slots.register({name:"plugins.item", id:"web-search-ollama", order: 40, label: () => t("title"), locale: NS, inject: () => card.inject()}, Card))))`
- `package.json` 增加 `dsh.client.inject`（列出依赖的客户端包，如 `@deepseek-ai/dsh-client-ui-primitives`）

## 2. 修复（v0.1.6）

- `apply` 不再调用 `installSection`；可编辑字段全部 `live(...)`（即 `volatile()`），操作时经 `unwrapConfig()` 读取实时 ref → 保存即时生效（等价旧 `setSource` 行为）。
- `Config` 同时挂到 `default` 导出对象：`export default { name, inject, Config: ConfigSchema, apply }`（**不能只用具名导出**）。
- 移除 `@deepseek-ai/dsh-settings` 导入与旧 type shim；`live()` 兼容尚无 `volatile()` 的 schemastery（monorepo devDep 3.18.1），退化为普通值。
- `peerDependencies` 未收紧（兼容发布路径），最低核心版本记在 CHANGELOG：**≥ 0.1.7-rc.1**。

## 3. 验证记录（2026-09-24）

| 项目 | 方法 | 结果 |
|------|------|------|
| 模块形状 | `node test.mjs`（monorepo + profile 树） | OK |
| provider 行为 | `node test-providers.mjs`（8 项，含“不写会话事件”回归守卫） | 8/8 passed |
| 插件激活 | `dsh web --port 0` + `pluginInventory/list` | `include:web-search-ollama` `fiberPhase: active` |
| 配置节注册 | `settings/describe` | `web-search-ollama` 在列，`autoGenerate: true`，`applies: live`，8 个非密字段实时值正确 |
| 上游连通 | `POST https://ollama.com/api/web_search`（launch-environment 凭证） | 200，返回结果 |
| 停用后空载（v0.1.7） | `dsh web --port 0` + `pluginInventory/list` + `settings/describe` | 无诊断文件；只余 host 条目，`enabled but not active: []`；命名空间仍在 |

> 说明：主机名/端口等运行命令见 INSTALL 流程；配置卡片（`dsh-web-search-ollama-client`）依赖的命名空间随 1.2 一并恢复。
