# DSH Version Upgrade Evaluation Guide

Based on the experience upgrading the dsh-web-search-ollama plugin from DSH 0.1.1-rc.2 to 0.1.2-rc.1, this guide outlines a systematic process to evaluate future DSH versions for compatibility, avoiding unexpected breakages.

## 📌 Key Lesson

Compatibility must be assessed **transitively** through the plugin’s entire dependency chain—not just by scanning the plugin’s own code for deprecated APIs. A breaking change in a dependency (e.g., `@deepseek-ai/dsh-settings`) can cause import-time failures even if the plugin itself does not use deprecated APIs directly.

## 🔍 Evaluation Process

### 1. Gather Version Information
   - **Current version**: Note the DSH range the plugin currently supports (from `peerDependencies` in `package.json`).
   - **Target version**: Identify the new DSH version to evaluate (e.g., `0.1.2-rc.1`, `0.1.2`, or `@next`).
   - **Changelog sources**:
     - Main DSH repo: https://github.com/deepseek-ai/deepseek-harness/releases
     - Individual package changelogs (if published separately) or monorepo `packages/*/CHANGELOG.md`.
     - Use `npm view @deepseek-ai/<package> versions --json` to list versions (if npm access works).

### 2. Audit Direct Dependencies
   For each package in `peerDependencies` and `dependencies` (especially core services like `dsh-settings`, `dsh-web`, `dsh-session`):
   - Check the currently declared version range.
   - Determine if the target DSH includes a newer release of that package outside the range.
   - Read that package’s changelog between the current baseline and the target DSH version.
     - Focus on **removed exports**, **changed function signatures**, **deleted configuration properties**, and **breaking changes** in public APIs.
     - Pay special attention to packages the plugin **directly imports from**.

### 3. Inspect the Plugin’s Actual API Usage
   - List all imports from DSH-related packages in the plugin’s source (host and client halves).
   - For each import, verify:
     - Is the imported name still exported in the target version of the package?
     - How is it used? (called as a function? accessed as an object? used in a type?)
   - Check `ctx` usage:
     - Does the plugin call `ctx.get('<service>')`? Ensure the service still exists with expected methods.
     - Does the plugin register capabilities via `ctx.<something>.register<...>()`? Ensure those registration methods still exist.
     - Does the plugin use event lifecycles (e.g., `session.append`)? Prefer official event types (e.g., `web/deepseek-search-llm-request`) to avoid session-load issues.

### 4. Determine Required Adaptations
   For each breaking change found:
   - Research the recommended migration path (often in the dependency’s changelog, release notes, or official docs).
   - Draft the code changes needed to maintain compatibility with the target version (ideally keeping backward compatibility if supporting a version range).
   - Example adaptation for `dsh-settings` 0.1.2:
     ```diff
     - import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';
     + import type { Settings } from '@deepseek-ai/dsh-settings'; // For type augmentation only
     - const NS = settingsNamespace('web-search-ollama');
     + const NS = 'web-search-ollama'; // String literal, validated by installSection
     - installSettingsSection(ctx, NS, ConfigSchema, config, { ... });
     + ctx.inject(['settings'], (settingsCtx) => {
     +   settingsCtx.settings.installSection(ctx, NS, ConfigSchema, config, {
     +     setSource: (source) => { current = source; },
     +     onChange: () => {},
     +   });
     + });
     ```

### 5. Create a Verification Plan
   Before declaring compatibility, validate:
   - **Load test**: Does `dsh web` start without import/apply errors? (Confirm via `dsh --profile web --dump-config` that the plugin appears in the graph.)
   - **Settings test**: Can the plugin’s settings be read (`settings.describe`) and written (`settings.update`) via API or UI?
   - **Core function test**: Do the plugin’s primary capabilities (e.g., search/fetch) work end-to-end?
   - **Runtime tool-invocation test (2026-09-05 addendum)**: Configuration-layer conflicts only surface when the tool is actually invoked — never at load time. If a plugin registers a provider into a seam (e.g., `ctx.web` fetch) alongside a built-in provider (e.g., `http`), the seam refuses to auto-select and the tool errors (e.g., `web_fetch` → `multiple usable web providers are registered (http, ollama); configure one explicitly`). Therefore:
     - Always perform a **real `web_fetch` call** (e.g., fetch `http://example.com`) **and** a real `web_search` call — not just one of them.
     - When multiple providers can serve one seam, **pin the provider explicitly** in the profile config (e.g., `searchProvider: ollama` + `fetchProvider: http`; env equivalents `$DSH_WEB_SEARCH_PROVIDER` / `$DSH_WEB_FETCH_PROVIDER`).
   - **Event test**: Are audit events still recorded and survivable across session restarts? (Use official event types.)
   - **Cleanup test**: Are registrations properly torn down when the plugin unloads/reloads?

### 6. Document and Version
   - Update `CHANGELOG.md` with a section detailing the DSH version upgrade, required changes, and version compatibility notes.
   - Bump the plugin’s version (following SemVer) if changes are non-trivial.
   - Update `peerDependencies` to reflect the newly supported DSH range (e.g., `^0.1.2-rc.1`).
   - Consider keeping older version tags/releases available for rollback.

## 🛠️ Practical Tips
- **Leverage official samples**: Compare your plugin’s `apply` logic against official plugins like `@deepseek-ai/dsh-web-search-deepseek` to ensure you’re using the latest patterns.
- **Use an impact assessment template**: See `docs/dsh-upgrade-0.1.2-impact.md` in this repo for a model (includes impact tables, code evidence, blocking items, adaptation steps, and verification checklist).
- **Prefer service lookup over direct imports**: Where possible, acquire services via `ctx.inject([...])` (as with `settings`) rather than importing and calling module-level functions directly, as this often isolates you from certain packaging/refactoring changes.
- **Monitor discussions**: Keep an eye on GitHub Discussions (e.g., #5544 for client-modules issues) for known problems in RC versions that might affect validation.

By following this process, you can systematically catch transitive breaking changes before they cause upgrade failures. The time invested in dependency auditing and API usage mapping ensures smooth transitions to new DSH versions. 🚀

--- 
*Created based on the upgrade experience from DSH 0.1.1-rc.2 to 0.1.2-rc.1 for the dsh-web-search-ollama plugin.*