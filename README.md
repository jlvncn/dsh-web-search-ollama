# dsh-web-search-ollama

Ollama 云端搜索 / 抓取插件，用于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的 `ctx.web` seam：把模型的联网搜索能力从官方 DeepSeek 搜索切换到 **Ollama 云端 API**（`/api/web_search` + `/api/web_fetch`），并在 **Web 侧边栏的 Plugins 页**提供配置表单（harness 依据宿主半的 schema 自动生成；保存即时生效、无需重启）。注意：`设置 → 插件设置` 从 **0.1.7 起是只读的插件清单**，可编辑的配置已迁到侧边栏 Plugins 页。

## 特性

- 🔍 **搜索 + 抓取**：注册 `searchProvider`（默认）与可选 `fetchProvider`（`POST {baseURL}{searchPath}` / `{baseURL}{fetchPath}`）。
- 🎛️ **可视化配置**：8 个字段（API 地址、密钥、路径、超时等）由内置插件管理器按 schema 渲染成表单，保存即生效（**0.1.7 起不再自带浏览器 bundle**，见下文「架构」）。
- 🔐 **密钥安全**：API Key 只写不读、不回显；支持从凭据 / 启动环境（`apiKeyEnv`）读取。
- 📦 **零构建**：宿主包为纯 JS（`tsc` 产物入库），装上即用。
- ♻️ **热重载**：改 `cordis.patch.yml` 后 loader 自动 diff 重新加载；配置表单保存由 settings 服务即时下发。

## 架构：宿主半 + （已停用的）浏览器半

本插件拆成两个 npm 包：

| 包 | 运行端 | 职责 |
|---|---|---|
| `dsh-web-search-ollama` | **host**（Node.js 进程） | 注册搜索 provider（抓取 provider 可选）、安装 `web-search-ollama` settings 命名空间 |
| `dsh-web-search-ollama-client` | **client**（浏览器） | **0.1.7 起停用**：其注入的客户端 `settingsScope` 服务已被 `configForms` 取代，条目会一直 pending |

> **v0.1.7 起浏览器半停用。** harness 0.1.7 把浏览器端配置机制从 `settingsScope` 换成 `configForms` + `plugins.item` 插槽，手写 bundle 不再适配（症状：`web boot: 1 entry did not activate`）。而宿主半的 `Config` schema 现在会被 harness 自动投影成「插件配置」页的表单（`autoGenerate: true`、`applies: live`），字段与旧卡片一致——功能等价，且不必再维护浏览器代码。因此 `scripts/install.sh` 与示例 patch 都不再安装/挂载 `dsh-web-search-ollama-client`（包保留在仓库，供回退或日后按新契约移植）。插件列表页现在只有 `web-search-ollama` 一个条目。

## 目录结构

```
dsh-web-search-ollama/
├── README.md                     # 本文档
├── LICENSE                       # MIT
├── package.json                  # monorepo 根（pnpm workspaces）
├── pnpm-workspace.yaml
├── scripts/
│   └── install.sh                # 一键安装到 DSH profile
├── profile/
│   └── cordis.patch.yml          # loader patch 示例（可复制/自动合并）
└── packages/
    ├── dsh-web-search-ollama/          # host 包
    │   ├── package.json
    │   ├── index.js                    # 插件本体（搜索/抓取 provider）
    │   └── test.mjs                    # 模块形状测试
    └── dsh-web-search-ollama-client/   # client 包（0.1.7 起停用，保留供回退/移植）
        ├── package.json
        ├── index.js                    # host half（空 apply，仅占位）
        └── client.js                   # 旧浏览器 bundle（依赖已移除的 settingsScope）
```

## 快速开始

> **环境要求**：Node.js **>= 20.3**（host 包用到了 `AbortSignal.any()` 与 `AbortSignal.timeout()`，`AbortSignal.any` 自 Node 20.3 起才可用）。请先确认 `node --version`。

### 1. 安装（三选一）

**方式 A — 一键脚本（推荐，无需网络）**

```bash
# 在仓库根目录执行；默认安装到 "web" profile
./scripts/install.sh
# 指定 profile： ./scripts/install.sh my-profile
```

