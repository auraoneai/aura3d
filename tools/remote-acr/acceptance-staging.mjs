/**
 * Browser acceptance upload selection. The host validates the complete gate
 * against the full checkout first; only then may whole top-level asset trees
 * that the selected browser specs never reference be left out of the ACR
 * build context. Nothing here substitutes bytes: an omitted file is absent,
 * and every staged file is still verified against the gate-bound manifest.
 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ACCEPTANCE_STAGING_RECORD = '.aura3d-acceptance-staging.json';
export const ACCEPTANCE_STAGING_SCHEMA = 'aura3d.acceptance-staging/1';

/** Repository trees with no runtime role in a browser acceptance image unless a selected spec names them. */
export const OMITTABLE_ACCEPTANCE_ROOTS = Object.freeze([
  '.agents/', '.claude/', '.cursor/', '.github/', 'apps/', 'archive/', 'aura-evidence/', 'benchmark/', 'benchmarks/',
  'docs/', 'evidence/', 'marketing/', 'release-artifacts/', 'store-assets/', 'templates/'
]);
/** Always staged: the gate's own roadmap/ledger, Dockerfile-required evidence, replay fixtures and shared app styles. */
export const REQUIRED_ACCEPTANCE_PREFIXES = Object.freeze([
  'docs/prds/', 'evidence/exposure-parity/wp6/', 'evidence/aura-slam/', 'apps/common/', 'apps/showcase-port-shared/'
]);

const required = path => REQUIRED_ACCEPTANCE_PREFIXES.some(prefix => path.startsWith(prefix));
/** A manifest path that a browser staging record may leave out. */
export const isOmittableAcceptancePath = path =>
  typeof path === 'string' && !required(path) && OMITTABLE_ACCEPTANCE_ROOTS.some(root => path.startsWith(root));

export const ACCEPTANCE_SCAN_SEEDS = Object.freeze(['playwright.config.ts', 'vite.config.ts', 'vite.aliases.generated.ts']);

const IMPORT = /(?:from\s*|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g;
const EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.mjs', '.js', '/index.ts', '/index.mjs', '/index.js'];

/**
 * Collect the omittable roots named by the selected specs and every
 * repository-relative module they import (transitively, relative imports only).
 * A root is kept when any reachable file mentions it as a path.
 */
export function referencedAcceptanceRoots(root, specs, readText = path => readFileSync(resolve(root, path), 'utf8')) {
  const kept = new Set(), seen = new Set(), queue = [...specs];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    let text;
    try { text = readText(file); } catch { continue; }
    for (const candidate of OMITTABLE_ACCEPTANCE_ROOTS) {
      const name = candidate.slice(0, -1).replace(/[.]/g, '\\.');
      if (new RegExp(`(?:^|[^A-Za-z0-9_.-])${name}/`).test(text)) kept.add(candidate);
    }
    for (const match of text.matchAll(IMPORT)) {
      const base = posix.normalize(posix.join(posix.dirname(file), match[1]));
      if (base.startsWith('../') || base.includes('node_modules/')) continue;
      const hit = EXTENSIONS.map(ext => base + ext).find(path => {
        try { return existsSync(resolve(root, path)) && lstatSync(resolve(root, path)).isFile(); } catch { return false; }
      });
      if (hit) queue.push(hit);
    }
  }
  return [...kept].sort();
}

/**
 * Split gate inputs into staged and omitted paths. Only source-manifest paths
 * under an unreferenced omittable root are omitted; every report, archive,
 * gate input outside the manifest and kept root is staged.
 */
export function selectAcceptanceStaging({ inputs, manifestPaths, keepRoots = [] }) {
  const manifest = new Set(manifestPaths), keep = new Set(keepRoots);
  const staged = [], omitted = [];
  for (const path of inputs) {
    const root = OMITTABLE_ACCEPTANCE_ROOTS.find(prefix => path.startsWith(prefix));
    if (manifest.has(path) && isOmittableAcceptancePath(path) && !keep.has(root)) omitted.push(path);
    else staged.push(path);
  }
  return { staged, omitted: [...new Set(omitted)].sort() };
}

const sha256 = data => createHash('sha256').update(data).digest('hex');

export function createAcceptanceStagingRecord({ gateBytes, omitted, keepRoots }) {
  return { schema: ACCEPTANCE_STAGING_SCHEMA, gateSha256: sha256(gateBytes), keptRoots: [...keepRoots].sort(), omitted: [...omitted].sort() };
}

/**
 * Validate a staging record found in an acceptance root. Returns the omitted
 * path set; throws for a record bound to another gate, a non-omittable or
 * unlisted path, or an "omitted" file that is actually present.
 */
