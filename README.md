# dsh-web-search-ollama

Ollama 云端搜索 / 抓取插件，用于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的 `ctx.web` seam：把模型的联网搜索能力从官方 DeepSeek 搜索切换到 **Ollama 云端 API**（`/api/web_search` + `/api/web_fetch`），并在 **Web GUI 的「插件设置 → 插件配置」页**提供可视化配置卡片（修改即时生效，无需重启）。

## 特性

- 🔍 **搜索 + 抓取**：注册 `searchProvider` 与 `fetchProvider`（`POST {baseURL}{searchPath}` / `{baseURL}{fetchPath}`）。
- 🎛️ **可视化配置**：浏览器端配置卡片（7 个字段：API 地址、密钥、路径、超时等），保存即热更新 `settings.yaml`。
- 🔐 **密钥安全**：API Key 只写不读、不回显；支持从环境变量读取（`apiKeyEnv`，credentials 解析）。
- 📦 **零构建**：两个包均为纯 JS / 手写 ModuleLoader bundle，无需编译。
- ♻️ **热重载**：改 `cordis.patch.yml` 后 loader 自动 diff 重新加载；改 client bundle 后刷新页面即生效。

## 架构：为什么是两个包

DSH 的插件分两个运行端，本插件拆成两个 npm 包（都必需）：

| 包 | 运行端 | 职责 |
|---|---|---|
| `dsh-web-search-ollama` | **host**（Node.js 进程） | 注册搜索/抓取 provider、安装 `web-search-ollama` settings 命名空间 |
| `dsh-web-search-ollama-client` | **client**（浏览器） | 在「插件配置」页注册配置卡片（经 `settings.plugin.item` slot） |

client 包**必须**以包名形式存在于 profile 的 node_modules（其 `package.json` 声明 `exports["./client"]` + `dsh.client`），`dsh-client-modules` 才能扫描到并注入浏览器。因此插件列表页会看到两个条目：`web-search-ollama` 与 `web-search-ollama-client`——这是架构使然，不是重复加载。

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
    └── dsh-web-search-ollama-client/   # client 包
        ├── package.json
        ├── index.js                    # host half（空 apply，仅占位）
        └── client.js                   # 浏览器 bundle（配置卡片）
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
1. 把两个包复制到 `$DSH_HOME/profiles/node_modules/`；
2. 把 `profile/cordis.patch.yml` 合并进 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`（已有条目则跳过；改动前自动备份）。

**方式 B — pnpm workspace 链接**

把本仓库作为 pnpm workspace 加入你的 DSH profile，然后让 loader 以包名解析（见下方 patch）。适合想保持源码可编辑的场景。

**方式 C — 手动复制**

```bash
DSH_HOME=${DSH_HOME:-$HOME/.dsh}
mkdir -p "$DSH_HOME/profiles/node_modules/dsh-web-search-ollama" \
         "$DSH_HOME/profiles/node_modules/dsh-web-search-ollama-client"
cp packages/dsh-web-search-ollama/index.js       packages/dsh-web-search-ollama/package.json \
   "$DSH_HOME/profiles/node_modules/dsh-web-search-ollama/"