脚本会：
1. 把宿主包复制到 `$DSH_HOME/profiles/node_modules/`；
2. 把 `profile/cordis.patch.yml` 合并进 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`（已有条目则跳过；改动前自动备份）。

**方式 A′ — bundle 安装（v0.1.9 起，推荐，可在 Web 里管理）**

包自带 `dsh.bundle.patch`，所以 profile 的包管理器能直接安装并挂载它（**不需要 npm 发布**，三条通道任选）：

```bash
# 本地目录（link，离线可用）
dsh plugin --profile web add /path/to/dsh-web-search-ollama/packages/dsh-web-search-ollama
# tarball（GitHub Release 附件）
dsh plugin --profile web add https://github.com/jlvncn/dsh-web-search-ollama/releases/download/v0.1.9/dsh-web-search-ollama-0.1.9.tgz
# git 地址（注意会跑包内 prepare = tsc，会拉 typescript devDep）
dsh plugin --profile web add 'git+ssh://git@github.com/jlvncn/dsh-web-search-ollama.git'
```

或在 Web 里：**侧边栏 Plugins → Add plugin**（"Local plugin directory" 填上面的本地路径 / 或填 tarball URL）。装好后 `package.json` 的 `dsh.profile.bundles` 会多出 `dsh-web-search-ollama`，行由 bundle 的 patch 挂载，之后可以在 UI 里启停 / 卸载 / 看安装日志。

> bundle **只挂载自己那一行**，不抢 `web` seam：`searchProvider: ollama` / 停用内置 DeepSeek 搜索仍写在**你自己的 patch 层**（方式 A 的脚本会帮你写）。

**方式 B — pnpm workspace 链接**

把本仓库作为 pnpm workspace 加入你的 DSH profile，然后让 loader 以包名解析（见下方 patch）。适合想保持源码可编辑的场景。

**方式 C — 手动复制**

```bash
DSH_HOME=${DSH_HOME:-$HOME/.dsh}
mkdir -p "$DSH_HOME/profiles/node_modules/dsh-web-search-ollama"
cp packages/dsh-web-search-ollama/index.js       packages/dsh-web-search-ollama/package.json \
   "$DSH_HOME/profiles/node_modules/dsh-web-search-ollama/"
```

### 2. 配置 loader patch

把 `profile/cordis.patch.yml` 的内容合并进 `$DSH_HOME/profiles/web/cordis.patch.yml`（核心三块）：

```yaml
- id: web
  config:
    searchProvider: ollama          # 让模型使用 Ollama 搜索
    fetchProvider: http             # 抓取继续用内置通用 http provider

- id: web-search-deepseek
  disabled: true                    # 停用内置 DeepSeek 搜索

- insert:
    - id: web-search-ollama
      name: 'dsh-web-search-ollama'         # host 包（包名形式）
      config:
        baseURL: https://ollama.com
        searchPath: /api/web_search
        fetchPath: /api/web_fetch
        apiKeyEnv: OLLAMA_API_KEY
        # enableFetchProvider: true        # 如需 Ollama 也接管抓取，打开并把上面的 fetchProvider 改为 ollama
    # （浏览器半已停用，不再挂载：harness 0.1.7 起由内置表单接管配置）
```

### 3. 配置密钥（二选一）

- **环境变量**（推荐）：设置 `OLLAMA_API_KEY`，patch 的 `config.apiKeyEnv` 默认指向它；
- **UI 填写**（harness ≥ 0.1.7）：侧边栏 **Plugins** → 组合包 **`dsh-web-search-ollama`** → 行 **`web-search-ollama`** → **配置** → 填 `baseURL` 等字段（`apiKey` 建议留空，交给 `apiKeyEnv`）→ 保存。

### 4. 启动 / 生效

```bash
dsh web
```

或保持 dsh 运行，改完 patch 后 loader 会自动热重载（改 name 会强制重新 apply）。client 改动刷新浏览器页面即可。

### 5. 验证

**插件已加载（只应看到一个 active 条目）：**

```bash
curl -s -X POST http://127.0.0.1:3080/api/pluginInventory/list \
  -H 'Content-Type: application/json' \
  -d '{"type":"client-request","rpcId":"v","method":"pluginInventory/list","payload":{"args":{}}}'
# 期望（v0.1.7 起只有宿主半）:
#   web-search-ollama moduleName=dsh-web-search-ollama enabled=true
```

**settings 命名空间已注册：**

```bash
curl -s -X POST http://127.0.0.1:3080/api/settings.describe \
  -H 'Content-Type: application/json' \
  -d '{"type":"client-request","rpcId":"v","method":"settings.describe","payload":{}}'
