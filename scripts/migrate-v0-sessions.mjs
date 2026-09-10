#!/usr/bin/env node
/**
 * One-off recovery: publish a current (v3) generation for historical v0
 * sessions that the frozen v0->v1 migration refuses.
 *
 * Background
 * ----------
 * v0.1.5 stopped this plugin from writing session events, because the audit
 * event it used to write (`web/deepseek-search-llm-request` with an Ollama
 * body) made every v0-format session containing it unopenable:
 *
 *     web/deepseek-search-llm-request 131 body has unexpected member "query"
 *
 * Upgrading the plugin stops NEW damage; it cannot repair logs already on disk.
 * This script runs the real build-static format catalog, encodes the v3
 * generation, verifies it with the strict `validation: 'current'` path, and only
 * then publishes it. Two unrelated legacy shapes are also handled:
 *
 *   - `subagent/descriptor` version 2 (one-shot)   -> --normalize-descriptor-v2
 *   - `permission/preset` carrying `origin`        -> --relax-v0-validator
 *   - the Ollama `web/deepseek-search-llm-request` body -> --relax-v0-validator
 *
 * Safety
 * ------
 *   - The source v0 artifact is never modified.
 *   - Output goes to a staging file, is verified, then published with a
 *     no-overwrite hard link; an existing `session.vN.jsonl.zstd` is left alone.
 *   - Dry run by default; `--apply` is required to write anything.
 *   - `--relax-v0-validator` temporarily relaxes two frozen v0 payload checks in
 *     the DSH install, re-executes this script so the relaxed module is the one
 *     ESM actually loads, and restores the file in a `finally`. It exists only
 *     for logs refused by the payload inventory; prefer the upstream reader fix
 *     when one lands (deepseek-ai/deepseek-harness discussion #5818). Never leave
 *     the patched file in place.
 *
 * Usage
 * -----
 *   node scripts/migrate-v0-sessions.mjs                  # dry run, all projects
 *   node scripts/migrate-v0-sessions.mjs --apply           # publish verified v3
 *   node scripts/migrate-v0-sessions.mjs --verify-existing # re-read existing v3
 *   node scripts/migrate-v0-sessions.mjs --ids a,b         # exact session dirs
 *   node scripts/migrate-v0-sessions.mjs --only <substr>
 *   node scripts/migrate-v0-sessions.mjs --root <session-project-dir>
 *   node scripts/migrate-v0-sessions.mjs --dsh-install <path to @deepseek-ai/dsh>
 *   node scripts/migrate-v0-sessions.mjs --relax-v0-validator
 *   node scripts/migrate-v0-sessions.mjs --normalize-descriptor-v2
 *
 * Requires Node >= 20.3 (zstd one-shot API) and a DSH install whose format
 * catalog can be resolved. Sessions are read from `$DSH_HOME/sessions` unless
 * `--root` is given.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { constants: ZC } = zlib;
const V0_NAME = 'session.jsonl.zstd';
const V3_NAME = 'session.v3.jsonl.zstd';
/** Internal marker: the parent already relaxed the validator and re-executed. */
const INNER_RELAX_FLAG = '--internal-relaxed';

// ── arguments ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argValue = (flag) => {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
};

const apply = argv.includes('--apply');
const verifyOnly = argv.includes('--verify-existing');
const relaxValidator = argv.includes('--relax-v0-validator');
const normalizeDescriptorV2 = argv.includes('--normalize-descriptor-v2');
const only = argValue('--only');
const idsArg = argValue('--ids');
const ids = idsArg === undefined ? undefined : new Set(idsArg.split(',').map((id) => id.trim()).filter(Boolean));

