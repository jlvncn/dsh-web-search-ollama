# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Changed

- 审计事件 `web/deepseek-search-llm-request` 的载荷补充 `apiVersion` 字段（默认 `v1`），与官方 `DeepSeekSearchLlmRequest` 事件形状对齐（`endpoint` / `apiVersion` / `body`）。

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
- `settings.yaml` 空节（`key:` 无值 = YAML `null`）导致 `settings.register()` 抛 `TypeError`、配置节静默注册失败 → 改用 `{}` 空对象。
- 配置卡片注册成功但无法折叠（自绘卡片缺少可折叠交互）→ 对齐官方 `PluginCard` 模式。
- 插件列表显示原始文件路径 `./ollama-search.mjs` → host 插件发布为正式包，显示 `web-search-ollama`。

### Changed

- 默认联网搜索从内置 DeepSeek 搜索切换到 Ollama 云端（需配置 `OLLAMA_API_KEY`；内置 `web-search-deepseek` 默认停用）。
- host 插件由本地文件加载改为正式 npm 包 `dsh-web-search-ollama`（peerDependencies：`dsh-settings`、`dsh-web`；dependencies：`schemastery`）。

[0.1.0]: https://github.com/jlvncn/dsh-web-search-ollama/releases/tag/v0.1.0
