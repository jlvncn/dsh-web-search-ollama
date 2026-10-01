#!/usr/bin/env node
/**
 * Release consistency guard: the Release tag, every manifest version, and the
 * CHANGELOG entry must agree before anything is packed or published.
 *
 * Why this exists — the v0.1.14 incident (2026-10-01): the commit that widened
 * the `@deepseek-ai/dsh-web` peer range changed `package.json` but not
 * `pnpm-lock.yaml`. `test` failed on the push, the release path ran no tests at
 * all (`test` is push/PR-only), and both release jobs died inside
 * `pnpm install --frozen-lockfile`. The Release was already published, so the
 * result was a dangling Release whose version existed neither on the registry
 * nor as a tarball asset.
 *
 * The lockfile half of that gap is covered by the frozen install inside the
 * `verify-release` CI job. This script covers the other three risks listed in
 * issue #10: three manifests drifting apart, the tag disagreeing with the
 * manifests, and the CHANGELOG entry (heading + bottom link) being forgotten.
 *
 * Usage:
 *   RELEASE_TAG=v0.1.15 node scripts/check-release-consistency.mjs
 *   node scripts/check-release-consistency.mjs v0.1.15
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Manifests that must carry the released version: the published pair plus the monorepo root. */
const MANIFESTS = [
  'package.json',
  'packages/dsh-web-search-ollama/package.json',
  'packages/dsh-web-search-ollama-client/package.json',
]

const CHANGELOG = 'CHANGELOG.md'

const tag = (process.env.RELEASE_TAG ?? process.argv[2] ?? '').trim()
if (tag === '') {
  console.error('✗ RELEASE_TAG (or argv[1]) is required, for example v0.1.15')
  process.exit(1)
}

const tagMatch = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag)
if (tagMatch === null) {
  console.error(`✗ release tag "${tag}" is not of the form v<semver>`)
  process.exit(1)
}
const expected = tagMatch[1]

const failures = []

console.log(`Release guard for tag ${tag} (expected version ${expected})\n`)

// 1. Every manifest must declare the released version.
for (const rel of MANIFESTS) {
  let version = '(unreadable)'
  try {
    const pkg = JSON.parse(readFileSync(join(repoRoot, rel), 'utf8'))
    version = typeof pkg.version === 'string' ? pkg.version : '(missing version field)'
  } catch (error) {
    version = `(unreadable: ${String(error)})`
  }
  const ok = version === expected
  if (!ok) failures.push(`${rel} is ${version}, expected ${expected}`)
  console.log(`${ok ? '✓' : '✗'} ${rel} — ${version}`)
}

// 2. The CHANGELOG must carry the entry and its bottom link (Keep a Changelog).
let changelog = ''
try {
  changelog = readFileSync(join(repoRoot, CHANGELOG), 'utf8')
} catch (error) {
  failures.push(`${CHANGELOG} is unreadable: ${String(error)}`)
}
if (changelog !== '') {
  const hasHeading = changelog.includes(`## [${expected}]`)
  const hasLink = new RegExp(`^\\[${expected.replace(/\./g, '\\.')}\\]:\\s*\\S+`, 'm').test(changelog)
  if (!hasHeading) failures.push(`${CHANGELOG} has no "## [${expected}]" section`)
  if (!hasLink) failures.push(`${CHANGELOG} has no "[${expected}]: <url>" link at the bottom`)
  console.log(`${hasHeading ? '✓' : '✗'} ${CHANGELOG} heading "## [${expected}]"`)
  console.log(`${hasLink ? '✓' : '✗'} ${CHANGELOG} bottom link "[${expected}]: …"`)
}

console.log('')
if (failures.length > 0) {
  for (const failure of failures) console.error(`✗ ${failure}`)
  console.error(
    `\n✗ Refusing to release: make every manifest ${expected}, add the CHANGELOG entry,`
    + ` refresh pnpm-lock.yaml, and re-tag ${tag}.`,
  )
  process.exit(1)
}
console.log(`✓ tag ${tag} is consistent across ${MANIFESTS.length} manifests and ${CHANGELOG}.`)
