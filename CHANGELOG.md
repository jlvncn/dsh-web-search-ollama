# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.1.9] - 2026-09-24

宿主半改成 **bundle**（可被 `dsh plugin` / Web 的 Plugins 页直接安装与管理），并清掉 0.1.8 审核时「有意保留」的两个本地 type shim —— 源码现在是**逐字官方写法**。这一步由一次真机实测驱动：把包以链接方式装进临时 profile 后，**配置表单静默消失**，根因是包自己解析到旧的 schemastery 3.18.1（没有 `volatile()`）。

### Added

- **bundle 形态**：`packages/dsh-web-search-ollama/cordis.patch.yml` + `package.json` 的 `dsh.bundle.patch`（并把 patch 纳入 `files`/`exports`）。装上即挂载自己的行；**不抢 `web` seam**（provider 选择仍由用户层决定）。
- **免 npm 的三条安装通道**（实测认证）：`dsh plugin --profile <p> add <本地目录>`（link，离线可用）、tarball URL、git 地址。registry 包名仍需 npm 凭据。

### Fixed

- **链接安装下配置表单消失（静默）**：包声明 `@deepseek-ai/schemastery: ^3.18.1`，`^` 允许解析到没有 `volatile()` 的 3.18.1；以 `link:` 方式安装时 Node 优先用包自己的 `node_modules`，于是所有字段退化为普通值 → `volatileForm(schema)` 为空 → 该条目不进 `settings/describe`，而搜索仍正常（**只有表单消失**）。收敛为官方的 **`~3.18.4`** 后修复，并在临时 profile 复验（命名空间 + 8 个字段回归）。

### Changed

- **删除两个本地 type shim**（`live()` 的 `volatile()` 保护、本地 `Volatile<T>` 接口）：devDeps 升到 `@deepseek-ai/schemastery ~3.18.4` / `@deepseek-ai/cordis ~4.0.4` 后直接 `import type { Context, Volatile } from '@deepseek-ai/cordis'` 并链式 `.volatile()`。审核文档里那三条「有意保留偏差」现在只剩 2 条（都属可选项）。
- 副本安装（`install.sh`）保留不变；profile patch 中的手写 `insert` 可迁移到 bundle 层（`dsh plugin add` 会自动写入依赖与 bundle 选择）。

### Verified (2026-09-24)

- 临时 profile：`dsh plugin --profile scratch add <本地目录>` → `link:` 依赖 + bundle 自动选中 → 组合树出现该行 → 启动后 `include:web-search-ollama` = `active`、无 pending、无诊断文件、`settings/describe` 含 `web-search-ollama`（`autoGenerate: true`，8 字段实时值）。
- 本机：`tsc` + 形状测试 + 8/8 行为测试。

## [0.1.8] - 2026-09-24

对照上游公开文档重新审核，把宿主半改写为**官方推荐写法**，不再保留自造的适配层。审核依据：`docs/cookbook/adding-a-settings-card.md`、`docs/subsystems/settings.md`、`docs/subsystems/web.md`、`docs/user/develop/basic/*`、`packages/boot/app-boot/README.md`（peer 校验规则）、`packages/boot/plugin-manager/README.md`（版本豁免）。

### Changed