cp packages/dsh-web-search-ollama-client/*       "$DSH_HOME/profiles/node_modules/dsh-web-search-ollama-client/"
```

### 2. 配置 loader patch

把 `profile/cordis.patch.yml` 的内容合并进 `$DSH_HOME/profiles/web/cordis.patch.yml`（核心三块）：

```yaml
- id: web
  config:
    searchProvider: ollama          # 让模型使用 Ollama 搜索

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
    - id: web-search-ollama-client
      name: 'dsh-web-search-ollama-client'   # client 包
```

### 3. 配置密钥（二选一）

- **环境变量**（推荐）：设置 `OLLAMA_API_KEY`，patch 的 `config.apiKeyEnv` 默认指向它；
- **UI 填写**：设置 → 插件设置 → 插件配置 → **Ollama 网页搜索** → 填入 API Key → 保存（密钥只写不读）。

### 4. 启动 / 生效

```bash
dsh web
```

或保持 dsh 运行，改完 patch 后 loader 会自动热重载（改 name 会强制重新 apply）。client 改动刷新浏览器页面即可。

### 5. 验证

**插件已加载（应看到两个 active 条目）：**

```bash
curl -s -X POST http://127.0.0.1:3080/api/pluginInventory/list \
  -H 'Content-Type: application/json' \
  -d '{"type":"client-request","rpcId":"v","method":"pluginInventory/list","payload":{"args":{}}}'
# 期望:
#   web-search-ollama        moduleName=dsh-web-search-ollama        enabled=true
#   web-search-ollama-client moduleName=dsh-web-search-ollama-client enabled=true
```

**settings 命名空间已注册：**

```bash
curl -s -X POST http://127.0.0.1:3080/api/settings.describe \
  -H 'Content-Type: application/json' \
  -d '{"type":"client-request","rpcId":"v","method":"settings.describe","payload":{}}'
# 期望: namespaces 中包含 "web-search-ollama"
```

**UI 卡片**：设置 → 插件设置 → 插件配置 → 展开 **Ollama 网页搜索** 卡片，编辑字段后保存（`settings.yaml` 即时更新）。

## 配置项

| 字段 | 默认值 | 说明 |
|---|---|---|
| `baseURL` | `https://ollama.com` | Ollama API 根地址 |
| `apiKey` | （空） | 字面密钥，只写不读；留空保持当前密钥 |
| `apiKeyEnv` | `OLLAMA_API_KEY` | `apiKey` 为空时从该环境变量读取（credentials 解析） |
| `searchPath` | `/api/web_search` | POST 搜索端点路径 |
| `fetchPath` | `/api/web_fetch` | POST 抓取端点路径 |
| `snippetMax` | `2000` | 每条搜索结果的 content 截断长度 |
| `fetchTimeoutMs` | `15000` | 抓取请求的 abort 超时（毫秒） |

## 卸载

1. 从 `cordis.patch.yml` 删除 `web` 的 `searchProvider` 覆盖、`web-search-deepseek` 的 `disabled`、以及 `insert` 中的两个条目；
2. 删除（或保留无害）`$DSH_HOME/profiles/node_modules/dsh-web-search-ollama/` 与 `.../dsh-web-search-ollama-client/`；
3. 重启 `dsh web`。

## 开发

```bash
pnpm install          # 安装 host 包测试所需的 devDependencies
pnpm test             # 模块形状测试（packages/dsh-web-search-ollama/test.mjs）
```

改动 host 包源码 `packages/dsh-web-search-ollama/index.js` 后，运行 `./scripts/install.sh` 同步到 profile（或手动 `cp` 到 `$DSH_HOME/profiles/node_modules/dsh-web-search-ollama/index.js`）。

## 故障排查

| 现象 | 原因与处理 |
|---|---|
| 搜索不生效，配置页没有卡片 | host 或 client 包未装入 profile node_modules；`pluginInventory.list` 看不到条目 → 重跑 `./scripts/install.sh` |
| 配置页卡片显示"设置命名空间不可用" | `settings.describe` 里没有 `web-search-ollama` → host 包未 apply（检查 `pluginInventory.list` 中 `web-search-ollama` 是否 active / failed） |
| 改了 client.js 页面没变化 | 刷新页面（`serveBundle` 每次读取磁盘，`cache-control: no-cache`；不必重启 dsh） |
| 插件列表出现两个 ollama 条目 | 正常：host + client 两个 half，见上文「架构」 |
| **macOS 上用云端 `https://ollama.com` 搜索超时 / `UND_ERR_CONNECT_TIMEOUT`，但 `nslookup` 正常** | 本机 `getaddrinfo` 对该域名的缓存异常（某些网络环境会恰好卡 ~30s）。执行 `sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder` 即可（仅清空本地 DNS 缓存，安全可逆，无需改 `/etc/hosts`）。若反复出现，建议改用自建 Ollama（`baseURL` 填 `http://localhost:11434`） |

## License

[MIT](./LICENSE)