// ── locate the DSH install ──────────────────────────────────────────────────
function resolveDshInstall(explicit) {
  const candidates = [explicit, process.env.DSH_INSTALL];
  try {
    const bin = execFileSync('which', ['dsh'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (bin !== '') candidates.push(path.dirname(path.dirname(fs.realpathSync(bin))));
  } catch { /* dsh is not on PATH; fall through to the well-known prefixes */ }
  candidates.push(
    '/opt/homebrew/lib/node_modules/@deepseek-ai/dsh',
    '/usr/local/lib/node_modules/@deepseek-ai/dsh',
    '/usr/lib/node_modules/@deepseek-ai/dsh',
  );
  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    try {
      createRequire(path.join(candidate, 'noop.js')).resolve('@deepseek-ai/dsh-session-format-catalog');
      return candidate;
    } catch { /* try the next candidate */ }
  }
  throw new Error('cannot locate the DSH install; pass --dsh-install <path to the @deepseek-ai/dsh package>');
}

function resolveRoots(rootArg) {
  if (rootArg !== undefined) return [rootArg];
  const dshHome = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
  const sessions = path.join(dshHome, 'sessions');
  if (!fs.existsSync(sessions)) throw new Error(`cannot find ${sessions}; pass --root <session-project-dir>`);
  const projects = fs.readdirSync(sessions, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(sessions, entry.name));
  if (projects.length === 0) throw new Error(`no session project directories under ${sessions}`);
  return projects;
}

const dshInstall = resolveDshInstall(argValue('--dsh-install'));

// ── optional temporary relaxation of the frozen v0 payload checks ───────────
// Runs in a fresh process: ESM caches the catalog (and with it the v0->v1
// package) at import time, so editing the file after import would have no
// effect. The parent patches, re-executes itself, and always restores.
const V0V1_LIB = path.join(dshInstall, 'node_modules/@deepseek-ai/dsh-session-format-v0-to-v1/lib/index.js');
const RELAXATIONS = [
  {
    name: 'Ollama `web/deepseek-search-llm-request` body',
    before: 'function deepSeekSearchBodyValue(value, label) {\n\tconst body = exactRecord(value, label, [\n\t\t"model",\n\t\t"max_tokens",\n\t\t"messages",\n\t\t"tools"\n\t]);\n',
    after: 'function deepSeekSearchBodyValue(value, label) {\n\tif (value !== null && typeof value === "object" && !Array.isArray(value) && typeof value["query"] === "string" && value["query"].length > 0) return;\n\tconst body = exactRecord(value, label, [\n\t\t"model",\n\t\t"max_tokens",\n\t\t"messages",\n\t\t"tools"\n\t]);\n',
  },
  {
    name: '`permission/preset` origin member',
    before: '\t"permission/preset": disposition(["preset"]),\n',
    after: '\t"permission/preset": disposition(["preset"], ["origin"]),\n',
  },
];

if (relaxValidator && !argv.includes(INNER_RELAX_FLAG)) {
  if (!fs.existsSync(V0V1_LIB)) throw new Error(`cannot find ${V0V1_LIB}`);
  const original = fs.readFileSync(V0V1_LIB, 'utf8');
  let patched = original;
  const changed = [];
  for (const relaxation of RELAXATIONS) {
    if (patched.includes(relaxation.after)) continue;
    if (!patched.includes(relaxation.before)) throw new Error(`validator patch target not found: ${relaxation.name}`);
    patched = patched.replace(relaxation.before, relaxation.after);
    changed.push(relaxation.name);
  }
  if (changed.length > 0) fs.writeFileSync(V0V1_LIB, patched);
  console.log(`[relax] temporarily relaxed: ${changed.join('; ') || '(already relaxed)'}`);
  let exitCode = 1;
  try {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(import.meta.url), ...argv, INNER_RELAX_FLAG],
      { stdio: 'inherit' },
    );
    if (result.error !== undefined) throw result.error;
    exitCode = result.status ?? 1;
  } finally {
    fs.writeFileSync(V0V1_LIB, original);
    console.log('[relax] v0-to-v1 validator restored');
  }
  process.exit(exitCode);
}

const dshRequire = createRequire(path.join(dshInstall, 'noop.js'));
const catalogModule = await import(pathToFileURL(
  dshRequire.resolve('@deepseek-ai/dsh-session-format-catalog'),
).href);
const catalog = catalogModule.sessionFormatCatalog ?? catalogModule.default?.sessionFormatCatalog;
if (catalog === undefined) throw new Error('could not load sessionFormatCatalog from the DSH install');