- **Config 类型 = 官方形状**：`export interface Config` + 每个可编辑字段 `Volatile<T>`（`get()` 读实时值），`apply(ctx, config)` 内每次操作先 `snapshot(config)` 把全部实时字段读一次（官方原文：read `.get()` when starting an operation / 一次请求只用一份一致快照）。删掉自造的 `unwrap()`、`unwrapConfig()` 与条件类型推导。
- **导出 = 官方模块形状**：改用具名导出（`Config` / `name` / `inject` / `apply`，与 in-tree 插件一致），移除 `default` 导出。loader 的 `unwrapExports()` 只在模块**存在** `default` 时才收敛为它；具名模块的整个命名空间对 harness 可见，因此不再需要「把 Config 挂到 default 上」这种补救。
- **peerDependencies 对齐官方范围语义**：删除已不再导入的 `@deepseek-ai/dsh-settings`；`@deepseek-ai/dsh-web` 从 `^0.1.2-rc.1` 收敛为 **`>=0.1.7-rc.1 <0.2.0`**。旧范围在 prerelease 参与匹配的规则下会放行 0.1.2–0.1.6，而那些核心没有 0.1.7 的 Config/volatile 机制 —— 会静默失效；官方在**组合期**校验每个声明的 dsh peer 范围，现在声明与运行期一致（校验规则见 app-boot README §profiles）。
- `pnpm-lock.yaml` 随之刷新（importer 记录新的 peer 解析结果）。
- 测试同步：`test.mjs` 支持官方具名模块形状；`test-providers.mjs` 新增 `config()` 助手，按 harness 的方式传实时 ref、并按 schema 补默认值。

### Notes

- 官方文档确认、本插件**原本就符合**的约定：`available()` 只做本地廉价检查（不联网）；`truncated` 由 seam 设置（provider 返回 `false`）；`maxResults` 在请求层做成本优化、边界仍由 seam 强制；`role('secret')` 字段不进表单响应；结构性字段（`enableFetchProvider`）不标 volatile 因而**不进**配置表单；错误码使用官方 seam 词汇（`WEB_PROVIDER_ERROR` / `WEB_ABORTED`），自定义码被允许；插件包未声明 `dsh.bundle`（库而非 bundle），与官方一致。
- 仍保留两个**本地 type shim**（`live()` 的 `volatile()` 存在性保护、本地 `Volatile<T>` 接口声明）：monorepo devDeps 仍在 schemastery 3.18.1 / cordis 4.0.2 / dsh-web 0.1.2-rc.1，尚未进入 0.1.7 区间；运行期解析的是 harness 自带的 3.18.4 / 4.0.4，语义不受影响。devDeps 升级后可按源码 TODO 删除。
- 审核结论与逐条对照见 `docs/official-alignment-audit.md`。

## [0.1.7] - 2026-09-24

v0.1.6 的后续补丁：**停用浏览器半**。宿主半在 0.1.7 下已正常工作，但客户端卡片仍卡在 pending —— harness 0.1.7 把浏览器端配置机制从 `settingsScope` 换成了 `configForms` + `plugins.item` 插槽，手写 bundle 不再适配。

### Changed

- **浏览器半（`dsh-web-search-ollama-client`）停用**：harness 0.1.7 移除了客户端 `settingsScope` 服务，该条目永远 `pending`，Web UI 启动时提示 `web boot: 1 entry did not activate`。`scripts/install.sh` 与 `profile/cordis.patch.yml` 不再安装/挂载它；包保留在仓库（v0.1.7 之前可用、可回退）。
- **配置入口改为内置自动生成表单**：宿主半的 `Config` schema 现在对 harness 可见（v0.1.6 修复），内置插件管理器按 schema 在「设置 → 插件设置 → 插件配置」生成 `web-search-ollama` 表单（`autoGenerate: true`，`applies: live`），字段与旧卡片一致且保存即时生效；不再需要维护手写浏览器代码（这是该机制第二次因升级而失效，故不再自建）。
- `peerDependencies` 未收紧；最低核心版本仍为 **≥ 0.1.7-rc.1**，旧版本（≤ v0.1.6）tag/release 保留可回退。

### Notes

- 想恢复自定义卡片，需要按 0.1.7 客户端契约重写：`inject = ["slots","locale","remote","remote.credentials","configForms"]`，用 `ctx.configForms.get('web-search-ollama')` 取表单、`ctx.slots.register({name:'plugins.item', ...})` 注册，控件用 `@deepseek-ai/dsh-client-ui-primitives` 的 `SettingsForm` / `SettingsValueField` / `SettingsSecretField`，并在 `package.json` 的 `dsh.client.inject` 里声明依赖包。

