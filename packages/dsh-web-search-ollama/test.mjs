// Load-shape check for dsh-web-search-ollama (no Harness boot required).
//
// Run in one of two ways:
//   1. From the monorepo root after `pnpm install` — deps resolve from the
//      workspace node_modules (devDependencies mirror the plugin's peers).
//   2. From inside a DSH profile node_modules tree, where the @deepseek-ai/*
//      deps are already hoisted.
//
// NOTE: full search/fetch behavior is exercised in-profile, not here.
let plugin, Config;
try {
  const ns = await import('./index.js');
  // CJS build: `default` is `module.exports` ({ Config, default: plugin });
  // ESM build: `default` is the plugin itself. Accept both shapes.
  plugin = ns.default?.default ?? ns.default;
  Config = ns.Config ?? ns.default?.Config;
} catch (error) {
  console.error('FAIL: cannot load the plugin module:', error.message);
  console.error('      Run `pnpm install` in the monorepo root, or run this');
  console.error('      test from a DSH profile node_modules tree.');
  process.exit(1);
}

console.log('name:', plugin.name);
console.log('inject:', JSON.stringify(plugin.inject));
console.log('apply:', typeof plugin.apply);
console.log('Config:', typeof Config);

if (plugin.name !== 'web-search-ollama') {
  console.error('FAIL: unexpected plugin name');
  process.exit(1);
}
if (typeof plugin.apply !== 'function' || typeof Config !== 'function') {
  console.error('FAIL: plugin shape incomplete');
  process.exit(1);
}
console.log('OK: plugin module shape is valid');
