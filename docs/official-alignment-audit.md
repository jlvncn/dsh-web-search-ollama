# 官方约定审核（dsh-web-search-ollama）

- 审核日期：2026-09-24（对应发布 v0.1.8）
- 依据（上游公开仓库 `github.com/deepseek-ai/deepseek-harness`，master）：
  - `docs/cookbook/adding-a-settings-card.md` —— 实时配置表单的官方写法
  - `docs/subsystems/settings.md` —— settings 服务 / volatile / `settingsController` 契约
  - `docs/subsystems/web.md` —— `ctx.web` seam：provider 契约、选择规则、错误码
  - `docs/capability-seams.md`、`docs/user/develop/basic/*` —— seam 与包的基本约定
  - `packages/boot/app-boot/README.md`（§profiles）—— **peerDependencies 的组合期校验规则**
  - `packages/boot/plugin-manager/README.md` —— 版本不匹配与豁免流程

## 1. 结论

宿主半改为官方写法（v0.1.8），语义与官方 in-tree 插件一致；浏览器半已停用（v0.1.7）。发现并修正 **2 处真实偏差**：Config 类型/导出形状、`peerDependencies` 范围。

## 2. 逐条对照

| # | 官方约定（出处） | 审核前 | 结论 |
|---|---|---|---|
| 1 | `export interface Config`，可编辑字段为 `Volatile<T>`，`apply(ctx, config)` 内 `config.x.get()`（cookbook §1） | 自造 `ConfigValues` 条件类型 + `unwrapConfig()` 运行时解包 | **已改**：显式 `interface Config` + `snapshot()` 一次读取全部实时字段 |
| 2 | 插件模块用具名导出（`Config`/`name`/`inject`/`apply`），官方插件无 `default`（cookbook、in-tree 源码） | 只有 `default` 对象，`Config` 挂在它上面 | **已改**：具名导出，去掉 `default`（loader 只在存在 `default` 时才收敛为它） |
| 3 | `peerDependencies` 里每个 `@deepseek-ai/dsh*` 范围必须匹配运行期版本，组合期校验，不匹配即拒绝该行（app-boot §profiles） | `dsh-web: ^0.1.2-rc.1`（prerelease 参与匹配 → 放行 0.1.2–0.1.6，那些核心没有 0.1.7 机制，会静默失效）；`dsh-settings: ^0.1.2-rc.1` 已不再导入 | **已改**：只留 `@deepseek-ai/dsh-web: >=0.1.7-rc.1 <0.2.0` |
| 4 | `role('secret')` 保持值不进入表单响应；凭证优先用 credential 引用（cookbook §2） | `apiKey` 为 `role('secret')`，`apiKeyEnv` 走 `ctx.credentials` + 启动环境兜底 | ✅ 原本符合 |
| 5 | 「普通字段不进设置 schema」——只有 volatile 字段进表单（cookbook §2、settings 子系统） | `enableFetchProvider` 不标 volatile，只从 loader 配置读 | ✅ 原本符合 |
| 6 | `available()` 是廉价本地检查，**不得发网络请求**（web 子系统） | 只校验 URL 可解析 + 数值整数 | ✅ 原本符合 |
| 7 | `truncated` 由 seam 在裁剪 `sources[]` 时设置；`maxResults` 边界由 seam 强制，provider 可在请求层做成本优化（web 子系统） | 返回 `truncated: false`；把 `maxResults` 映射为 Ollama `max_results`（上限 10） | ✅ 原本符合 |
| 8 | `WebError` 的 seam 中性码为 `WEB_PROVIDER_ERROR`/`WEB_ABORTED` 等；provider 允许自带码，consumer 必须容忍未知码（web 子系统 §Errors） | 用 `WEB_PROVIDER_ERROR`/`WEB_ABORTED` + 自定义 `WEB_PROVIDER_CREDENTIAL_MISSING` | ✅ 原本符合（自定义码被明确允许） |
| 9 | provider 注册返回 disposer，随调用 fiber 释放（web 子系统 §ctx.web） | 直接注册，不保存 disposer | ✅ 原本符合 |
| 10 | 库包不声明 `dsh.bundle`（bundle 才声明，plugin-manager） | 无 `dsh` 字段 | ✅ 原本符合 |
| 11 | 浏览器半：客户端 `dsh.client` + `./client` lazy-CJS bundle + `plugins.item` slot + `dsh.client.inject`（cookbook §5） | 停用（依赖的 `settingsScope` 在 0.1.7 被 `configForms` 取代） | 现状保留；重写要点见 `dsh-upgrade-0.1.7-impact.md` §1.3 |

## 3. 有意保留的偏差

| 项 | 说明 |
|---|---|
| 本地 `live()` 包装 | `volatile()` 在 monorepo devDep 的 schemastery 3.18.1 里不存在（运行期用的是 harness 自带 3.18.4）。不包装则仓库内 `tsc`/测试无法运行；包装后旧 schemastery 退化为普通值。源码已标 TODO。 |
| 本地 `Volatile<T>` 接口 | 本地 cordis 4.0.2 的 d.ts 未导出该类型；结构与官方一致，源码已标 TODO。 |
| `dependencies` 仍为 `@deepseek-ai/schemastery: ^3.18.1` | 官方 in-tree 包写 `~3.18.4`。`^3.18.1` 允许新装取到 3.18.4+，而收敛到 `~3.18.4` 需连带刷新 monorepo devDeps/lock；本次不做，留待 devDeps 整体升级。 |
| `types` 指向 `./src/index.ts` | 官方发布编译产物 `lib/types/*.d.ts`；本项目以 `src` 为类型入口（`files` 已包含 `src`），对 TS 消费者可用。 |

## 4. 验证记录（2026-09-24，v0.1.8）

| 项目 | 方法 | 结果 |
|---|---|---|
| 构建 | `tsc`（tsconfig: rootDir=src / outDir=.） | OK |
| 模块形状 | `node test.mjs` | OK（具名导出形状） |
| provider 行为 | `node test-providers.mjs` | 8/8 passed |
| 运行期加载 | `dsh web --port 0` + `pluginInventory/list` | host 条目 active，无 pending，无诊断文件 |
| 配置表单 | `settings/describe` | `web-search-ollama` 在列，`autoGenerate: true`、`applies: live` |
| peer 校验 | 组合期校验（app-boot）随启动进行 | 未被拒绝（范围 `>=0.1.7-rc.1 <0.2.0` 匹配运行期） |