// ── Zstandard container (mirrors dsh-session-persistence-jsonl) ─────────────
const ZSTD_MAGIC = 4247762216;
const CHECKSUM_OPTIONS = { params: { [ZC.ZSTD_c_checksumFlag]: 1 } };

/** Locate complete frames without decompressing their blocks. */
function scanZstdFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) return { frames, tornStart: start };
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) throw new Error(`corrupt frame magic at byte ${offset}`);
    offset += 4;
    if (offset === buffer.length) return { frames, tornStart: start };
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 24) !== 0) throw new Error(`reserved frame-header bit at byte ${offset - 1}`);
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag;
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start };
    offset += remainingHeaderBytes;
    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start };
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = (blockHeader >>> 1) & 3;
      const blockSize = blockHeader >>> 3;
      if (blockType === 3) throw new Error(`reserved block type at byte ${offset - 3}`);
      const payloadBytes = blockType === 1 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start };
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start };
      offset += 4;
    }
    frames.push({ start, end: offset });
  }
  return { frames };
}

const compressFrame = (input) => zlib.zstdCompressSync(input, CHECKSUM_OPTIONS);
const decompressFrame = (buffer, frame) => zlib.zstdDecompressSync(buffer.subarray(frame.start, frame.end));

/** Split a concatenated-frame container into its header line and event lines. */
function decodeLog(buffer) {
  const { frames, tornStart } = scanZstdFrames(buffer);
  if (frames.length === 0) throw new Error('empty or header-less container');
  if (tornStart !== undefined) throw new Error(`torn final frame at byte ${tornStart}; refusing to migrate`);
  const plains = frames.map((frame) => decompressFrame(buffer, frame));
  const headerPlain = plains[0];
  if (headerPlain.length === 0 || headerPlain.indexOf(10) !== headerPlain.length - 1) {
    throw new Error('first frame is not exactly one header line');
  }
  const headerLine = headerPlain.subarray(0, headerPlain.length - 1).toString('utf8');
  const eventsPlain = Buffer.concat(plains.slice(1)).toString('utf8');
  const eventLines = eventsPlain.length === 0 ? [] : eventsPlain.split('\n').filter((line) => line.length > 0);
  return { headerLine, eventLines };
}

/** Read a container back with the strict installed-current validation. */
function verifyCurrent(buffer) {
  const { headerLine, eventLines } = decodeLog(buffer);
  const restore = catalog.createRestore(JSON.parse(headerLine), { recovery: 'strict', validation: 'current' });
  for (const line of eventLines) restore.decodeRow(JSON.parse(line));
  return restore.finish().events.length;
}

/**
 * Normalize the one legacy descriptor shape whose only difference from the
 * current format is its own version marker. A v2 `one-shot` descriptor carries
 * exactly the v3 `one-shot` payload; rewriting the marker lets the real
 * migration encode it without relaxing any validator.
 */
function normalizeLegacyRow(row, onNormalize) {
  if (
    row !== null && typeof row === 'object' && !Array.isArray(row)
    && row.type === 'subagent/descriptor'
    && row.data !== null && typeof row.data === 'object' && !Array.isArray(row.data)
    && row.data.version === 2 && row.data.mode === 'one-shot'
  ) {
    onNormalize();
    return { ...row, data: { ...row.data, version: 3 } };
  }
  return row;
}