## [0.1.6] - 2026-09-24

适配 DSH **0.1.7-rc.1**：官方移除了 `SettingsForms.installSection`（配置节不再由插件自己安装，改由 loader 条目 schema 自动生成），未适配的插件在启动日志里抛 `settingsCtx.settings.installSection is not a function`，Ollama 搜索 provider 静默不注册。

### Fixed

- **配置节注册失败（严重）**：`settingsCtx.settings.installSection(...)` 在 0.1.7-rc.1 已不存在，`apply` 抛出 TypeError，provider 注册语句永远执行不到。现改为官方 0.1.7 机制：可编辑字段标 `volatile()`，每次操作经 `unwrapConfig()` 读取实时值 → 保存后即时生效（与旧 `installSection` 的 `setSource` 行为对齐）。
- **schema 对 harness 不可见（严重）**：loader 的 `unwrapExports` 只取模块的 `default` 导出，而本插件的 `Config` 此前只有具名导出 → 条目没有 schema：既拿不到 volatile 实时值，也不会出现在 `settings.describe` 中，Web UI 配置卡片显示“命名空间不可用”。现把 `Config` 一并挂在 default 导出对象上。

### Changed

- 删除对 `@deepseek-ai/dsh-settings` 的导入（0.1.7 已无该 API）；`Context.settings` augmentation 与旧 type shim 一并移除。
- `volatile()` 由本地 `live()` 包装：monorepo devDep 的 schemastery（3.18.1）尚无该标记时退化为普通值（模块仍可加载，`pnpm test` 不受影响）；harness 自带的 3.18.4 下为实时 ref。
- `enableFetchProvider` 保持非 volatile：fetch provider 的注册是结构性的，改它需要重载。
- **运行时要求：`@deepseek-ai/dsh` ≥ 0.1.7-rc.1**（已在 0.1.7-rc.1 实测）。按兼容发布处理，`peerDependencies` 不收紧；旧版本（≤ v0.1.5）的 tag 与 release 保留可回退。

## [0.1.5] - 2026-09-10

修复性升级：**停止写入会话事件**（历史遗留 v0 会话打不开的根因）、修正超时分类、搜索补齐超时、凭证解析对齐启动环境、Ollama fetch provider 改为可选注册。

### Fixed

- **会话损坏（严重）**：host 半此前把每次搜索/抓取记录成官方事件 `web/deepseek-search-llm-request`。该事件由官方 `dsh-web-search-deepseek` 拥有，其已发布 v0 载荷被冻结为官方请求体（`model` / `max_tokens` / `messages` / `tools`）；插件写入的 Ollama 体（`{query,max_results}` / `{url}`）会让**任何包含该事件的 v0 格式会话无法通过 `dsh-session-format-v0-to-v1` 迁移**，读取时报 `body has unexpected member "query"` 并拒绝打开。现移除该审计事件，插件不再写入任何会话事件。仓库外插件也无法注册自己的必需事件类型（`SessionEventMap` 的类型扩展不在构建期静态词表 `KNOWN_SESSION_EVENT_TYPES` 内，且 `Session.append()` 不暴露 `ignorable` 标记），因此也无法简单改用自定义事件名。
- **超时被误报为取消**：fetch 的 `catch` 先判断合并信号已 abort、再判断 `TimeoutError`，导致超时永远走 `WEB_ABORTED`，专门的超时分支不可达。现按来源区分：调用方 `signal` 取消 → `WEB_ABORTED`；`AbortSignal.timeout` 触发 → `WEB_PROVIDER_ERROR`（消息含 `timed out`）。
- **搜索无超时**：`fetchTimeoutMs` 只作用于抓取，搜索挂起会无限等待。新增 `searchTimeoutMs`（默认 30000）。

### Changed