# 期望: namespaces 中包含 "web-search-ollama"
```

**配置表单**（harness ≥ 0.1.7）：侧边栏 **Plugins** → `dsh-web-search-ollama` 组合包下的行 `web-search-ollama` → **配置**，编辑字段后保存（写入 profile 的 patch 文档，即时生效）。旧路径 `设置 → 插件设置 → 插件配置` 只在 0.1.6 及更早存在；0.1.7 起该页是只读清单。

## 配置项

| 字段 | 默认值 | 说明 |
|---|---|---|
| `baseURL` | `https://ollama.com` | Ollama API 根地址 |
| `apiKey` | （空） | 字面密钥，只写不读；留空保持当前密钥 |
| `apiKeyEnv` | `OLLAMA_API_KEY` | `apiKey` 为空时按 credentials → 启动环境（`.env`）→ `process.env` 解析 |
| `searchPath` | `/api/web_search` | POST 搜索端点路径 |
| `fetchPath` | `/api/web_fetch` | POST 抓取端点路径 |
| `snippetMax` | `2000` | 每条搜索结果的 content 截断长度 |
| `searchTimeoutMs` | `30000` | 搜索请求的 abort 超时（毫秒） |
| `fetchTimeoutMs` | `15000` | 抓取请求的 abort 超时（毫秒） |
| `enableFetchProvider` | `false` | 是否把 Ollama 也注册为 fetch provider。仅 loader 配置（Web UI 不暴露）；默认关闭以免与内置 `http` provider 冲突 |
| `apiVersion` | `v1` | **已弃用**：保留仅为兼容旧配置，插件不再写会话事件 |

> **v0.1.5 起：本插件不再写入任何会话事件。** 此前它把 Ollama 请求记录成官方事件 `web/deepseek-search-llm-request`，但该事件属于内置 DeepSeek 搜索 provider，其 v0 冻结载荷只接受官方请求体（`model`/`max_tokens`/`messages`/`tools`）。用 Ollama 的 `{query,max_results}` 冒用该事件名，会让**任何包含它的 v0 格式会话无法通过 v0→v1 迁移、从而打不开**。仓库外插件也无法注册自己的必需事件类型（`SessionEventMap` 扩展不在构建期静态词表内），因此该 provider 不再进入会话日志。

## 卸载

1. 从 `cordis.patch.yml` 删除 `web` 的 `searchProvider` 覆盖、`web-search-deepseek` 的 `disabled`、以及 `insert` 中的条目；
2. 删除（或保留无害）`$DSH_HOME/profiles/node_modules/dsh-web-search-ollama/`（若曾装过 `.../dsh-web-search-ollama-client/` 也可一并删除）；
3. 重启 `dsh web`。

## 恢复历史会话（v0 → v3）

v0.1.5 之前，本插件会把审计事件写进会话。含该事件的 **v0 格式**会话无法通过 DSH 的 v0→v1 迁移，表现为打不开：

```text
failed to observe session "session-…": @deepseek-ai/dsh-session-format-v0-to-v1 refuses this format v0
Session: web/deepseek-search-llm-request N body has unexpected member "query"
```

升级插件只能阻止**新增**损坏，修复不了已经在磁盘上的日志。用 `scripts/migrate-v0-sessions.mjs` 做一次性恢复：

```bash
node scripts/migrate-v0-sessions.mjs                   # 干跑（默认，不写盘）
node scripts/migrate-v0-sessions.mjs --verify-existing  # 校验已有的 v3 产物
node scripts/migrate-v0-sessions.mjs --relax-v0-validator --normalize-descriptor-v2 --apply
```

脚本的安全保证：