/** Migrate one v0 container to a verified v3 container (in memory). */
function migrate(buffer) {
  const { headerLine, eventLines } = decodeLog(buffer);
  const headerObj = JSON.parse(headerLine);
  const read = catalog.readHeader(headerObj);
  if (read.status === 'unsupported') throw new Error(`unsupported header: ${read.reason}`);
  const restore = catalog.createRestore(headerObj, { recovery: 'recoverable', validation: 'transformed' });
  let normalized = 0;
  const onNormalize = () => { normalized += 1; };
  for (const line of eventLines) {
    const row = JSON.parse(line);
    restore.decodeRow(normalizeDescriptorV2 ? normalizeLegacyRow(row, onNormalize) : row);
  }
  const artifact = restore.finish();
  const headerRecord = catalog.encodeCurrentHeader(
    { ...artifact.header, delegationDepth: artifact.header.delegationDepth ?? 0 },
    artifact.inheritedEventCount,
  );
  const eventRecords = artifact.events.map((event) => catalog.encodeCurrentEvent(event));
  const parts = [compressFrame(Buffer.from(`${JSON.stringify(headerRecord)}\n`, 'utf8'))];
  if (eventRecords.length > 0) {
    const eventsBytes = Buffer.from(`${eventRecords.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8');
    parts.push(compressFrame(eventsBytes));
  }
  const out = Buffer.concat(parts);
  const verifiedEvents = verifyCurrent(out);
  if (verifiedEvents !== artifact.events.length) {
    throw new Error(`verification event mismatch: ${verifiedEvents} !== ${artifact.events.length}`);
  }
  return {
    storedVersion: read.storedVersion,
    sourceEvents: eventLines.length,
    targetEvents: artifact.events.length,
    inheritedEventCount: artifact.inheritedEventCount,
    normalized,
    out,
  };
}

// ── driver ──────────────────────────────────────────────────────────────────
const roots = resolveRoots(argValue('--root'));
console.log(`dsh install: ${dshInstall}`);
console.log(`root(s)    : ${roots.join(', ')}`);
console.log(`mode       : ${verifyOnly ? 'VERIFY' : apply ? 'APPLY' : 'DRY RUN'}`);

let migrated = 0;
let skipped = 0;
let failed = 0;

for (const root of roots) {
  const names = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => only === undefined || name.includes(only))
    .filter((name) => ids === undefined || ids.has(name))
    .sort();
  for (const name of names) {
    const dir = path.join(root, name);
    const source = path.join(dir, V0_NAME);
    const target = path.join(dir, V3_NAME);
    if (verifyOnly) {
      if (!fs.existsSync(target)) continue;
      try {
        const { headerLine, eventLines } = decodeLog(fs.readFileSync(target));
        const headerObj = JSON.parse(headerLine);
        const read = catalog.readHeader(headerObj);
        if (read.status !== 'current' || read.storedVersion !== 3) {
          throw new Error(`header status=${read.status} storedVersion=${read.storedVersion}`);
        }
        const production = catalog.createRestore(headerObj, { recovery: 'recoverable', validation: 'transformed' });
        for (const line of eventLines) production.decodeRow(JSON.parse(line));
        const productionEvents = production.finish().events.length;
        const strictEvents = verifyCurrent(fs.readFileSync(target));
        if (strictEvents !== productionEvents) {
          throw new Error(`event mismatch: strict=${strictEvents} production=${productionEvents}`);
        }
        console.log(`ok    ${name}: v3 events=${strictEvents}`);
        migrated += 1;
      } catch (error) {
        failed += 1;
        console.error(`FAIL  ${name}: ${error.message}`);
      }
      continue;
    }
    if (!fs.existsSync(source)) { skipped += 1; continue; }
    if (fs.existsSync(target)) { skipped += 1; continue; }
    try {
      const result = migrate(fs.readFileSync(source));
      const note = result.normalized > 0 ? ` normalized=${result.normalized}` : '';
      console.log(`ok    ${name}: v${result.storedVersion}->v3 events ${result.sourceEvents}->${result.targetEvents} inherited ${result.inheritedEventCount} verified ${(result.out.length / 1024).toFixed(0)} KiB${note}`);
      if (apply) {
        const staging = `${target}.staging`;
        fs.writeFileSync(staging, result.out);
        try {
          fs.linkSync(staging, target); // atomic; fails if the target appeared meanwhile
        } finally {
          fs.unlinkSync(staging);
        }
      }
      migrated += 1;
    } catch (error) {
      failed += 1;
      console.error(`FAIL  ${name}: ${error.message}`);
    }
  }
}

console.log(`\n${verifyOnly ? 'verified' : 'migrated'}=${migrated} skipped=${skipped} failed=${failed}${apply || verifyOnly ? '' : ' (dry run)'}`);
process.exitCode = failed > 0 ? 1 : 0;