- **Ollama fetch provider 改为可选**：新增 `enableFetchProvider`（默认 `false`）。此前无条件注册会让 `ctx.web` 同时存在内置 `http` 与 `ollama` 两个可用抓取 provider，未显式固定 `fetchProvider` 时抓取报多 provider 冲突。现默认只注册搜索 provider；需要时在 loader 配置中打开并把 `fetchProvider` 固定为 `ollama`。
- **凭证/环境解析对齐启动环境**：环境兜底由 `process.env` 改为优先读 launcher 的 launch-environment 快照（覆盖 process / 项目 `.env` / `$DSH_HOME/.env`），再回退 `process.env`；不新增运行时依赖。
- `apiVersion` 变为保留字段（不再产生任何效果）；Web UI 配置卡片移除该字段，改为展示 `searchTimeoutMs`。
- 文档与示例 patch 同步；`package.json` 修正 `files`（纳入 `src`，使 `types` / `exports["./src/*"]` 生效），移除指向不存在文件的 `dsh.bundle.patch` 声明；版本号统一为 `0.1.5`。
- 新增 `test-providers.mjs`（8 项行为测试，含"绝不写会话事件"回归守卫）；`pnpm test` 现在同时运行形状测试与行为测试。

### Notes

- 磁盘上已有的历史 v0 会话**不会**因升级本插件而恢复，需要单独做一次性 v0→v3 迁移。

## [0.1.4] - 2026-09-05

修复 host 半同时注册搜索/抓取 provider 导致的 **web_fetch 多 provider 冲突**，并沉淀升级评估文档。

### Fixed

- **web_fetch 不可用（多 provider 冲突）**：host 半在 `ctx.web` 上同时注册搜索与抓取 provider（id 均为 `ollama`）。示例补丁（`profile/cordis.patch.yml`）此前只固定 `searchProvider: ollama` 而未固定 `fetchProvider`，导致抓取侧同时存在内置 `http` 与插件 `ollama` 两个可用 provider，`web_fetch` 报 `multiple usable web providers are registered (http, ollama); configure one explicitly` 并拒绝执行。现补丁固定 `fetchProvider: http`（搜索走 Ollama、抓取走内置通用 http；如需抓取也走 Ollama 可改为 `fetchProvider: ollama`，需 `/api/web_fetch` + key 可达）。

### Added

- **`UPGRADE_EVALUATION_GUIDE.md`**：DSH 版本升级评估通用流程（依赖链审计、API 用法映射、验证计划）。验证计划明确要求**运行时真实调用 `web_fetch` + `web_search`**——配置层冲突只在工具被调用时才暴露，加载期不会报错。
- 升级影响评估文档（`docs/dsh-upgrade-0.1.2-impact.md`）§5.3 补充内置 http 抓取复验项与多 provider 冲突警示。

## [0.1.3] - 2026-09-05

彻底切换到 DSH 0.1.2 API，**不再兼容 0.1.1 及更早**（旧版本 v0.1.0/v0.1.1/v0.1.2 的 tag 与 release 均保留，可回退）。

### Changed

- `peerDependencies` 收紧：`@deepseek-ai/dsh-settings` 与 `@deepseek-ai/dsh-web` 由 `^0.1.0-rc.6` → **`^0.1.2-rc.1`**（最低 dsh 0.1.2-rc.1；在 0.1.1 环境安装时即报 peer 冲突，把运行期崩溃提前到安装期暴露）。
- monorepo `devDependencies` 对齐 `0.1.2-rc.1`（此前 `0.1.1-rc.2`），并删除 `src/index.ts` 中为旧类型编写的本地 `SettingsLike` shim，恢复官方直接调用 `settingsCtx.settings.installSection(...)`（以 `import type {} from '@deepseek-ai/dsh-settings'` 引入 0.1.2 的 `Context.settings` augmentation，运行时零开销）。
- 内部：cordis devDependency `^4.0.1` → `^4.0.2`（与 dsh-settings 0.1.2 的 peer 对齐）。

## [0.1.2] - 2026-09-05