- **源 v0 文件从不改动**；产物先写 `*.staging`、通过严格校验后才用 `link` 原子发布，已有 `session.vN.jsonl.zstd` 不覆盖。
- **默认干跑**，必须显式 `--apply` 才写盘。
- 会话默认从 `$DSH_HOME/sessions` 下所有项目目录读取，可用 `--root` / `--ids` / `--only` 收窄。
- `--normalize-descriptor-v2` 修复 `subagent/descriptor` 版本 2 的旧日志（形状与 v3 一致，仅版本标记不同），**不需要放宽任何校验器**。
- `--relax-v0-validator` 仅用于"冻结载荷清单过窄"导致的拒绝（Ollama body、`permission/preset` 的 `origin`）。它会临时改写 DSH 安装里的 v0→v1 校验器，**重新 exec 自身让 ESM 加载到放宽版**，并在结束时无条件还原。上游读者侧修复进展见 [deepseek-ai/deepseek-harness#5818](https://github.com/deepseek-ai/deepseek-harness/discussions/5818)。

## 开发

```bash
pnpm install          # 安装 host 包测试所需的 devDependencies
pnpm test             # 模块形状测试 + provider 行为测试（test.mjs + test-providers.mjs）
```

改动 host 包源码 `packages/dsh-web-search-ollama/src/index.ts` 后，运行 `npm run build --prefix packages/dsh-web-search-ollama` 重建 `index.js`，再运行 `./scripts/install.sh` 同步到 profile（或手动 `cp` 到 `$DSH_HOME/profiles/node_modules/dsh-web-search-ollama/`）。

### 官方约定对照（插件作者）

宿主半按官方 `docs/cookbook/adding-a-settings-card.md` 与 `docs/subsystems/web.md` 的形状编写；逐条审核结论见 [`docs/official-alignment-audit.md`](docs/official-alignment-audit.md)。

| 官方约定 | 本插件 |
|---|---|
| 具名导出 `Config` / `name` / `inject` / `apply`（官方插件无 `default`） | ✅ 只用具名导出 |
| 可编辑字段声明为 `Volatile<T>`，操作开始时 `.get()` 读一次快照 | ✅ `snapshot(config)` |
| `role('secret')` 字段不进表单响应；凭证用 `apiKeyEnv` 引用 | ✅ |
| `available()` 只做本地廉价检查（不联网） | ✅ |
| `truncated` 由 seam 设置；`maxResults` 边界由 seam 强制 | ✅ provider 只做请求层优化 |
| `peerDependencies` 声明支持的 dsh 范围（**组合期会校验**） | ✅ `>=0.1.7-rc.1 <0.2.0` |
| 结构性字段不标 volatile ⇒ 不进配置表单 | ✅ `enableFetchProvider` |
| 以 bundle 分发（`dsh.bundle.patch`），可被 `dsh plugin` / Web Plugins 页安装管理 | ✅ v0.1.9 起 |

## 故障排查

| 现象 | 原因与处理 |
|---|---|
| 搜索不生效，Plugins 页里没有该组合包/行 | 宿主包未装入 profile node_modules；`pluginInventory/list` 看不到条目 → 重跑 `./scripts/install.sh` |
| 配置页看不到 `web-search-ollama` 表单 | `settings/describe` 里没有该命名空间 → 宿主包未 apply，或它的 `Config` schema 对 harness 不可见（v0.1.6 起 `Config` 同时挂在 default 导出上；查 `pluginInventory/list` 中 `web-search-ollama` 是否 active） |
| UI 启动提示 `web boot: 1 entry did not activate`（`dsh-web-search-ollama-client … waiting for service: settingsScope`） | harness 0.1.7 已移除客户端 `settingsScope` 服务；删掉 profile patch 里 `web-search-ollama-client` 的 `insert` 条目（v0.1.7 的 `install.sh` 不再添加）后重启 |
| 以 `link:`/本地目录安装后**配置表单消失**、但搜索仍然可用 | 包自己解析到了没有 `volatile()` 的 schemastery（< 3.18.4），于是字段不再是 live ref，`volatileForm(schema)` 为空 → 该条目不进 `settings/describe`。v0.1.9 起 `dependencies` 已收敛为 `~3.18.4`；若手改过依赖，删掉包内 `node_modules/@deepseek-ai/schemastery` 重装即可 |
| 插件行被组合期拒绝，报 `incompatible-version`（或该行被置为 `disabled`） | `peerDependencies` 里声明的 dsh 范围与运行期 `dsh --version` 不匹配（校验规则见 app-boot README §profiles）。换用与核心匹配的插件版本；确需放行要走 `dsh plugin --profile web allow-version <包@版本> --dsh-version <运行期版本> --accept-risk`（有风险，官方要求显式确认） |
| 插件列表出现两个 ollama 条目 | 旧安装残留：profile patch 里还挂着 `web-search-ollama-client` → 删掉该条目；v0.1.7 起只有一个宿主条目 |
| **旧会话打不开，报 `web/deepseek-search-llm-request … body has unexpected member "query"`** | v0.1.5 之前插件把 Ollama 请求写成官方事件，导致含该事件的 **v0 格式**会话无法通过 v0→v1 迁移。升级到 v0.1.5（不再写任何会话事件）即可止住新增；**已在磁盘上的历史 v0 会话需要单独做一次性 v0→v3 迁移**，升级插件本身不会修复它们。 |
| **macOS 上用云端 `https://ollama.com` 搜索超时 / `UND_ERR_CONNECT_TIMEOUT`，但 `nslookup` 正常** | 本机 `getaddrinfo` 对该域名的缓存异常（某些网络环境会恰好卡 ~30s）。执行 `sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder` 即可（仅清空本地 DNS 缓存，安全可逆，无需改 `/etc/hosts`）。若反复出现，建议改用自建 Ollama（`baseURL` 填 `http://localhost:11434`） |

## License

[MIT](./LICENSE)