export function readAcceptanceStaging(root, gateBytes, manifestPaths) {
  const path = resolve(root, ACCEPTANCE_STAGING_RECORD);
  if (!existsSync(path)) return null;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('acceptance staging record must be a regular file');
  const record = JSON.parse(readFileSync(path, 'utf8'));
  const manifest = new Set(manifestPaths);
  if (record?.schema !== ACCEPTANCE_STAGING_SCHEMA || record.gateSha256 !== sha256(gateBytes) || !Array.isArray(record.omitted)
      || !Array.isArray(record.keptRoots)) throw new Error('acceptance staging record is invalid or bound to another gate');
  const omitted = new Set();
  record.omitted.forEach((item, index) => {
    if (typeof item !== 'string' || !manifest.has(item) || !isOmittableAcceptancePath(item)
        || (index && record.omitted[index - 1] >= item) || record.keptRoots.some(rootPath => item.startsWith(rootPath))) {
      throw new Error(`acceptance staging omits a non-omittable or unlisted path: ${item}`);
    }
    if (existsSync(resolve(root, item)) || isLink(resolve(root, item))) throw new Error(`acceptance staging omits a present file: ${item}`);
    omitted.add(item);
  });
  return omitted;
}
function isLink(path) {
  try { return lstatSync(path).isSymbolicLink(); } catch { return false; }
}

/** Payload trees a native browser image cannot run without (consumer templates, environments, fixtures). */
export const REQUIRED_BROWSER_PAYLOADS = Object.freeze(['tests/fixtures', 'tests/support', 'packages/create-aura3d/templates', 'public/aura-environments']);

/**
 * Fail before submission when the staged context lacks a selected spec, a
 * required payload tree, or any file the staging selection promised.
 */
export function assertStagedContext(context, { specs, staged = [] }) {
  const problems = [];
  for (const spec of specs) if (!isFile(resolve(context, spec))) problems.push(`selected spec absent from candidate: ${spec}`);
  for (const dir of REQUIRED_BROWSER_PAYLOADS) {
    const path = resolve(context, dir);
    let entries = [];
    try { entries = lstatSync(path).isDirectory() ? readdirSync(path) : []; } catch { /* reported below */ }
    if (!entries.length) problems.push(`candidate omitted required payload: ${dir}`);
  }
  for (const path of staged) if (!existsSync(resolve(context, path)) && !isLink(resolve(context, path))) problems.push(`staged input missing from context: ${path}`);
  if (problems.length) throw new Error(problems.join('; '));
}
function isFile(path) {
  try { return lstatSync(path).isFile(); } catch { return false; }
}

const readNulList = path => readFileSync(path, 'utf8').split('\0').filter(Boolean);

/**
 * CLI used by tools/remote-acr/run.sh:
 *   select <nul-list> <gate> <record-out> <spec...>   rewrite the list, write the record
 *   verify-context <context> <nul-list> <spec...>     staged-context omission check
 */
export function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'select') {
    const [listPath, gatePath, recordPath, ...specs] = rest;
    if (!listPath || !gatePath || !recordPath || !specs.length) throw new Error('select requires <list> <gate> <record> <spec...>');
    const gateBytes = readFileSync(gatePath);
    const gate = JSON.parse(gateBytes.toString('utf8'));
    const manifest = JSON.parse(readFileSync(gate.sourceManifest.path, 'utf8'));
    const extra = (process.env.AURA3D_EXTRA_DIRS ?? '').split(/\s+/).filter(Boolean)
      .map(dir => OMITTABLE_ACCEPTANCE_ROOTS.find(rootPath => `${dir}/`.startsWith(rootPath))).filter(Boolean);
    // Root configs load in every browser image (dev server, Playwright projects), so they seed the scan too.
    const keepRoots = [...new Set([...referencedAcceptanceRoots('.', [...ACCEPTANCE_SCAN_SEEDS, ...specs]), ...extra])].sort();
    const { staged, omitted } = selectAcceptanceStaging({ inputs: readNulList(listPath), manifestPaths: manifest.files.map(entry => entry.path), keepRoots });
    writeFileSync(listPath, staged.map(path => `${path}\0`).join(''));
    writeFileSync(recordPath, `${JSON.stringify(createAcceptanceStagingRecord({ gateBytes, omitted, keepRoots }), null, 2)}\n`);
    process.stdout.write(`   staging    : ${staged.length} staged, ${omitted.length} unreferenced asset files omitted (kept roots: ${keepRoots.join(' ') || 'none'})\n`);
  } else if (command === 'verify-context') {
    const [context, listPath, ...specs] = rest;
    if (!context || !listPath) throw new Error('verify-context requires <context> <list> <spec...>');
    assertStagedContext(context, { specs, staged: readNulList(listPath) });
  } else throw new Error(`unknown acceptance staging command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(`FATAL: ${error.message}`); process.exitCode = 2; }
}