适配 DSH **0.1.2-rc.1**：官方 `@deepseek-ai/dsh-settings` 移除了模块级 `installSettingsSection` / `settingsNamespace` 导出，改用 `SettingsProvider.installSection` 服务方法。未适配的插件在 `dsh web` 启动时即因 import 失败崩溃（`does not provide an export named 'installSettingsSection'`）。

### Fixed

- `dsh web` 启动崩溃：host 插件改为官方 0.1.2 样板（`dsh-web-search-deepseek`）同款写法——`ctx.inject(["settings"])` 等服务就绪后调用 `settingsCtx.settings.installSection(ctx, NS, ConfigSchema, config, hooks)`；命名空间由 `settingsNamespace('web-search-ollama')` 改为字符串字面量 `'web-search-ollama'`（格式由 `installSection` 内部校验，语义不变）。

### Changed

- **运行时要求 `@deepseek-ai/dsh` ≥ 0.1.2-rc.1**（`dsh-settings` 0.1.2-rc.1+ 才提供 `installSection` 服务方法）。仍运行在 0.1.1 及更早 dsh 的环境请继续使用 **v0.1.1**（代码与 peer 声明在 0.1.1-rc.2 下自洽，仅不能跨版本混用）。

## [0.1.1] - 2026-08-22

稳定性与健壮性版本：修复 ESM 构建竞态导致的 `dsh web` 启动崩溃、keyed-slot 缺失导致的设置卡片渲染崩溃、设置卡片 `scope.load` 未定义导致的崩溃，并按官方 `dsh-web-search-deepseek` 模式为 provider 补齐凭证缺失报错、取消语义、HTTP 错误详情透出与响应结构校验。

### Changed

- 审计事件 `web/deepseek-search-llm-request` 的载荷补充 `apiVersion` 字段（默认 `v1`），与官方 `DeepSeekSearchLlmRequest` 事件形状对齐（`endpoint` / `apiVersion` / `body`）。
  > **更正（0.1.5）**：这里只对齐了顶层字段，嵌套 `body` 仍是 Ollama 形状（`{query,max_results}`），这正是 v0 会话无法迁移、打不开的原因。该审计事件已在 0.1.5 整体移除。
- `apiVersion` 变为可配置字段（host `Config` schema + Web UI 配置卡片第 8 个字段，默认 `v1`；Ollama 无版本头，仅作为审计标签）。
- 凭证缺失时抛出 `WEB_PROVIDER_CREDENTIAL_MISSING`（附带缺失的环境变量名与配置指引），不再静默发送无鉴权请求。
- `available()` 增强：校验 `baseURL` 可解析（`new URL` 可构造）且数值配置为正整数。
- HTTP 非 2xx 时尝试解析响应体并透出 provider 自身的错误详情（解析失败回退到通用状态码消息，对 Ollama 不同错误形状保持防御）。
- search 响应缺失/非数组 `results` 时报 `WEB_PROVIDER_ERROR`（空数组仍视为合法「无结果」）。
- 补齐取消语义：请求前检查 `signal`、凭证解析可取消（`abortable`）、`isAbortError`（DOMException AbortError）识别为 `WEB_ABORTED`。

### Fixed

- client 包设置卡片对 `scope.load()` 的调用改为 `typeof scope.load === "function"` 守护（`useEffect` 初始化与 `onSave` 成功处），修复 `settingsScope` 在当前运行环境下未暴露 `load` 方法时抛出 `TypeError: scope.load is not a function`、导致设置卡片整体崩溃不渲染的问题。
- host 包改为 **ESM 构建**（`type: module` + `tsc --module esnext`），修复此前 CJS 构建产物在 DSH loader 并发加载依赖时抛出 `ERR_REQUIRE_ESM_RACE_CONDITION` 导致 `dsh web` 启动崩溃的问题。
- client 包注册 `settings.plugin.item` 槽时补充 `key: "web-search-ollama"`。该槽由官方声明为 `kind: "keyed"`，缺失 `key` 会导致浏览器端 keyed-slot 错误、配置卡片渲染崩溃。

## [0.1.0] - 2026-08-16

首次发布。将 DeepSeek Harness 的联网搜索能力切换到 **Ollama 云端 API**（`/api/web_search` + `/api/web_fetch`），并在 Web GUI 提供可视化配置卡片。

### Added

- **Ollama 搜索 provider**：注册到 `ctx.web` seam，模型联网搜索走 Ollama 云端 API。
- **Ollama 抓取 provider**：`/api/web_fetch`，支持抓取网页正文。
- **Web UI 配置卡片**：设置 → 插件设置 → 插件配置 →「Ollama 网页搜索」，7 个字段（API 地址、密钥、搜索/抓取路径、摘要上限、超时），保存即时生效（`settings.yaml` 热重载）。
- **可折叠卡片**：与内置插件一致的展开/收起交互（header + chevron + ARIA）。
- **密钥安全**：API Key 只写不读、不回显；支持 `apiKeyEnv` 环境变量（credentials 解析）。
- **一键安装脚本** `scripts/install.sh`：免网络，自动安装双包并合并 `cordis.patch.yml`（含备份与幂等处理）。
- **monorepo 双包结构**：`dsh-web-search-ollama`（host）+ `dsh-web-search-ollama-client`（browser），零构建。

### Fixed

- 第三方插件 settings 命名空间无法暴露到 Web UI（`dsh-host-apiproxy` 白名单缺 `web-search-ollama`）→ 补白名单。
  > 注：该补丁仅针对当时的 dsh 版本（0.1.0-rc.x 硬编码白名单时代）。dsh 0.1.1-rc.2 起 settings 暴露已重构为动态枚举运行时注册表（`settings.describe` = `[...this.registrations.values()]`），任何经 `installSettingsSection` 注册的第三方命名空间自动对 Web UI 可见，**不再需要任何补丁**。
- `settings.yaml` 空节（`key:` 无值 = YAML `null`）导致 `settings.register()` 抛 `TypeError`、配置节静默注册失败 → 改用 `{}` 空对象。
- 配置卡片注册成功但无法折叠（自绘卡片缺少可折叠交互）→ 对齐官方 `PluginCard` 模式。
- 插件列表显示原始文件路径 `./ollama-search.mjs` → host 插件发布为正式包，显示 `web-search-ollama`。

### Changed

- 默认联网搜索从内置 DeepSeek 搜索切换到 Ollama 云端（需配置 `OLLAMA_API_KEY`；内置 `web-search-deepseek` 默认停用）。
- host 插件由本地文件加载改为正式 npm 包 `dsh-web-search-ollama`（peerDependencies：`dsh-settings`、`dsh-web`；dependencies：`schemastery`）。

[0.1.9]: https://github.com/jlvncn/dsh-web-search-ollama/releases/tag/v0.1.9
[0.1.8]: https://github.com/jlvncn/dsh-web-search-ollama/releases/tag/v0.1.8
[0.1.7]: https://github.com/jlvncn/dsh-web-search-ollama/releases/tag/v0.1.7
[0.1.6]: https://github.com/jlvncn/dsh-web-search-ollama/releases/tag/v0.1.6
[0.1.5]: https://github.com/jlvncn/dsh-web-search-ollama/releases/tag/v0.1.5
[0.1.4]: https://github.com/jlvncn/dsh-web-search-ollama/releases/tag/v0.1.4
[0.1.3]: https://github.com/jlvncn/dsh-web-search-ollama/releases/tag/v0.1.3
[0.1.2]: https://github.com/jlvncn/dsh-web-search-ollama/releases/tag/v0.1.2
[0.1.1]: https://github.com/jlvncn/dsh-web-search-ollama/releases/tag/v0.1.1
[0.1.0]: https://github.com/jlvncn/dsh-web-search-ollama/releases/tag/v0.1.0
