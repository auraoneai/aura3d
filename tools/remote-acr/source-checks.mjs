/** Source-only job orchestration. No arbitrary command, shell or browser entrypoint. */
import { createHash } from 'node:crypto';
import childProcess, { spawnSync, execFileSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { chmodSync, closeSync, constants, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, readlinkSync, realpathSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isSourceInput } from '../release/source-identity.mjs';
import { assertArchiveAdmissionConfigured, verifyArchiveAdmissionBatch, verifyPnpmArchiveAdmissionBatch } from '../release/archive-admission.mjs';
import {
  assertWorkspacePnpmInstallReady, inspectWorkspacePnpmToolchain, prepareWorkspacePnpmOfflineStore,
  verifyWorkspacePnpmInstalledSnapshot
} from '../release/workspace-pnpm-admission.mjs';
import { assertNativeSourceInventoryReady, createNativeSourceInventory } from '../native-source-inventory/index.mjs';
import { stagePortableInputs, verifyPortableInputs } from './portable-inputs.mjs';
import { stageSourceBuildHandoff, verifySourceBuildHandoff, verifySupplementalEvidence } from './source-resume.mjs';
export { isSourceInput };

export const MANIFEST_SCHEMA = 'aura3d.native-source-manifest/1';
export const REPORT_SCHEMA = 'aura3d.native-source-reports/1';
export const BUILD_REPORT_SCHEMA = 'aura3d.native-source-build/1';
export const MANIFEST_NAME = '.native-source-manifest.json';
export const ADMINISTRATIVE_FILES = Object.freeze([
  'docs/prds/aura3d-native-capability-ledger.json',
  'docs/prds/aura3d-native-acceptance.md'
]);
export const EXPECTED_CHECK_IDS = Object.freeze([
  'typecheck', 'lint', 'resolution', 'parity', 'unit', 'assets-qr', 'packages',
  'node-release', 'build', 'unit-dist', 'pack', 'resume-rebuild', 'unit-packed', 'api-baseline', 'docs-codeblocks', 'api-docs', 'agent-docs', 'integration', 'packages-dist',
  'browser-tests-typecheck', 'verify-exports', 'verify-imports', 'tarballs',
  'clean-install-source', 'installed-tree-shaking', 'bundle-size', 'api-diff',
  'public-api', 'consumer-matrix-source', 'examples-source', 'runtime-audit-source'
]);
// These tests inspect the actual fresh build or its retained candidate archive.
// Keep the partition exact; the ordinary unit run must not see stale host dist.
export const BUILT_UNIT_TESTS = Object.freeze([
  'tests/unit/consumer-bundle/no-tla.test.ts',
  'tests/unit/package-dist/root-gates.test.ts'
]);
export const PACKED_UNIT_TESTS = Object.freeze([
  'tests/unit/tools/packed-consumer-check.test.ts'
]);
// Historical release verdicts consume retained browser/pixel measurements and
// repository history. Preserve their exact names for Phase B, while testing
// their pure analysis using explicitly synthetic inputs during Phase A.
export const HISTORICAL_ACCEPTANCE_INVENTORY = 'tools/muse3jsparity-readiness/baseline-unit-inventory.json';
export const HISTORICAL_SOURCE_TEST = 'tests/unit/tools/native-historical-evidence-analysis.test.ts';
export const HISTORICAL_LAUNCHER = 'tools/remote-acr/historical-acceptance.mjs';
export const HISTORICAL_LAUNCHER_TEST = 'tests/unit/tools/native-historical-acceptance-launcher.test.ts';
export const HISTORICAL_ACCEPTANCE_TESTS = Object.freeze([
  'tests/unit/tools/developer-value.test.ts',
  'tests/unit/tools/honest-public-claims.test.ts',
  'tests/unit/tools/release-metrics-rollup.test.ts'
]);
// This separate cell uses first-party historical simulation fixtures, not a
// current-candidate browser receipt. No replay occurs in the source phase.
export const HISTORICAL_REPLAY_TEST = 'tests/unit/aura-slam/replay.test.ts';
export const HISTORICAL_REPLAY_SOURCE_TEST = 'tests/unit/aura-slam/native-replay-source.test.ts';
export const HISTORICAL_REPLAY_FIXTURES = Object.freeze([
  Object.freeze({ path: 'evidence/aura-slam/reference.json', sha256: '05edfbd2d5836a8c160c026f5b99aea512fdf49a7a9d8bfeef679eea1e665271' }),
  Object.freeze({ path: 'tests/browser/aura-slam-golden.json', sha256: '5db9bda629800495943c4ec35cca77bf846b792bbc9bdd97cf20a6673ae8164a' }),
  Object.freeze({ path: 'tests/fixtures/aura-slam-original/README.md', sha256: 'f5705ad8cfa34452641469a641a35a5051c836cfda7a774ea8b25e5ae9bb1781' }),
  Object.freeze({ path: 'tests/fixtures/aura-slam-original/toptennis/match-engine.js', sha256: '141f280b66cef798a0792aa55ab804e40fac18e4eac6857c5a7c4b08f96aeb50' }),
  Object.freeze({ path: 'tests/fixtures/aura-slam-original/toptennis/physics.js', sha256: '23a6dc3b404a118afb6eba0e12f79bdf5d239156cc4123bb8aca89a459e36e56' }),
  Object.freeze({ path: 'tests/fixtures/aura-slam-original/toptennis/player-appearance.js', sha256: '114df54afe59bdd005fb9a8a55a216442527aaa5157021f7112b4a9840f4abd9' }),
  Object.freeze({ path: 'tests/fixtures/aura-slam-original/toptennis/player-roster.js', sha256: '729714855ca743fe0f632dda0bab3edfd9cedb6dc871e77a5360d72471bf49a4' }),
  Object.freeze({ path: 'tests/fixtures/aura-slam-original/toptennis/strokes.js', sha256: '3c51f6d4014f35b894973e2c4ca2d54551b9a0f17da0f62d178056a4d210ca87' })
]);
export const HISTORICAL_REPLAY_ASSERTIONS = Object.freeze([
  `${HISTORICAL_REPLAY_TEST}::baseline reference (live page capture): structure and what a replay must preserve is the a3d-crayon-capture/1 capture with six scenarios, two identical sessions each`,
  `${HISTORICAL_REPLAY_TEST}::baseline reference (live page capture): structure and what a replay must preserve the sim itself equals the original engine over full matches (see autoplay-golden.test.ts, remote replay in aura-slam-int.spec.ts)`,
  `${HISTORICAL_REPLAY_TEST}::gate G1: shell-level replay of the live page's scenarios covers the six scenarios, including the manual run's saved key events`,
  ...['auto-beginner-hard', 'auto-beginner-moon', 'auto-club-grass', 'auto-legend-hard', 'auto-pro-clay', 'manual-human-policy'].map(id =>
    `${HISTORICAL_REPLAY_TEST}::gate G1: shell-level replay of the live page's scenarios ${id}: steps, result, score timeline, event log and sampled rows match the baseline`)
].sort());
// The checked-in capture is the six-scenario schema, so these legacy and
// missing-file branches are intentionally inapplicable, never counted as run.
export const HISTORICAL_REPLAY_INAPPLICABLE = Object.freeze([
  `${HISTORICAL_REPLAY_TEST}::native simulation replays the original engine's recorded run (gate G1) the reference file is a non-empty a3d-crayon-capture/1 aura-slam capture`,
  `${HISTORICAL_REPLAY_TEST}::replay gate G1 is waiting for evidence/aura-slam/reference.json reference capture not committed yet: run the slam-ref capture, then this suite replays it`
].sort());
// External codec fixture admission is separate from first-party historical
// replay. Only source/config/policy identities are known in Phase A; external
// fixture bytes and any unresolved digests are not fabricated here.
export const EXTERNAL_CODEC_TEST = 'tests/acceptance/gltf-external-decoder-fixtures.test.ts';
export const EXTERNAL_CODEC_CONFIG = 'tests/acceptance/external-codec.vitest.config.ts';
export const EXTERNAL_CODEC_POLICY = 'tests/acceptance/gltf-external-codec-policy.json';
export const EXTERNAL_CODEC_CONTRACT = 'tools/remote-acr/external-codec-contract.mjs';
export const EXTERNAL_CODEC_CONTRACT_TYPES = 'tools/remote-acr/external-codec-contract.d.mts';
export const EXTERNAL_CODEC_SOURCE_TEST = 'tests/assets/gltf-optional-external-decoders.test.ts';
export const EXTERNAL_CODEC_CONTRACT_TEST = 'tests/unit/tools/native-external-codec-contract.test.ts';
export const EXTERNAL_CODEC_LAUNCHER = 'tools/remote-acr/external-codec-run.mjs';
export const EXTERNAL_CODEC_LAUNCHER_TEST = 'tests/unit/tools/native-external-codec-launcher.test.ts';
export const PORTABLE_NPM_LOCK = 'tools/release/portable-npm-lock.mjs';
export const PORTABLE_NPM_LOCK_TYPES = 'tools/release/portable-npm-lock.d.mts';
export const PORTABLE_NPM_LOCK_TEST = 'tests/unit/tools/native-portable-consumers.test.ts';
export const ARCHIVE_ADMISSION_FILES = Object.freeze([
  'tools/release/archive-admission.mjs', 'tools/release/archive-admission.d.mts',
  'tools/release/archive-admission-policy.json', 'tools/release/portable-pnpm-lock.mjs',
  'tools/release/portable-pnpm-lock.d.mts', 'tools/release/workspace-pnpm-admission.mjs',
  'tools/release/workspace-pnpm-admission.d.mts', 'tools/release/pnpm-loopback-registry.mjs',
  'tools/release/pnpm-loopback-registry.d.mts', 'tools/remote-acr/offline-archive-store.mjs',
  'tools/remote-acr/offline-archive-store.d.mts', 'tools/release/pnpm-installed-tree.mjs',
  'tools/release/pnpm-installed-tree.d.mts', 'tools/release/pnpm-platform-selection.mjs',
  'tools/release/pnpm-platform-selection.d.mts', 'tools/release/admitted-archive-modes.mjs',
  'tools/release/admitted-archive-modes.d.mts'
]);
export const ARCHIVE_ADMISSION_TESTS = Object.freeze([
  'tests/unit/tools/native-archive-admission.test.ts', 'tests/unit/tools/native-portable-pnpm-lock.test.ts',
  'tests/unit/tools/native-workspace-pnpm-admission.test.ts', 'tests/unit/tools/native-pnpm-loopback-registry.test.ts',
  'tests/unit/tools/native-pnpm-installed-tree.test.ts', 'tests/unit/tools/native-pnpm-platform-selection.test.ts'
]);
export const EXTERNAL_CODEC_ASSERTIONS = Object.freeze([
  `${EXTERNAL_CODEC_TEST}::external glTF decoder fixture acceptance loads the Khronos MeshoptCubeTest asset with the real meshoptimizer package`,
  `${EXTERNAL_CODEC_TEST}::external glTF decoder fixture acceptance loads the Khronos Duck Draco asset with the real draco3d package`
].sort());
const HISTORICAL_ASSERTION_COUNTS = Object.freeze([7, 6, 7]);
// Digests bind the complete sorted legacy assertion IDs, not just their count.
const HISTORICAL_ASSERTION_SET_SHA256 = Object.freeze([
  '31eda2f768bbec92ae4dea57be326444341ee7a4436f30cb96c1324aef27a70b',
  '162681088e5c3ebc906e0b3e0d5e15c9a9f6e351743260ddfe5fef6e3b8fbf0a',
  '29d7f575a8407c72dee857035fbcc8548a6ec138ff7b9077829a3b0853a02751'
]);
const DEFERRED_UNIT_TESTS = Object.freeze([...BUILT_UNIT_TESTS, ...PACKED_UNIT_TESTS, ...HISTORICAL_ACCEPTANCE_TESTS, HISTORICAL_REPLAY_TEST]);
const UNIT_EXCLUDES = Object.freeze(DEFERRED_UNIT_TESTS.flatMap(path => ['--exclude', path]));
const REQUIRED_FILES = [
  'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json',
  'vitest.config.ts', 'docs/prds/aura3d-native-capability-roadmap.md',
  'tools/remote-acr/source-checks.mjs', 'tools/remote-acr/source-task-run.sh',
  'tools/release/source-identity.mjs', 'tsconfig.browser-tests.json',
  HISTORICAL_ACCEPTANCE_INVENTORY, HISTORICAL_SOURCE_TEST, HISTORICAL_LAUNCHER, HISTORICAL_LAUNCHER_TEST,
  HISTORICAL_REPLAY_SOURCE_TEST, ...HISTORICAL_REPLAY_FIXTURES.map(entry => entry.path), ...DEFERRED_UNIT_TESTS,
  EXTERNAL_CODEC_TEST, EXTERNAL_CODEC_CONFIG, EXTERNAL_CODEC_POLICY, EXTERNAL_CODEC_CONTRACT, EXTERNAL_CODEC_CONTRACT_TYPES, EXTERNAL_CODEC_SOURCE_TEST,
  EXTERNAL_CODEC_CONTRACT_TEST, EXTERNAL_CODEC_LAUNCHER, EXTERNAL_CODEC_LAUNCHER_TEST,
  PORTABLE_NPM_LOCK, PORTABLE_NPM_LOCK_TYPES, PORTABLE_NPM_LOCK_TEST,
  ...ARCHIVE_ADMISSION_FILES, ...ARCHIVE_ADMISSION_TESTS,
  'tools/remote-acr/portable-inputs.mjs', 'tests/unit/tools/native-portable-source-inputs.test.ts',
  'tools/remote-acr/source-resume.mjs', 'tests/unit/tools/native-source-resume.test.ts'
];
const REQUIRED_PREFIXES = [
  'packages/engine/src/', 'tests/unit/', 'tests/integration/', 'tests/assets/',
  'tests/qr/', 'tests/fixtures/', 'tools/release/', 'templates/',
  'packages/create-aura3d/templates/', 'public/aura-environments/', 'docs/'
];
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const SUPPLEMENTAL_POLICY = Object.freeze({
  'app-animation-studio-node': { runner: 'node-test', cwd: '.', files: ['apps/animation-studio-web/verify/wiring.test.cjs'] },
  'app-clash-node': { runner: 'node-test', cwd: '.', files: ['apps/aura-clash-showcase/tests/copy-boundary.test.mjs'] },
  'app-cross-hop-vitest': { runner: 'vitest', cwd: 'apps/showcase-cross-hop', config: 'vitest.config.ts', pattern: /^apps\/showcase-cross-hop\/tests\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/ },
  'app-wonder-world-vitest': { runner: 'vitest', cwd: 'apps/veer-wonder-world', config: '../../tools/native-source-inventory/index.mjs', pattern: /^apps\/veer-wonder-world\/tests\/unit\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/ },
  'asset-optimize-vitest': { runner: 'vitest', cwd: 'tools/asset-optimize', config: 'vitest.config.ts', pattern: /^tools\/asset-optimize\/tests\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/ },
  'cli-config-node': { runner: 'node-test', cwd: '.', files: ['tests/cli-configs/install-meshy-mcp.test.mjs', 'tests/cli-configs/meshy-docs-skill.test.mjs', 'tests/cli-configs/meshy-live-smoke-workflow.test.mjs'] },
  'cli-config-shell': { runner: 'shell', cwd: '.', files: ['tests/cli-configs/meshy-agent.test.sh', 'tests/cli-configs/meshy-mcp-keychain-launcher.test.sh', 'tests/cli-configs/setup-meshy.test.sh'] },
  'docs-game-upgrades-node': { runner: 'node-test', cwd: '.', files: ['docs/prds/game-upgrades-47/lanes/wp36-decisions.test.mjs'] },
  'game-runtime-vitest': { runner: 'vitest', cwd: '.', config: 'tools/native-source-inventory/index.mjs', pattern: /^tests\/game-runtime\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/ },
  'node-release-unit': { runner: 'node-test', cwd: '.', files: ['tests/unit/release/exact-plan.test.mjs', 'tests/unit/release/final-review-approval.test.mjs', 'tests/unit/release/muse301-publication-workflows.test.mjs'] },
  'performance-cpu-vitest': { runner: 'vitest', cwd: '.', config: 'tests/performance/vitest.config.ts', pattern: /^tests\/performance\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/ },
  'template-node': { runner: 'node-test', cwd: '.', files: ['tools/agent-templates/cli.test.mjs', 'tools/agent-templates/command.test.mjs'] },
  'template-source-vitest': { runner: 'vitest', cwd: '.', config: 'tests/templates/vitest.config.ts', pattern: /^tests\/templates\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/ }
});
const sha256 = data => createHash('sha256').update(data).digest('hex');
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const computeInputDigest = files => sha256(canonicalJson([...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)));
function assert(condition, message) { if (!condition) throw new Error(message); }
/** Bind the deferred historical assertions to their original and source-test bytes. */
export function expectedHistoricalAcceptance(manifest, baseline) {
  assert(Array.isArray(manifest?.files) && baseline?.schema === 'muse3jsparity-baseline-inventory/v1' && Array.isArray(baseline.assertions), 'historical acceptance inventory is missing or invalid');
  const inventory = manifest.files.filter(entry => entry.path === HISTORICAL_ACCEPTANCE_INVENTORY);
  assert(inventory.length === 1 && HASH.test(inventory[0].sha256 || ''), 'historical acceptance baseline is missing from the manifest');
  const source = manifest.files.filter(entry => entry.path === HISTORICAL_SOURCE_TEST);
  assert(source.length === 1 && HASH.test(source[0].sha256 || ''), 'historical acceptance source test is missing from the manifest');
  return HISTORICAL_ACCEPTANCE_TESTS.map((path, index) => {
    const files = manifest.files.filter(entry => entry.path === path);
    assert(files.length === 1 && HASH.test(files[0].sha256 || ''), `historical acceptance test is missing from the manifest: ${path}`);
    const prefix = `${path}::`;
    const assertionIds = baseline.assertions.filter(id => typeof id === 'string' && id.startsWith(prefix)).sort();
    assert(assertionIds.length === HISTORICAL_ASSERTION_COUNTS[index] && new Set(assertionIds).size === assertionIds.length
      && assertionIds.every(id => id.length > prefix.length) && sha256(canonicalJson(assertionIds)) === HISTORICAL_ASSERTION_SET_SHA256[index],
    `historical acceptance assertion inventory mismatch: ${path}`);
    return { path, sha256: files[0].sha256, phase: 'acceptance', status: 'not-run', assertionIds,
      sourceTest: { path: HISTORICAL_SOURCE_TEST, sha256: source[0].sha256 } };
  });
}
/** Bind the historical replay contract to first-party fixture and source bytes. */
export function expectedHistoricalReplay(manifest) {
  assert(Array.isArray(manifest?.files), 'historical replay manifest is missing or invalid');
  const entry = path => {
    const found = manifest.files.filter(file => file.path === path);
    assert(found.length === 1 && HASH.test(found[0].sha256 || ''), `historical replay input is missing from the manifest: ${path}`);
    return found[0];
  };
  const replay = entry(HISTORICAL_REPLAY_TEST), source = entry(HISTORICAL_REPLAY_SOURCE_TEST);
  const fixtures = HISTORICAL_REPLAY_FIXTURES.map(fixture => {
    const actual = entry(fixture.path);
    assert(actual.sha256 === fixture.sha256, `historical replay fixture identity mismatch: ${fixture.path}`);
    return { ...fixture };
  });
  return { schema: 'aura3d.historical-replay-inventory/1', kind: 'first-party-historical-regression',
    path: HISTORICAL_REPLAY_TEST, sha256: replay.sha256, phase: 'acceptance', status: 'not-run',
    assertionIds: [...HISTORICAL_REPLAY_ASSERTIONS], inapplicableAssertionIds: [...HISTORICAL_REPLAY_INAPPLICABLE],
    sourceTest: { path: HISTORICAL_REPLAY_SOURCE_TEST, sha256: source.sha256 },
    fixtures, currentCandidateBrowserReceipt: false };
}
/** Bind Phase B codec-fixture policy and the required offline Phase A checks. */
export function expectedExternalCodecAcceptance(manifest) {
  assert(Array.isArray(manifest?.files), 'external codec fixture manifest is missing or invalid');
  const binding = path => {
    const entries = manifest.files.filter(file => file.path === path);
    assert(entries.length === 1 && HASH.test(entries[0].sha256 || ''), `external codec input is missing from the manifest: ${path}`);
    return { path, sha256: entries[0].sha256 };
  };
  const acceptance = binding(EXTERNAL_CODEC_TEST);
  return { schema: 'aura3d.external-codec-fixture-inventory/1', kind: 'external-codec-fixtures',
    ...acceptance, phase: 'acceptance', status: 'not-run', assertionIds: [...EXTERNAL_CODEC_ASSERTIONS],
    config: binding(EXTERNAL_CODEC_CONFIG), policy: binding(EXTERNAL_CODEC_POLICY), contract: binding(EXTERNAL_CODEC_CONTRACT), contractTypes: binding(EXTERNAL_CODEC_CONTRACT_TYPES),
    sourceTest: binding(EXTERNAL_CODEC_SOURCE_TEST), contractTest: binding(EXTERNAL_CODEC_CONTRACT_TEST),
    launcher: binding(EXTERNAL_CODEC_LAUNCHER), launcherTest: binding(EXTERNAL_CODEC_LAUNCHER_TEST),
    portableScanner: binding(PORTABLE_NPM_LOCK), portableScannerTypes: binding(PORTABLE_NPM_LOCK_TYPES), portableScannerTest: binding(PORTABLE_NPM_LOCK_TEST),
    currentCandidateBrowserReceipt: false };
}
function safePath(path) {
  assert(typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !path.includes('\\') && !/[^\S ]|[\x00-\x1f\x7f]/.test(path) && !path.split('/').some(p => !p || p === '.' || p === '..'), `unsafe repository path: ${path}`);
  return path;
}
function inRoot(root, path) { return resolve(root, safePath(path)); }
function safeLink(root, path, target) {
  assert(!isAbsolute(target) && !target.includes('\0'), `unsafe symlink: ${path}`);
  const destination = resolve(dirname(inRoot(root, path)), target);
  const rel = relative(resolve(root), destination);
  assert(rel !== '..' && !rel.startsWith(`..${sep}`), `symlink escapes source root: ${path}`);
  // Existing chained links must not escape either. Dangling in-root links fail closed.
  const realRoot = realpathSync(root), realTarget = realpathSync(destination);
  const realRel = relative(realRoot, realTarget);
  assert(realRel !== '..' && !realRel.startsWith(`..${sep}`), `symlink chain escapes source root: ${path}`);
}
function readEntry(root, path) {
  const absolute = inRoot(root, path), stat = lstatSync(absolute);
  if (stat.isSymbolicLink()) {
    const target = readlinkSync(absolute); safeLink(root, path, target);
    return { path, sha256: sha256(target), mode: '120000', type: 'symlink' };
  }
  assert(stat.isFile(), `non-file input is unsupported: ${path}`);
  const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024), fd = openSync(absolute, 'r');
  try { let n; while ((n = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, n)); }
  finally { closeSync(fd); }
  return { path, sha256: hash.digest('hex'), mode: stat.mode & 0o111 ? '100755' : '100644', type: 'file' };
}
/** Exact build output identity, used only by the remote source phases. */
export function collectBuildProducts(root) {
  const packageRoot = inRoot(root, 'packages');
  const roots = ['dist'];
  for (const entry of readdirSync(packageRoot, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), `symlink in workspace output root: packages/${entry.name}`);
    if (!entry.isDirectory()) continue;
    const path = `packages/${entry.name}/dist`;
    if (statIfPresent(inRoot(root, path))) roots.push(path);
  }
  assert(roots.length > 1, 'workspace build output is missing');
  const products = [], emptyHash = sha256(Buffer.alloc(0));
  let totalBytes = 0;
  const visit = path => {
    assert(!path.split('/').some(part => /^(?:node_modules|\.git|\.npmrc|\.pypirc|\.netrc|\.env(?:\..*)?|credentials?|secrets?)$/i.test(part) || /\.(?:pem|key|p12|pfx)$/i.test(part)), `private or dependency content in build output: ${path}`);
    const absolute = inRoot(root, path), stat = lstatSync(absolute);
    assert(!stat.isSymbolicLink(), `symlink in build output: ${path}`);
    assert(products.length < 1_000_000, 'build output file inventory exceeds its limit');
    const permissions = (stat.mode & 0o777).toString(8).padStart(3, '0');
    if (stat.isDirectory()) {
      products.push({ path, mode: `040${permissions}`, sha256: emptyHash, size: 0 });
      for (const name of readdirSync(absolute).sort()) visit(`${path}/${name}`);
    } else {
      assert(stat.isFile() && Number.isSafeInteger(stat.size) && stat.size >= 0 && stat.size <= 1024 * 1024 * 1024, `invalid build output: ${path}`);
      totalBytes += stat.size; assert(totalBytes <= 8 * 1024 * 1024 * 1024, 'build output exceeds its byte limit');
      products.push({ path, mode: `100${permissions}`, sha256: readEntry(root, path).sha256, size: stat.size });
    }
  };
  for (const path of roots.sort()) {
    const stat = statIfPresent(inRoot(root, path));
    assert(stat?.isDirectory() && !stat.isSymbolicLink(), `build output directory is missing or unsafe: ${path}`);
    visit(path);
  }
  return products.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export const buildProductsDigest = products => sha256(canonicalJson(products));
function walk(root, dir = '') {
  const paths = [];
  for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    // Excluded directories (including host dependencies and build output) are never traversed.
    if (!isSourceInput(path) && !ADMINISTRATIVE_FILES.includes(path) && !ADMINISTRATIVE_FILES.some(p => p.startsWith(`${path}/`))) continue;
    if (entry.isDirectory()) paths.push(...walk(root, path));
    else if (isSourceInput(path) || ADMINISTRATIVE_FILES.includes(path)) paths.push(path);
  }
  return paths.sort();
}
export function assertRequiredPayload(paths, roadmap) {
  const set = new Set(paths);
  for (const path of REQUIRED_FILES) assert(set.has(path), `required staged input missing: ${path}`);
  for (const prefix of REQUIRED_PREFIXES) assert(paths.some(p => p.startsWith(prefix)), `required staged payload missing: ${prefix}`);
  // Every exact file action is a scope requirement. DELETE actions need not exist.
  for (const match of roadmap.matchAll(/^\|\s*(?:CREATE|MODIFY)\s*\|\s*`?([-\w./]+)`?\s*\|/gm)) {
    const path = match[1];
    if (isSourceInput(path)) assert(set.has(path), `planned source input missing: ${path}`);
  }
}
function git(root, ...args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).trim(); }
export function stageSource(root, dest) {
  root = realpathSync(root); dest = resolve(dest);
  assert(!existsSync(dest), `staging destination already exists: ${dest}`);
  const relDest = relative(root, dest); assert(relDest === '..' || relDest.startsWith(`..${sep}`), 'staging destination must be outside source root');
  const stageEntries = git(root, 'ls-files', '--stage', '-z').split('\0').filter(Boolean);
  for (const entry of stageEntries) assert(!entry.startsWith('160000 '), 'gitlink inputs are unsupported');
  const paths = [...new Set(git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean))]
    .filter(p => { if (!isSourceInput(p) && !ADMINISTRATIVE_FILES.includes(p)) return false; try { lstatSync(inRoot(root, p)); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }).sort();
  assertRequiredPayload(paths, readFileSync(join(root, 'docs/prds/aura3d-native-capability-roadmap.md'), 'utf8'));
  for (const path of ADMINISTRATIVE_FILES) assert(paths.includes(path), `administrative snapshot missing: ${path}`);
  const files = paths.filter(isSourceInput).map(p => readEntry(root, p));
  const administrativeFiles = paths.filter(p => ADMINISTRATIVE_FILES.includes(p)).map(p => readEntry(root, p));
  const manifest = {
    schema: MANIFEST_SCHEMA,
    origin: { commit: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}') },
    files, administrativeFiles,
    lockfileSha256: files.find(f => f.path === 'pnpm-lock.yaml')?.sha256,
    inputDigest: computeInputDigest(files)
  };
  manifest.deferredAcceptanceTests = expectedHistoricalAcceptance(manifest, JSON.parse(readFileSync(inRoot(root, HISTORICAL_ACCEPTANCE_INVENTORY), 'utf8')));
  manifest.deferredReplayTests = expectedHistoricalReplay(manifest);
  manifest.deferredExternalCodecTests = expectedExternalCodecAcceptance(manifest);
  mkdirSync(dest, { recursive: true });
  for (const entry of [...files, ...administrativeFiles]) {
    const source = inRoot(root, entry.path), target = inRoot(dest, entry.path);
    mkdirSync(dirname(target), { recursive: true });
    if (entry.type === 'symlink') symlinkSync(readlinkSync(source), target);
    else { copyFileSync(source, target); chmodSync(target, entry.mode === '100755' ? 0o755 : 0o644); }
  }
  writeFileSync(join(dest, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  verifyStagedSource(dest, manifest);
  return manifest;
}
export function verifyStagedSource(root, manifest) {
  assert(manifest?.schema === MANIFEST_SCHEMA && /^[a-f0-9]{40,64}$/.test(manifest.origin?.commit || '') && /^[a-f0-9]{40,64}$/.test(manifest.origin?.tree || ''), 'invalid source manifest provenance');
  assert(Array.isArray(manifest.files) && manifest.files.length > 0 && Array.isArray(manifest.administrativeFiles), 'missing source manifest entries');
  const paths = new Set();
  for (const entry of [...manifest.files, ...manifest.administrativeFiles]) {
    safePath(entry.path); assert(!paths.has(entry.path), `duplicate source manifest path: ${entry.path}`); paths.add(entry.path);
    assert(HASH.test(entry.sha256) && ['100644', '100755', '120000'].includes(entry.mode) && ['file', 'symlink'].includes(entry.type), `invalid source entry: ${entry.path}`);
    assert(canonicalJson(readEntry(root, entry.path)) === canonicalJson(entry), `changed staged input: ${entry.path}`);
  }
  assert(manifest.files.every(f => isSourceInput(f.path)), 'excluded source input in manifest');
  assert(canonicalJson(manifest.administrativeFiles.map(f => f.path).sort()) === canonicalJson([...ADMINISTRATIVE_FILES].sort()), 'administrative snapshot inventory mismatch');
  const observed = walk(root);
  assert(canonicalJson(observed) === canonicalJson([...paths].sort()), 'missing or undeclared staged input');
  assert(manifest.inputDigest === computeInputDigest(manifest.files), 'source input digest mismatch');
  assert(manifest.lockfileSha256 === manifest.files.find(f => f.path === 'pnpm-lock.yaml')?.sha256, 'lockfile digest mismatch');
  const historicalBaseline = JSON.parse(readFileSync(inRoot(root, HISTORICAL_ACCEPTANCE_INVENTORY), 'utf8'));
  assert(canonicalJson(manifest.deferredAcceptanceTests) === canonicalJson(expectedHistoricalAcceptance(manifest, historicalBaseline)), 'historical acceptance inventory mismatch');
  assert(canonicalJson(manifest.deferredReplayTests) === canonicalJson(expectedHistoricalReplay(manifest)), 'historical replay inventory mismatch');
  assert(canonicalJson(manifest.deferredExternalCodecTests) === canonicalJson(expectedExternalCodecAcceptance(manifest)), 'external codec fixture inventory mismatch');
  assertRequiredPayload([...paths], readFileSync(join(root, 'docs/prds/aura3d-native-capability-roadmap.md'), 'utf8'));
  return manifest;
}

// Reject prohibited renderer dependencies before any lockfile install. Inspect both
// workspace dependency fields and all lockfile records (including peers/aliases).
export function assertIndependentLock(root, files) {
  const forbidden = /(?:^|[\s/'":(])(?:@babylonjs\/|@playcanvas\/|@react-three\/|@types\/three(?:@|:|\/|[\s'"])|babylonjs(?:-gltf2interface)?(?:@|:|\/|[\s'"])|playcanvas(?:@|:|\/|[\s'"])|three(?:@|:|\/|[\s'"]))/i;
  const lock = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');
  const lines = lock.split('\n').filter(line => forbidden.test(line));
  assert(lines.length === 0, 'independent frozen lock contains prohibited 3D engine dependencies');
  for (const path of files.filter(f => /(?:^|\/)package\.json$/.test(f.path)).map(f => f.path)) {
    const pkg = JSON.parse(readFileSync(inRoot(root, path), 'utf8'));
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, value] of Object.entries(pkg[field] || {})) {
        assert(!forbidden.test(` ${name}:`) && !forbidden.test(` ${String(value)}`), `prohibited 3D dependency in ${path}`);
      }
    }
  }
}

const SCRIPT_VALUES = Object.freeze({
  typecheck: 'node --max-old-space-size=8192 ./node_modules/typescript/lib/tsc.js -p tsconfig.check.json --noEmit',
  lint: 'eslint .',
  'resolution:check': 'tsx --tsconfig tsconfig.base.json tools/generate-resolution-maps/index.ts --check',
  'check:docs-codeblocks': 'pnpm exec tsx --tsconfig tsconfig.base.json tools/docs-codeblocks/index.ts',
  'verify:api-docs': 'tsx --tsconfig tsconfig.base.json tools/api-docs/index.ts',
  'test:parity': 'vitest run tests/unit/parity --maxWorkers=2',
  'test:unit': 'vitest run tests/unit --maxWorkers=2 --reporter=default --reporter=json --outputFile=tests/reports/unit.json',
  build: 'tsc -p tsconfig.build.json && node --experimental-strip-types tools/finalize-dist/index.ts',
  'test:integration': 'vitest run tests/integration --reporter=default --reporter=json --outputFile=tests/reports/integration.json',
  'verify:exports': 'node --experimental-strip-types tools/verify-exports/index.ts',
  'verify:imports': 'node --experimental-strip-types tools/verify-imports/index.ts',
  'check:tarballs': 'pnpm exec tsx --tsconfig tsconfig.base.json tools/package-tarball-audit/index.ts',
  'check:bundle-size': 'pnpm exec tsx --tsconfig tsconfig.base.json tools/bundle-size/index.ts'
});
export function assertSourceScripts(scripts) {
  for (const name of [...Object.keys(SCRIPT_VALUES), 'test:packages', 'test:packages:dist']) {
    for (const hook of [`pre${name}`, `post${name}`]) {
      assert(!Object.hasOwn(scripts, hook), `source script lifecycle hook is not allowed: ${hook}`);
    }
  }
  for (const [name, expected] of Object.entries(SCRIPT_VALUES)) assert(scripts[name] === expected, `source script ${name} changed; review and update its allowlist before execution`);
  const prefix = 'pnpm exec tsx --tsconfig tsconfig.base.json --test ';
  assert(scripts['test:packages']?.startsWith(prefix), 'unsafe test:packages script');
  const files = scripts['test:packages'].slice(prefix.length).split(' ');
  assert(files.length > 0 && files.every(p => /^packages\/[\w-]+\/tests\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/.test(p)), 'unsafe package test inventory');
  assert(scripts['test:packages:dist'] === `node --import tsx --test ${files.join(' ')}`, 'unsafe package dist test script');
  return files;
}
const CHECK_PREFIXES = Object.freeze({
  typecheck: ['pnpm', 'typecheck'], lint: ['pnpm', 'lint'], resolution: ['pnpm', 'resolution:check'],
  'docs-codeblocks': ['pnpm', 'check:docs-codeblocks'], 'api-docs': ['pnpm', 'verify:api-docs'],
  'agent-docs': ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', 'tools/agent-docs/index.ts'],
  parity: ['pnpm', 'test:parity'], unit: ['pnpm', 'test:unit'],
  'unit-dist': ['pnpm', 'exec', 'vitest', 'run', ...BUILT_UNIT_TESTS],
  'unit-packed': ['pnpm', 'exec', 'vitest', 'run', ...PACKED_UNIT_TESTS],
  'assets-qr': ['pnpm', 'exec', 'vitest', 'run', 'tests/assets', 'tests/qr'],
  packages: ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', '--test', '--test-reporter=tap'], 'node-release': ['node', '--test', '--test-reporter=tap'],
  build: ['pnpm', 'build'], 'resume-rebuild': ['pnpm', 'build'], pack: ['node', 'tools/release/publish-all.mjs', '--pack-only', '--out-plan'],
  'api-baseline': ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', 'tools/public-surface-diff/prepare-baseline.ts'],
  integration: ['pnpm', 'test:integration'], 'packages-dist': ['node', '--import', 'tsx', '--test', '--test-reporter=tap'],
  'browser-tests-typecheck': ['pnpm', 'exec', 'tsc', '-p', 'tsconfig.browser-tests.json', '--noEmit'],
  'verify-exports': ['pnpm', 'verify:exports'], 'verify-imports': ['pnpm', 'verify:imports'], tarballs: ['pnpm', 'check:tarballs'],
  'clean-install-source': ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', 'tools/package-clean-install/index.ts'],
  'installed-tree-shaking': ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', 'tools/installed-tree-shaking/index.ts'],
  'bundle-size': ['pnpm', 'check:bundle-size'], 'api-diff': ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', 'tools/public-surface-diff/index.ts'],
  'public-api': ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', 'tools/public-api-contract/index.ts'],
  'consumer-matrix-source': ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', 'tools/native-consumer-matrix/index.ts'],
  'examples-source': ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', 'tools/agent-examples/index.ts'],
  'runtime-audit-source': ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', 'tools/native-runtime-audit/index.ts']
});
export function validateSourceArgv(id, argv) {
  assert(EXPECTED_CHECK_IDS.includes(id), `unknown source check: ${id}`);
  assert(Array.isArray(argv) && argv.length > 0 && argv.every(x => typeof x === 'string' && x.length > 0 && !/[\0\r\n]/.test(x)), 'invalid source argv');
  const prefix = CHECK_PREFIXES[id];
  assert(prefix && prefix.every((part, index) => argv[index] === part), 'command is not on the source allowlist');
  assert(!argv.some(x => /(?:^|\/)(?:playwright|puppeteer|chromium|firefox|webkit|xvfb|webdriver)(?:$|[\/:.=-])/i.test(x) || /^(?:--headed|--project(?:=|$)|--phase=(?:browser|acceptance))/i.test(x)), 'browser or acceptance argv is forbidden in source phase');
  // No caller-controlled command suffixes. Variables are restricted to output paths,
  // release kinds, run IDs and enumerated test paths; no shell ever interprets them.
  const tail = argv.slice(prefix.length);
  const run = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
  const report = /^tests\/reports\/native-capabilities\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\/(?:candidate-plan|baseline-manifest|api-diff)\.json$/;
  const candidatePlan = /^tests\/reports\/native-capabilities\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\/candidate-plan\.json$/;
  const packageTest = /^packages\/[\w-]+\/tests\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/;
  const releaseTest = /^tools\/release\/[\w.-]+\.test\.mjs$/;
  const exact = (...patterns) => tail.length === patterns.length && patterns.every((pattern, index) => typeof pattern === 'string' ? tail[index] === pattern : pattern.test(tail[index]));
  const valid = {
    typecheck: () => exact(), lint: () => exact(), resolution: () => exact(), 'docs-codeblocks': () => exact(), 'api-docs': () => exact(), 'agent-docs': () => exact(), unit: () => exact(...UNIT_EXCLUDES), build: () => exact(), 'resume-rebuild': () => exact(),
    parity: () => exact('--reporter=json', /^--outputFile=tests\/reports\/native-capabilities\/[\w-]+\/parity\.json$/),
    'unit-dist': () => exact('--reporter=json', /^--outputFile=tests\/reports\/native-capabilities\/[\w-]+\/unit-dist\.json$/),
    'unit-packed': () => exact('--reporter=json', /^--outputFile=tests\/reports\/native-capabilities\/[\w-]+\/unit-packed\.json$/),
    'assets-qr': () => exact('--reporter=json', /^--outputFile=tests\/reports\/native-capabilities\/[\w-]+\/assets-qr\.json$/),
    packages: () => exact(packageTest), 'packages-dist': () => exact(packageTest), 'node-release': () => exact(releaseTest),
    pack: () => exact(report), 'api-baseline': () => exact('--candidate-plan', report, '--out', report),
    integration: () => exact(), 'browser-tests-typecheck': () => exact(), 'verify-exports': () => exact(), 'verify-imports': () => exact(), tarballs: () => exact(),
    'clean-install-source': () => exact('--phase', 'source', '--run-id', run, '--candidate-plan', candidatePlan),
    'installed-tree-shaking': () => exact('--source-report', /^tests\/reports\/native-consumers\/[\w-]+\/source\.json$/, '--candidate-plan', candidatePlan),
    'bundle-size': () => exact(),
    'api-diff': () => exact('--baseline-manifest', report, '--candidate-plan', report, '--release-kind', /^(?:patch|minor|major)$/, '--out', report),
    'public-api': () => exact('--candidate-plan', report),
    'consumer-matrix-source': () => exact('--phase', 'source', '--run-id', run),
    'examples-source': () => exact('--phase', 'source', '--run-id', run, '--candidate-plan', report),
    'runtime-audit-source': () => exact('--phase', 'source')
  };
  assert(valid[id]?.(), 'source argv does not match its exact allowlisted shape');
}
export function buildSteps(runId, reportDir, releaseKind = 'patch', inventory) {
  assert(ID.test(runId) && ['patch', 'minor', 'major'].includes(releaseKind), 'invalid source run ID or release kind'); safePath(reportDir);
  assert(reportDir === `tests/reports/native-capabilities/${runId}`, 'source report directory must match run ID');
  const tsx = (file, ...args) => ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', file, ...args];
  const candidate = `${reportDir}/candidate-plan.json`, baseline = `${reportDir}/baseline-manifest.json`;
  const steps = [
    ['typecheck', ['pnpm', 'typecheck']], ['lint', ['pnpm', 'lint']], ['resolution', ['pnpm', 'resolution:check']],
    ['parity', ['pnpm', 'test:parity', '--reporter=json', `--outputFile=${reportDir}/parity.json`]],
    ['unit', ['pnpm', 'test:unit', ...UNIT_EXCLUDES]], ['assets-qr', ['pnpm', 'exec', 'vitest', 'run', 'tests/assets', 'tests/qr', '--reporter=json', `--outputFile=${reportDir}/assets-qr.json`]],
    ['packages', null], ['node-release', null], ['build', ['pnpm', 'build']],
    ['unit-dist', ['pnpm', 'exec', 'vitest', 'run', ...BUILT_UNIT_TESTS, '--reporter=json', `--outputFile=${reportDir}/unit-dist.json`]],
    ['pack', ['node', 'tools/release/publish-all.mjs', '--pack-only', '--out-plan', candidate]],
    ['resume-rebuild', ['pnpm', 'build']],
    ['unit-packed', ['pnpm', 'exec', 'vitest', 'run', ...PACKED_UNIT_TESTS, '--reporter=json', `--outputFile=${reportDir}/unit-packed.json`]],
    ['api-baseline', tsx('tools/public-surface-diff/prepare-baseline.ts', '--candidate-plan', candidate, '--out', baseline)],
    ['docs-codeblocks', ['pnpm', 'check:docs-codeblocks']], ['api-docs', ['pnpm', 'verify:api-docs']], ['agent-docs', tsx('tools/agent-docs/index.ts')],
    ['integration', ['pnpm', 'test:integration']], ['packages-dist', null],
    ['browser-tests-typecheck', ['pnpm', 'exec', 'tsc', '-p', 'tsconfig.browser-tests.json', '--noEmit']],
    ['verify-exports', ['pnpm', 'verify:exports']], ['verify-imports', ['pnpm', 'verify:imports']], ['tarballs', ['pnpm', 'check:tarballs']],
    ['clean-install-source', tsx('tools/package-clean-install/index.ts', '--phase', 'source', '--run-id', runId, '--candidate-plan', candidate)],
    ['installed-tree-shaking', tsx('tools/installed-tree-shaking/index.ts', '--source-report', `tests/reports/native-consumers/${runId}/source.json`, '--candidate-plan', candidate)],
    ['bundle-size', ['pnpm', 'check:bundle-size']],
    ['api-diff', tsx('tools/public-surface-diff/index.ts', '--baseline-manifest', baseline, '--candidate-plan', candidate, '--release-kind', releaseKind, '--out', `${reportDir}/api-diff.json`)],
    ['public-api', tsx('tools/public-api-contract/index.ts', '--candidate-plan', candidate)],
    ['consumer-matrix-source', tsx('tools/native-consumer-matrix/index.ts', '--phase', 'source', '--run-id', runId)],
    ['examples-source', tsx('tools/agent-examples/index.ts', '--phase', 'source', '--run-id', runId, '--candidate-plan', candidate)],
    ['runtime-audit-source', tsx('tools/native-runtime-audit/index.ts', '--phase', 'source')]
  ].map(([id, argv]) => ({ id, argv }));
  for (const step of steps) if (step.argv) validateSourceArgv(step.id, step.argv);
  assert(canonicalJson(steps.map(s => s.id)) === canonicalJson(EXPECTED_CHECK_IDS), 'source check inventory mismatch');
  if (inventory !== undefined) {
    assertNativeSourceInventoryReady(inventory);
    assert(inventory.runId === runId, 'source inventory run ID mismatch');
    const supplemental = inventory.supplementalChecks.map(check => {
      validateSupplementalCheck(check, runId);
      assert(!EXPECTED_CHECK_IDS.includes(check.id), `supplemental check collides with source matrix: ${check.id}`);
      return { id: check.id, argv: null, runner: check.runner, cwd: check.cwd };
    });
    assert(new Set(supplemental.map(check => check.id)).size === supplemental.length, 'duplicate supplemental checks');
    steps.splice(steps.findIndex(step => step.id === 'build'), 0, ...supplemental);
  }
  return steps;
}
function observeVitestInventory(report, expectedFiles, root, cwd = '.') {
  assert(Array.isArray(report?.testResults), 'missing Vitest test results');
  const discoveredFiles = report.testResults.map(r => {
    assert(typeof r.name === 'string' && r.name.length > 0 && !r.name.includes('\0'), 'invalid Vitest result path');
    const name = r.name.replaceAll('\\', '/');
    const path = isAbsolute(r.name) ? relative(root, r.name).replaceAll('\\', '/')
      : expectedFiles.includes(name) || cwd === '.' ? name : posix.join(cwd, name);
    return path;
  }).sort();
  assert(report.testResults.every(r => Array.isArray(r.assertionResults) && r.assertionResults.length > 0), 'Vitest file has no executed tests');
  const assertions = report.testResults.flatMap(r => r.assertionResults || []);
  const passedCount = assertions.filter(t => t.status === 'passed').length;
  const failedCount = assertions.filter(t => t.status === 'failed').length;
  const skippedCount = assertions.length - passedCount - failedCount;
  return { expectedFiles: [...expectedFiles].sort(), discoveredFiles, testCount: assertions.length, passedCount, failedCount, skippedCount, testNames: assertions.map(t => t.fullName || t.title) };
}
export function parseVitestInventory(report, expectedFiles, root, cwd = '.') {
  const observed = observeVitestInventory(report, expectedFiles, root, cwd);
  const { discoveredFiles, testCount, passedCount, failedCount, skippedCount } = observed;
  assert(new Set(discoveredFiles).size === discoveredFiles.length && canonicalJson(discoveredFiles) === canonicalJson([...expectedFiles].sort()), 'Vitest discovered file inventory mismatch');
  assert(testCount > 0 && passedCount === testCount && !failedCount && !skippedCount && report.success === true && report.numTotalTests === testCount, 'Vitest skipped, failed or missing tests');
  return observed;
}
export function parseTap(text) {
  const value = name => {
    const matches = [...text.matchAll(new RegExp(`^# ${name} (\\d+)\\r?$`, 'gm'))];
    return matches.length === 1 ? Number(matches[0][1]) : null;
  };
  const testCount = value('tests'), passedCount = value('pass'), failedCount = value('fail'), skipped = value('skipped'), todo = value('todo'), cancelled = value('cancelled');
  assert(/^TAP version 13\r?$/m.test(text) && /^\s*ok \d+(?:\s|$)/m.test(text) && !/^\s*not ok \d+(?:\s|$)/m.test(text)
    && Number.isSafeInteger(testCount) && testCount > 0 && passedCount === testCount && failedCount === 0 && skipped === 0 && todo === 0 && cancelled === 0, 'Node test output missing, failed or skipped tests');
  return { testCount, passedCount, failedCount, skippedCount: skipped + todo + cancelled, testNames: [...text.matchAll(/^# Subtest: (.+)$/gm)].map(m => m[1]) };
}
function selectedFiles(files, id) {
  const paths = files.map(f => f.path);
  if (id === 'unit') return paths.filter(p => /^tests\/unit\/.*\.test\.ts$/.test(p) && !DEFERRED_UNIT_TESTS.includes(p)).sort();
  if (id === 'unit-dist') return paths.filter(p => BUILT_UNIT_TESTS.includes(p)).sort();
  if (id === 'unit-packed') return paths.filter(p => PACKED_UNIT_TESTS.includes(p)).sort();
  const match = { parity: /^tests\/unit\/parity\/.*\.test\.ts$/, unit: /^tests\/unit\/.*\.test\.ts$/, 'assets-qr': /^tests\/(?:assets|qr)\/.*\.test\.ts$/, integration: /^tests\/integration\/.*\.test\.ts$/, 'node-release': /^tools\/release\/[^/]+\.test\.mjs$/, packages: /^packages\/[^/]+\/tests\/.*\.test\.ts$/ }[id];
  return match ? paths.filter(p => match.test(p)).sort() : [];
}
/** @returns {Record<string, string[]>} */
export function expectedTestFiles(manifest) {
  const selected = {};
  for (const id of ['parity', 'unit', 'unit-dist', 'unit-packed', 'assets-qr', 'integration', 'packages', 'node-release']) selected[id] = selectedFiles(manifest.files, id);
  selected['packages-dist'] = [...selected.packages];
  return selected;
}
export function validateSupplementalCheck(check, runId) {
  assert(ID.test(runId || '') && check && typeof check === 'object', 'invalid supplemental check identity');
  const policy = SUPPLEMENTAL_POLICY[check.id];
  assert(policy && check.runner === policy.runner && check.cwd === policy.cwd, `supplemental check is not allowlisted: ${check.id}`);
  const files = check.expectedFiles;
  assert(Array.isArray(files) && files.length > 0 && new Set(files).size === files.length
    && canonicalJson(files) === canonicalJson([...files].sort()), `invalid supplemental file inventory: ${check.id}`);
  assert(files.every(path => typeof path === 'string' && !path.includes('\\') && !/[\x00-\x1f\x7f]/.test(path)
    && path.split('/').every(part => part && part !== '.' && part !== '..')
    && (policy.pattern?.test(path) || policy.files?.includes(path))), `supplemental file is not allowlisted: ${check.id}`);
  assert(check.execution === 'remote-only' && check.status === 'not-run'
    && Array.isArray(check.prerequisitePaths) && Array.isArray(check.missingPrerequisitePaths)
    && check.missingPrerequisitePaths.length === 0, `supplemental plan is not ready: ${check.id}`);
  const reportDir = `tests/reports/native-capabilities/${runId}`;
  const expected = policy.runner === 'vitest'
    ? [{ argv: ['pnpm', 'exec', 'vitest', 'run', '--config', policy.config, '--maxWorkers=1', '--reporter=json',
      `--outputFile=${posix.relative(policy.cwd, `${reportDir}/${check.id}.json`)}`,
      ...files.map(path => posix.relative(policy.cwd, path))] }]
    : files.map(file => ({ file, argv: policy.runner === 'shell'
      ? ['bash', file] : ['node', '--test', '--test-reporter=tap', '--test-concurrency=1', file] }));
  assert(canonicalJson(check.invocations) === canonicalJson(expected), `supplemental command is not on the fixed allowlist: ${check.id}`);
  return check;
}
export function nativeSourceInventoryForManifest(manifest, runId) {
  assert(manifest?.files?.some(entry => entry.path === 'tools/native-source-inventory/index.mjs'
    && entry.type === 'file' && HASH.test(entry.sha256 || '')), 'source inventory implementation is not a staged source input');
  const inventory = createNativeSourceInventory({ manifest, expectedTestFiles: expectedTestFiles(manifest), runId });
  assertNativeSourceInventoryReady(inventory);
  const staged = new Map(manifest.files.map(entry => [entry.path, entry]));
  for (const entry of inventory.entries) if (entry.classification === 'source') {
    assert(staged.get(entry.path)?.type === 'file', `source test is not a staged regular file: ${entry.path}`);
  }
  for (const check of inventory.supplementalChecks) {
    validateSupplementalCheck(check, runId);
    for (const path of check.prerequisitePaths) {
      assert(staged.get(path)?.type === 'file', `supplemental prerequisite is not a staged regular file: ${path}`);
    }
  }
  return inventory;
}
export function sourceTestFileCoverage(inventory, testInventories) {
  assertNativeSourceInventoryReady(inventory);
  assert(Array.isArray(testInventories), 'missing observed test inventories');
  const expected = {};
  for (const item of [...inventory.matrix, ...inventory.supplementalChecks]) {
    assert(typeof item.id === 'string' && !Object.hasOwn(expected, item.id), 'duplicate source test check');
    expected[item.id] = [...item.expectedFiles];
  }
  const observed = new Map();
  for (const item of testInventories) {
    assert(item && Object.hasOwn(expected, item.checkId) && !observed.has(item.checkId)
      && Array.isArray(item.discoveredFiles) && item.discoveredFiles.every(path => typeof path === 'string'), 'invalid observed test inventory');
    observed.set(item.checkId, [...item.discoveredFiles].sort());
  }
  const executed = Object.fromEntries(Object.keys(expected).map(id => [id, observed.get(id) || []]));
  return {
    expectedTestFiles: expected,
    executedTestFiles: executed,
    expectedSourceTestFiles: inventory.entries.filter(entry => entry.classification === 'source').map(entry => entry.path).sort(),
    executedSourceTestFiles: [...new Set(Object.values(executed).flat())].sort()
  };
}
export function parseSourceShellResult(text, file) {
  const escaped = posix.basename(file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...text.matchAll(new RegExp(`^${escaped}: ([1-9][0-9]*) cases passed\\r?$`, 'gm'))];
  assert(matches.length === 1 && Number.isSafeInteger(Number(matches[0][1])), `shell test completion marker is missing or invalid: ${file}`);
  return { testCount: 1, passedCount: 1, failedCount: 0, skippedCount: 0, testNames: [file], reportedCases: Number(matches[0][1]) };
}
function verifiedCandidate(root, path, manifest) {
  const expectedDir = `${dirname(path)}/candidate-tarballs/`;
  const planPath = inRoot(root, path), bytes = readFileSync(planPath), plan = JSON.parse(bytes);
  assert(plan.packOnly === true && plan.lockfileSha256 === manifest.lockfileSha256 && Array.isArray(plan.packages) && plan.packages.length > 0 && plan.packages.length === plan.expectedPackageCount, 'candidate plan incomplete or lock mismatch');
  assert(plan.source?.fingerprint === manifest.inputDigest || plan.source?.inputDigest === manifest.inputDigest, 'candidate plan source input mismatch');
  const names = new Set(), archives = [];
  for (const pkg of plan.packages) {
    assert(typeof pkg.name === 'string' && !names.has(pkg.name), 'duplicate candidate package'); names.add(pkg.name);
    const path = safePath(pkg.tarball);
    assert(path.startsWith(expectedDir), `candidate archive is outside the run-specific pack directory: ${path}`);
    const data = readFileSync(inRoot(root, path));
    assert(HASH.test(pkg.sha256) && sha256(data) === pkg.sha256 && pkg.integrity === `sha512-${createHash('sha512').update(data).digest('base64')}`, `candidate archive changed: ${path}`);
    archives.push({ path, sha256: pkg.sha256 });
  }
  return { candidatePlan: { path, sha256: sha256(bytes) }, archives: archives.sort((a,b) => a.path.localeCompare(b.path)) };
}
/** Canonical callbacks shared with the stage-one handoff and final gate. */
export function sourceHandoffApi() {
  return { buildSteps, expectedTestFiles, nativeSourceInventoryForManifest, sourceTestFileCoverage, validateSupplementalCheck,
    parseSourceShellResult, parseVitestInventory, parseTap, validateSourceArgv, verifyCandidate: verifiedCandidate };
}
function checkCompletedOutcomes(root) {
  const ledger = JSON.parse(readFileSync(join(root, ADMINISTRATIVE_FILES[0]), 'utf8'));
  assert(ledger.schema === 'aura3d.native-capability-ledger/1' && Array.isArray(ledger.outcomes), 'invalid capability ledger');
  return ledger.outcomes.filter(x => x.required === true && x.source?.status === 'implemented' && x.source?.completion === 'complete').map(x => x.id).sort();
}
export function assertNoAcceptanceProcess(command, args = []) {
  const text = [String(command), ...(Array.isArray(args) ? args.map(String) : [])].join(' ').replaceAll('\\', '/');
  assert(!/(?:^|[\s/\"'])(?:playwright|puppeteer|chromium|chromium-browser|chrome|chrome-headless-shell|firefox|webkit|xvfb|webdriver)(?:$|[\s/\"'.:=_-])/i.test(text)
    && !/(?:^|[\s/\"'=])(?:tests\/(?:browser|visual|acceptance)(?:\/|(?=$|[\s\"'=]))|tools\/remote-acr\/(?:run\.sh|task-run\.sh|run-acceptance5\.sh|acceptance5-evidence\.sh|historical-acceptance\.mjs|external-codec-run\.mjs)(?=$|[\s\"':=;|&]))/i.test(text),
  'source phase refuses browser or acceptance process');
}
function installSourceProcessGuard() {
  for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
    const original = childProcess[name];
    childProcess[name] = function(command, args, ...rest) {
      assertNoAcceptanceProcess(command, args);
      return original.call(this, command, args, ...rest);
    };
  }
  syncBuiltinESMExports();
}
if (process.env.AURA3D_SOURCE_PROCESS_GUARD === '1') installSourceProcessGuard();

function statIfPresent(path) {
  try { return lstatSync(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// The task wrapper opens source-task.log before this process starts. All other
// results must be new, including Vitest's two fixed output paths, so a later
// successful exit cannot accidentally reuse a previous invocation's evidence.
export function assertFreshSourceOutputs(root, runId) {
  assert(ID.test(runId || ''), 'invalid source run ID');
  const reportDir = `tests/reports/native-capabilities/${runId}`;
  const paths = [reportDir, `tests/reports/native-consumers/${runId}`,
    `tests/reports/native-consumer-matrix/${runId}`, `tests/reports/native-examples-catalog/${runId}`,
    'tests/reports/unit.json', 'tests/reports/integration.json'];
  for (const path of paths) {
    let ancestor = resolve(root);
    for (const part of path.split('/').slice(0, -1)) {
      ancestor = join(ancestor, part);
      const stat = statIfPresent(ancestor);
      if (!stat) break;
      assert(stat.isDirectory() && !stat.isSymbolicLink(), `unsafe source output directory: ${path}`);
    }
    const absolute = inRoot(root, path), stat = statIfPresent(absolute);
    if (!stat) continue;
    if (path === reportDir) {
      assert(stat.isDirectory() && !stat.isSymbolicLink(), `source output already exists: ${path}`);
      const entries = readdirSync(absolute);
      assert(entries.every(name => name === 'source-task.log') && entries.every(name => lstatSync(join(absolute, name)).isFile()), `source output already exists: ${path}`);
    } else assert(false, `source output already exists: ${path}`);
  }
}

/** Resume is allowed to see only the already verified prefix and its new log. */
export function assertFreshResumeOutputs(root, runId, retainedFiles) {
  assert(ID.test(runId || '') && Array.isArray(retainedFiles), 'invalid retained source handoff');
  const reportDir = `tests/reports/native-capabilities/${runId}`;
  const expected = new Set(retainedFiles.map(item => item.path));
  const seen = new Set();
  const visit = path => {
    const stat = lstatSync(inRoot(root, path));
    assert(!stat.isSymbolicLink(), `unsafe resume output: ${path}`);
    if (stat.isDirectory()) { for (const name of readdirSync(inRoot(root, path))) visit(`${path}/${name}`); return; }
    assert(stat.isFile() && (expected.has(path) || path === `${reportDir}/source-task-resume.log`), `unexpected resume output: ${path}`);
    if (expected.has(path)) seen.add(path);
  };
  visit(reportDir);
  assert(seen.size === expected.size, 'retained source handoff is incomplete');
  for (const path of [`tests/reports/native-consumers/${runId}`, `tests/reports/native-consumer-matrix/${runId}`,
    `tests/reports/native-examples-catalog/${runId}`, 'tests/reports/unit.json', 'tests/reports/integration.json']) {
    assert(!statIfPresent(inRoot(root, path)), `resume output already exists: ${path}`);
  }
}

// Compare the checked implementation paths with the staged source as well as
// checking the graph. This is still only a byte observation: an untrusted
// already-loaded process or a caller-controlled source manifest is not a root
// of trust and cannot authenticate its own executor.
const WORKSPACE_ADMISSION_IMPLEMENTATIONS = Object.freeze([
  'tools/remote-acr/source-checks.mjs',
  'tools/remote-acr/portable-inputs.mjs',
  'tools/remote-acr/source-resume.mjs',
  'tools/native-source-inventory/index.mjs',
  'tools/release/workspace-pnpm-admission.mjs',
  'tools/release/portable-pnpm-lock.mjs',
  'tools/release/portable-npm-lock.mjs',
  'tools/release/pnpm-installed-tree.mjs',
  'tools/release/admitted-archive-modes.mjs',
  'tools/release/archive-admission.mjs',
  'tools/release/release-inventory.mjs',
  'tools/release/source-identity.mjs'
]);
// Retain the point-in-time implementation identities observed when this
// runner module is loaded. Comparing two current paths alone would miss a
// change made after loading when the runner and staged roots are the same.
// This observation cannot authenticate the already-running Node process.
const WORKSPACE_ADMISSION_LOADED_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WORKSPACE_ADMISSION_LOADED_ENTRIES = WORKSPACE_ADMISSION_IMPLEMENTATIONS.map(path => {
  const entry = readEntry(WORKSPACE_ADMISSION_LOADED_ROOT, path);
  assert(entry.type === 'file', `workspace admission implementation is not a regular file: ${path}`);
  return canonicalJson(entry);
});
function assertStagedAdmissionImplementations(root) {
  for (const [index, path] of WORKSPACE_ADMISSION_IMPLEMENTATIONS.entries()) {
    const loaded = readEntry(WORKSPACE_ADMISSION_LOADED_ROOT, path), staged = readEntry(root, path);
    assert(loaded.type === 'file' && staged.type === 'file'
      && canonicalJson(loaded) === WORKSPACE_ADMISSION_LOADED_ENTRIES[index]
      && canonicalJson(staged) === WORKSPACE_ADMISSION_LOADED_ENTRIES[index],
      `workspace admission implementation differs from staged source: ${path}`);
  }
}

/**
 * Safe pre-install plumbing. The independently pinned workspace policy and
 * its file-level reviews must admit the exact staged graph and archive bytes.
 * A separately signed source approval is checked against the pinned policy
 * before a live opaque capability seeds and rechecks a fresh private native
 * store. This function never starts pnpm, accesses a registry or authorizes an
 * install, and the store must not be transferred as a replacement for the
 * in-process capabilities.
 */
export function prepareWorkspaceDependencyAdmission(input) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 'workspace admission inputs are required');
  const { root, sourceManifestPath, archives, storeDir, approvalBytes } = input;
  assert(Object.keys(input).every(key => ['root', 'sourceManifestPath', 'archives', 'storeDir', 'approvalBytes'].includes(key))
    && sourceManifestPath === MANIFEST_NAME, 'invalid workspace admission inputs');
  assertStagedAdmissionImplementations(root);
  return prepareWorkspacePnpmOfflineStore({ root, sourceManifestPath, archives, storeDir, approvalBytes, allowDeferredWorkspaceBins: true });
}

/** Compare reviewed package-manager bytes, without claiming process custody. */
export function inspectWorkspaceDependencyToolchain(input) {
  assert(input?.sourceManifestPath === MANIFEST_NAME, 'invalid workspace toolchain source manifest');
  assertStagedAdmissionImplementations(input.root);
  return inspectWorkspacePnpmToolchain(input);
}

/** Observe post-use source, store and installed tree; never an execution permit. */
export function inspectWorkspaceDependencyInstallation(input) {
  assert(input?.sourceManifestPath === MANIFEST_NAME, 'invalid workspace observation source manifest');
  assertStagedAdmissionImplementations(input.root);
  return verifyWorkspacePnpmInstalledSnapshot(input);
}

/**
 * A reviewed graph, a native store and point-in-time tree checks are not
 * package-manager custody or enforced isolation. Direct source-runner and
 * image invocation must remain closed until those capabilities exist.
 */
export function assertWorkspaceDependencyAdmission(input) {
  if (!input) throw new Error('WORKSPACE_DEPENDENCY_ADMISSION_UNAVAILABLE: independently reviewed workspace policy, signed source approval and archives, pinned package-manager custody, enforced offline/lifecycle isolation and post-install tree custody are required');
  try {
    assert(input.sourceManifestPath === MANIFEST_NAME, 'invalid workspace admission source manifest');
    assertStagedAdmissionImplementations(input.root);
    assertWorkspacePnpmInstallReady(input);
  }
  catch (error) {
    throw new Error(`WORKSPACE_DEPENDENCY_ADMISSION_UNAVAILABLE: ${error instanceof Error ? error.message : 'invalid workspace admission'}`);
  }
}

/**
 * In-process equivalent of the source runner's workspace gate. Callers may
 * explicitly pass the live capabilities from prepareWorkspaceDependencyAdmission,
 * together with their source root, manifest and private store. The root and
 * manifest are bound to this invocation rather than trusted from the caller.
 * Receipts, JSON copies and capabilities from another process/module are not
 * accepted by the underlying verifier. The no-input path remains
 * unconditionally closed; even a valid live admission is not permission to
 * execute pnpm.
 */
export function assertSourceWorkspaceAdmission(root, input) {
  if (input === undefined) { assertWorkspaceDependencyAdmission(); return; }
  try {
    const allowed = ['root', 'sourceManifestPath', 'capability', 'approvalCapability', 'storeDir', 'toolchainRoot', 'nodePath'];
    const required = ['root', 'sourceManifestPath', 'capability', 'approvalCapability', 'storeDir'];
    assert(input && typeof input === 'object' && !Array.isArray(input)
      && (Object.getPrototypeOf(input) === Object.prototype || Object.getPrototypeOf(input) === null),
    'invalid source workspace admission inputs');
    const keys = Reflect.ownKeys(input), descriptors = Object.getOwnPropertyDescriptors(input);
    assert(keys.every(key => typeof key === 'string' && allowed.includes(key)
      && Object.hasOwn(descriptors[key], 'value'))
      && required.every(key => Object.hasOwn(descriptors, key)),
    'invalid source workspace admission fields');
    const scoped = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
    assert(typeof scoped.root === 'string' && realpathSync(resolve(scoped.root)) === realpathSync(resolve(root))
      && scoped.sourceManifestPath === MANIFEST_NAME, 'workspace admission source root or manifest differs from source job');
    scoped.root = root;
    scoped.sourceManifestPath = MANIFEST_NAME;
    assertWorkspaceDependencyAdmission(scoped);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('WORKSPACE_DEPENDENCY_ADMISSION_UNAVAILABLE:')) throw error;
    throw new Error(`WORKSPACE_DEPENDENCY_ADMISSION_UNAVAILABLE: ${error instanceof Error ? error.message : 'invalid source workspace admission'}`);
  }
}

/** Verify bytes and current archive policy; digest equality alone is not job authentication. */
export function verifySourcePhaseInputs(root, env) {
  const runId = env.NATIVE_RUN_ID, phase = env.NATIVE_SOURCE_PHASE || 'prepare';
  const reportDir = `tests/reports/native-capabilities/${runId}`;
  assert(ID.test(runId || '') && ['prepare', 'resume'].includes(phase)
    && ['patch', 'minor', 'major'].includes(env.NATIVE_RELEASE_KIND || ''), 'invalid source phase environment');
  const manifestBytes = readFileSync(inRoot(root, MANIFEST_NAME));
  const manifest = verifyStagedSource(root, JSON.parse(manifestBytes));
  assertIndependentLock(root, manifest.files);
  const inventory = nativeSourceInventoryForManifest(manifest, runId);
  if (phase === 'prepare') return { phase, manifestBytes, manifest, inventory };
  const handoff = verifySourceBuildHandoff({ root, runId, releaseKind: env.NATIVE_RELEASE_KIND, manifestBytes, manifest,
    expectedReportSha256: env.NATIVE_BUILD_REPORT_SHA256, api: sourceHandoffApi() });
  const retainedReport = handoff.report;
  assert(canonicalJson(retainedReport.completedOutcomeIds) === canonicalJson(checkCompletedOutcomes(root)), 'completed source outcomes changed between phases');
  const portable = verifyPortableInputs({ root, runId, sourceManifestPath: handoff.sourceManifest.path,
    candidatePlanPath: handoff.candidate.candidatePlan.path, inputsPath: `tests/reports/native-source-inputs/${runId}/inputs.json` });
  assert(Array.isArray(portable.consumers) && portable.consumers.length > 0
    && Array.isArray(portable.pnpmConsumers) && portable.pnpmConsumers.length > 0, 'missing portable admission graphs');
  const admission = { root, sourceManifestPath: handoff.sourceManifest.path, planPath: handoff.candidate.candidatePlan.path,
    candidateReviews: portable.candidateReviews };
  verifyArchiveAdmissionBatch({ ...admission, consumers: portable.consumers });
  verifyPnpmArchiveAdmissionBatch({ ...admission, consumers: portable.pnpmConsumers });
  return { phase, manifestBytes, manifest, inventory, handoff, retainedReport, portable };
}

/** Stage the exact retained pack and sidecars into an already staged source. */
export function stageResumeInputs(root, dest, runId, releaseKind, expectedReportSha256) {
  // This cheap configuration check does not admit any package. Full graph and
  // archive inspection is reserved for the remote pre-install preflight.
  assertArchiveAdmissionConfigured({ root: dest });
  const manifestBytes = readFileSync(inRoot(dest, MANIFEST_NAME));
  const manifest = verifyStagedSource(dest, JSON.parse(manifestBytes));
  const handoff = stageSourceBuildHandoff({ root, dest, runId, releaseKind, manifestBytes, manifest,
    expectedReportSha256, api: sourceHandoffApi() });
  assert(canonicalJson(handoff.report.completedOutcomeIds) === canonicalJson(checkCompletedOutcomes(dest)), 'completed source outcomes changed between phases');
  stagePortableInputs({ root, dest, runId, sourceManifestPath: handoff.sourceManifest.path,
    candidatePlanPath: handoff.candidate.candidatePlan.path, inputsPath: `tests/reports/native-source-inputs/${runId}/inputs.json` });
  assertFreshResumeOutputs(dest, runId, handoff.retainedFiles);
}

// A zero exit alone does not prove a producer wrote a passing report for this
// candidate. Check the producer-specific phase and identity before a dependent
// step can consume it; each producer owns its detailed project validation.
export function assertPassingPhaseReport(name, report, runId, candidate, plan) {
  assert(report?.schema === 'aura3d.native-consumers/1' && report.phase === 'source' && report.runId === runId, `invalid ${name} source report identity`);
  const source = plan?.source, reference = candidate?.candidatePlan;
  assert(reference && source && HASH.test(reference.sha256 || ''), `missing candidate for ${name}`);
  const isCandidate = item => item?.path === reference.path && item?.sha256 === reference.sha256;
  const browserCellsPending = cells => Array.isArray(cells) && cells.length > 0 && cells.every(cell => cell.status === 'not-run');
  if (name === 'sourceConsumerReport') {
    assert(report.pass === true && isCandidate(report.candidate) && report.source?.revision === source.commit
      && report.source?.stagedSourceSha256 === source.fingerprint && report.source?.lockfileSha256 === source.lockfileSha256
      && browserCellsPending(report.browser), 'failed or mismatched source consumer report');
  } else if (name === 'matrixSourceReport') {
    assert(report.status === 'pass' && isCandidate(report.candidate) && report.source?.revision === source.commit
      && report.source?.stagedSourceSha256 === (source.inputDigest ?? source.fingerprint) && report.source?.lockfileSha256 === source.lockfileSha256
      && browserCellsPending(report.browser), 'failed or mismatched source matrix report');
  } else if (name === 'examplesSourceReport') {
    assert(report.pass === true && report.candidatePlan === reference.path && report.candidateSha256 === reference.sha256
      && report.stagedSourceSha256 === (source.inputDigest ?? source.fingerprint) && report.lockfileSha256 === source.lockfileSha256
      && report.browser === 'not-run', 'failed or mismatched source examples report');
  } else assert(false, `unknown source phase report: ${name}`);
}

/**
 * Defense in depth only: source children get a small explicit tool environment,
 * never the task's managed-identity, provider or upload credentials. Process,
 * mount, socket and credential custody isolation is still required separately.
 * @returns {Record<string, string>}
 */
export function createSourceChildEnvironment(root, env, reportDir, manifestPath) {
  const match = /^tests\/reports\/native-capabilities\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,79})$/.exec(reportDir);
  assert(match && manifestPath === MANIFEST_NAME, 'invalid source child environment identity');
  const releaseKind = env.NATIVE_RELEASE_KIND || 'patch', phase = env.NATIVE_SOURCE_PHASE || 'prepare';
  assert(['patch', 'minor', 'major'].includes(releaseKind) && ['prepare', 'resume'].includes(phase), 'invalid source child phase');
  const toolEnv = {};
  // Preserve only process-launch, cache and locale settings needed by the
  // installed toolchain. No caller-provided provider, auth, or hook variables.
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM', 'PNPM_HOME', 'COREPACK_HOME', 'XDG_CACHE_HOME']) {
    const value = env[key];
    if (typeof value === 'string' && value.length <= 32768 && !value.includes('\0')) toolEnv[key] = value;
  }
  if (typeof env.SOURCE_DATE_EPOCH === 'string' && /^\d{1,16}$/.test(env.SOURCE_DATE_EPOCH)) toolEnv.SOURCE_DATE_EPOCH = env.SOURCE_DATE_EPOCH;
  return { ...toolEnv, CI: '1', NATIVE_RUN_ID: match[1], NATIVE_REPORT_DIR: reportDir, NATIVE_RELEASE_KIND: releaseKind, NATIVE_SOURCE_PHASE: phase,
    COREPACK_ENABLE_NETWORK: '0', PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1', PLAYWRIGHT_BROWSERS_PATH: '/nonexistent/aura3d-browsers-disabled',
    PUPPETEER_SKIP_DOWNLOAD: '1', PUPPETEER_EXECUTABLE_PATH: '/nonexistent/aura3d-browser-disabled', DISPLAY: '',
    A3D_REQUIRE_GLSLANG: '1', A3D_REQUIRE_NAGA: '1', A3D_GLSL_REPORT_EXCLUDED: '1', AURA3D_RUN_NETWORK_ASSET_TESTS: '0',
    A3D_RELEASE_PACK_DIR: `${reportDir}/candidate-tarballs`,
    NODE_OPTIONS: `--import=${pathToFileURL(resolve(root, 'tools/remote-acr/source-checks.mjs')).href}`,
    AURA3D_SOURCE_PROCESS_GUARD: '1', AURA3D_SOURCE_MANIFEST: manifestPath };
}

function supplementalCwd(root, cwd) {
  let current = realpathSync(root);
  for (const part of cwd === '.' ? [] : cwd.split('/')) {
    assert(part && part !== '.' && part !== '..', 'unsafe supplemental working directory');
    current = join(current, part);
    const stat = lstatSync(current);
    assert(stat.isDirectory() && !stat.isSymbolicLink(), 'unsafe supplemental working directory');
  }
  assert(realpathSync(current) === current, 'supplemental working directory escapes source root');
  return current;
}
function observeTap(text) {
  const value = name => {
    const matches = [...text.matchAll(new RegExp(`^# ${name} (\\d+)\\r?$`, 'gm'))];
    return matches.length === 1 ? Number(matches[0][1]) : null;
  };
  const testCount = value('tests'), passedCount = value('pass'), failedCount = value('fail');
  const skipped = value('skipped'), todo = value('todo'), cancelled = value('cancelled');
  assert(/^TAP version 13\r?$/m.test(text)
    && [testCount, passedCount, failedCount, skipped, todo, cancelled].every(Number.isSafeInteger)
    && testCount > 0, 'Node test output has no observed test inventory');
  return { testCount, passedCount, failedCount, skippedCount: skipped + todo + cancelled,
    testNames: [...text.matchAll(/^# Subtest: (.+)$/gm)].map(match => match[1]) };
}
function runSupplementalCheck(root, runId, check, childEnv, absLog) {
  validateSupplementalCheck(check, runId);
  const cwd = supplementalCwd(root, check.cwd);
  const reportDir = `tests/reports/native-capabilities/${runId}`;
  const resultDir = `${reportDir}/results/${check.id}`;
  mkdirSync(inRoot(root, resultDir), { recursive: true });
  writeFileSync(absLog, '', { flag: 'wx' });
  const subruns = [], errors = [], discoveredFiles = [], testNames = [];
  const counts = { testCount: 0, passedCount: 0, failedCount: 0, skippedCount: 0 };
  let vitestInventory = null;
  for (const [index, invocation] of check.invocations.entries()) {
    let result;
    try {
      result = spawnSync(invocation.argv[0], invocation.argv.slice(1), { cwd, env: childEnv, maxBuffer: 64 * 1024 * 1024 });
    } catch (error) {
      result = { status: null, signal: null, error };
    }
    const output = Buffer.concat([result.stdout || Buffer.alloc(0), result.stderr || Buffer.alloc(0)]);
    const path = `${resultDir}/${index}.${check.runner === 'node-test' ? 'tap' : 'log'}`;
    writeFileSync(inRoot(root, path), output, { flag: 'wx' });
    writeFileSync(absLog, `\n--- ${invocation.file || check.id} ---\n`, { flag: 'a' });
    writeFileSync(absLog, output, { flag: 'a' });
    const subrun = { file: invocation.file || null, argv: invocation.argv, cwd: check.cwd,
      exitCode: result.status, signal: result.signal || null, error: result.error ? String(result.error.message || result.error) : null,
      result: { path, sha256: sha256(output) } };
    if (check.runner === 'vitest') {
      const reportPath = `${reportDir}/${check.id}.json`;
      if (existsSync(inRoot(root, reportPath))) {
        const data = readFileSync(inRoot(root, reportPath));
        subrun.testResult = { path: reportPath, sha256: sha256(data) };
        try {
          const raw = JSON.parse(data.toString('utf8'));
          const observed = observeVitestInventory(raw, check.expectedFiles, resolve(root), check.cwd);
          vitestInventory = { checkId: check.id, runner: check.runner, result: subrun.testResult,
            sourceRoot: resolve(root), cwd: check.cwd, ...observed };
          parseVitestInventory(raw, check.expectedFiles, resolve(root), check.cwd);
        } catch (error) { errors.push(`${check.id}: ${error.message}`); }
      } else errors.push(`${check.id}: Vitest result is missing`);
    } else {
      try {
        const stats = check.runner === 'node-test'
          ? (result.status === 0 ? parseTap(output.toString('utf8')) : observeTap(output.toString('utf8')))
          : parseSourceShellResult(output.toString('utf8'), invocation.file);
        for (const key of Object.keys(counts)) counts[key] += stats[key];
        discoveredFiles.push(invocation.file);
        testNames.push(...stats.testNames);
        if (check.runner === 'shell') subrun.reportedCases = stats.reportedCases;
      } catch (error) { errors.push(`${invocation.file}: ${error.message}`); }
    }
    subruns.push(subrun);
    if (result.status !== 0 || result.error || result.signal) errors.push(`${invocation.file || check.id}: process exited ${result.status}${result.signal ? ` (${result.signal})` : ''}`);
  }
  const inventory = check.runner === 'vitest'
    ? vitestInventory || { checkId: check.id, runner: check.runner, cwd: check.cwd, expectedFiles: [...check.expectedFiles],
      discoveredFiles: [], testCount: 0, passedCount: 0, failedCount: 0, skippedCount: 0, testNames: [], observation: 'unavailable' }
    : { checkId: check.id, runner: check.runner, cwd: check.cwd, expectedFiles: [...check.expectedFiles], discoveredFiles,
      ...counts, testNames, ...(check.runner === 'shell' ? { countKind: 'file-invocations' } : {}) };
  return { subruns, inventory, error: errors.join('; '), started: subruns.some(run => run.exitCode !== null || run.signal) };
}

/** The optional admission must contain live capabilities from this process. */
export function runSource(root, env = process.env, workspaceAdmission) {
  const runId = env.NATIVE_RUN_ID, reportDir = env.NATIVE_REPORT_DIR, manifestPath = env.AURA3D_SOURCE_MANIFEST;
  assert(ID.test(runId || '') && reportDir === `tests/reports/native-capabilities/${runId}` && manifestPath === MANIFEST_NAME, 'invalid source job environment');
  assert(['patch', 'minor', 'major'].includes(env.NATIVE_RELEASE_KIND || ''), 'invalid release kind');
  const phase = env.NATIVE_SOURCE_PHASE || 'prepare';
  if (phase === 'prepare') assertFreshSourceOutputs(root, runId);
  // Direct invocation must not bypass the launcher/image workspace gate.
  assertSourceWorkspaceAdmission(root, workspaceAdmission);
  const verified = verifySourcePhaseInputs(root, env);
  const { manifestBytes: bytes, manifest, inventory } = verified;
  if (phase === 'resume') assertFreshResumeOutputs(root, runId, verified.handoff.retainedFiles);
  const completedOutcomeIds = checkCompletedOutcomes(root);
  const packageFiles = assertSourceScripts(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts);
  const available = new Set(manifest.files.map(f => f.path));
  assert(packageFiles.every(p => available.has(p)) && canonicalJson([...packageFiles].sort()) === canonicalJson(expectedTestFiles(manifest).packages), 'package script does not select every staged package test');
  const allSteps = buildSteps(runId, reportDir, env.NATIVE_RELEASE_KIND, inventory), packIndex = allSteps.findIndex(step => step.id === 'pack');
  assert(packIndex >= 0 && allSteps[packIndex + 1]?.id === 'resume-rebuild', 'invalid source phase boundary');
  const steps = phase === 'prepare' ? allSteps.slice(0, packIndex + 1) : allSteps.slice(packIndex + 1);
  const checks = phase === 'prepare' ? [] : [...verified.retainedReport.checks];
  const testInventories = phase === 'prepare' ? [] : [...verified.retainedReport.testInventories];
  mkdirSync(inRoot(root, `${reportDir}/logs`), { recursive: true });
  let sourceInventory;
  if (phase === 'prepare') {
    writeFileSync(inRoot(root, `${reportDir}/source-manifest.json`), bytes, { flag: 'wx' });
    const path = `${reportDir}/source-inventory.json`, data = Buffer.from(`${JSON.stringify(inventory, null, 2)}\n`);
    writeFileSync(inRoot(root, path), data, { flag: 'wx' });
    sourceInventory = { path, sha256: sha256(data) };
  } else sourceInventory = verified.handoff.sourceInventory;
  const childEnv = createSourceChildEnvironment(root, env, reportDir, manifestPath);
  let blocked = false, candidate = phase === 'prepare' ? null : verified.handoff.candidate, buildProducts = null, resumeRebuild = null;
  if (phase === 'resume') {
    childEnv.A3D_RELEASE_PLAN = candidate.candidatePlan.path;
    childEnv.NATIVE_CONSUMER_BUNDLE_INPUT = verified.portable.consumerBundle.path;
    childEnv.NATIVE_EXAMPLE_LOCK_INPUT = verified.portable.exampleBundle.path;
    childEnv.NATIVE_MATRIX_BUNDLE_INPUT = verified.portable.matrixBundle.path;
    childEnv.AURA3D_CANDIDATE_REVIEWS_JSON = JSON.stringify(verified.portable.candidateReviews);
  }
  for (const { id, argv, runner, cwd } of steps) {
    const log = `${reportDir}/logs/${id}.log`, absLog = inRoot(root, log);
    const supplemental = inventory.supplementalChecks.find(check => check.id === id);
    let exitCode = null, error = '', subruns = [], started = false;
    if (blocked && !supplemental) { writeFileSync(absLog, 'Not run because an earlier required source check failed.\n'); }
    else {
      try {
        if (candidate) {
          const next = verifiedCandidate(root, `${reportDir}/candidate-plan.json`, manifest);
          assert(canonicalJson(next) === canonicalJson(candidate), 'candidate plan or archive changed after pack');
        }
        if (supplemental) {
          const observed = runSupplementalCheck(root, runId, supplemental, childEnv, absLog);
          subruns = observed.subruns; started = observed.started;
          testInventories.push(observed.inventory);
          exitCode = observed.error ? 1 : 0;
          assert(!observed.error, observed.error);
        } else if (['packages', 'packages-dist', 'node-release'].includes(id)) {
          const expectedFiles = id === 'node-release' ? selectedFiles(manifest.files, id) : [...packageFiles].sort();
          assert(expectedFiles.length > 0, `${id} test inventory is empty`);
          let count = { testCount: 0, passedCount: 0, failedCount: 0, skippedCount: 0 }; const discoveredFiles = [], testNames = [];
          writeFileSync(absLog, '');
          const resultDir = `${reportDir}/results/${id}`;
          mkdirSync(inRoot(root, resultDir), { recursive: true });
          for (const [index, file] of expectedFiles.entries()) {
            const command = id === 'packages' ? ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', '--test', '--test-reporter=tap', file] : id === 'packages-dist' ? ['node', '--import', 'tsx', '--test', '--test-reporter=tap', file] : ['node', '--test', '--test-reporter=tap', file];
            validateSourceArgv(id, command);
            const result = spawnSync(command[0], command.slice(1), { cwd: root, env: childEnv, maxBuffer: 64 * 1024 * 1024 });
            started ||= result.status !== null || Boolean(result.signal);
            const output = Buffer.concat([result.stdout || Buffer.alloc(0), result.stderr || Buffer.alloc(0)]);
            writeFileSync(absLog, `\n--- ${file} ---\n`, { flag: 'a' });
            writeFileSync(absLog, output, { flag: 'a' });
            const path = `${resultDir}/${index}.tap`;
            writeFileSync(inRoot(root, path), output);
            subruns.push({ file, argv: command, exitCode: result.status, result: { path, sha256: sha256(output) } });
            assert(result.status === 0 && !result.error, `${id}: ${file} exited ${result.status}`);
            const stats = parseTap(output.toString('utf8')); for (const key of Object.keys(count)) count[key] += stats[key]; discoveredFiles.push(file); testNames.push(...stats.testNames);
          }
          testInventories.push({ checkId: id, expectedFiles, discoveredFiles, ...count, testNames }); exitCode = 0;
        } else {
          validateSourceArgv(id, argv);
          const result = spawnSync(argv[0], argv.slice(1), { cwd: root, env: childEnv, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
          started = result.status !== null || Boolean(result.signal);
          writeFileSync(absLog, `${result.stdout || ''}${result.stderr || ''}`);
          exitCode = result.status; assert(exitCode === 0 && !result.error, `${id} exited ${exitCode}: ${result.error?.message || result.signal || ''}`);
          if (['parity', 'unit', 'unit-dist', 'unit-packed', 'assets-qr', 'integration'].includes(id)) {
            const report = id === 'unit' ? 'tests/reports/unit.json' : id === 'integration' ? 'tests/reports/integration.json' : `${reportDir}/${id}.json`;
            const expected = selectedFiles(manifest.files, id); assert(expected.length > 0, `${id} test inventory is empty`);
            const reportBytes = readFileSync(inRoot(root, report));
            const retained = `${reportDir}/${id}.json`;
            if (report !== retained) writeFileSync(inRoot(root, retained), reportBytes);
            testInventories.push({ checkId: id, result: { path: retained, sha256: sha256(reportBytes) }, sourceRoot: resolve(root), ...parseVitestInventory(JSON.parse(reportBytes.toString('utf8')), expected, root) });
          }
          if (id === 'pack') { candidate = verifiedCandidate(root, `${reportDir}/candidate-plan.json`, manifest); childEnv.A3D_RELEASE_PLAN = `${reportDir}/candidate-plan.json`; }
          if (id === 'resume-rebuild') {
            buildProducts = collectBuildProducts(root);
            const digest = buildProductsDigest(buildProducts);
            assert(digest === verified.handoff.buildProductsSha256
              && canonicalJson(buildProducts) === canonicalJson(verified.handoff.buildProducts), 'rebuilt output differs from retained build');
            const path = `${reportDir}/resume-build-products.json`;
            const record = { schema: 'aura3d.native-source-build-products/1', runId,
              sourceManifest: verified.handoff.sourceManifest, candidatePlan: candidate.candidatePlan,
              buildProducts, buildProductsSha256: digest };
            const data = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
            assert(data.length <= 256 * 1024 * 1024, 'rebuilt inventory exceeds its retention limit');
            writeFileSync(inRoot(root, path), data, { flag: 'wx' });
            resumeRebuild = { checkId: id, inventory: { path, sha256: sha256(data) }, buildProductsSha256: digest };
          }
          const phaseOutput = {
            'clean-install-source': ['sourceConsumerReport', `tests/reports/native-consumers/${runId}/source.json`],
            'consumer-matrix-source': ['matrixSourceReport', `tests/reports/native-consumers/${runId}/matrix-source.json`],
            'examples-source': ['examplesSourceReport', `tests/reports/native-examples-catalog/${runId}/examples-source.json`]
          }[id];
          if (phaseOutput) {
            assert(candidate, `candidate is missing for ${id}`);
            const plan = JSON.parse(readFileSync(inRoot(root, candidate.candidatePlan.path), 'utf8'));
            const phase = JSON.parse(readFileSync(inRoot(root, phaseOutput[1]), 'utf8'));
            assertPassingPhaseReport(phaseOutput[0], phase, runId, candidate, plan);
          }
        }
        if (candidate) assert(canonicalJson(verifiedCandidate(root, `${reportDir}/candidate-plan.json`, manifest)) === canonicalJson(candidate), 'candidate changed during check');
      } catch (cause) { error = String(cause?.message || cause); blocked = true; writeFileSync(absLog, `\nERROR: ${error}\n`, { flag: 'a' }); if (exitCode === 0 || exitCode === null) exitCode = 1; }
    }
    checks.push({ id, argv, ...(supplemental ? { runner, cwd } : {}), subruns, started,
      status: error ? 'failed' : exitCode === 0 ? 'passed' : 'blocked', exitCode, log, sha256: sha256(readFileSync(absLog)) });
  }
  // A source job cannot succeed after a test or tool silently modified its inputs.
  try { verifyStagedSource(root, manifest); } catch (error) {
    blocked = true;
    const last = checks.at(-1); last.status = 'failed'; last.exitCode = 1;
    writeFileSync(inRoot(root, last.log), `\nERROR: staged inputs changed: ${error.message}\n`, { flag: 'a' });
    last.sha256 = sha256(readFileSync(inRoot(root, last.log)));
  }
  if (phase === 'prepare') {
    if (!blocked && candidate) {
      try { buildProducts = collectBuildProducts(root); }
      catch (error) {
        const last = checks.at(-1); last.status = 'failed'; last.exitCode = 1; blocked = true;
        writeFileSync(inRoot(root, last.log), `\nERROR: build inventory: ${error.message}\n`, { flag: 'a' });
        last.sha256 = sha256(readFileSync(inRoot(root, last.log)));
      }
    }
    const report = { schema: BUILD_REPORT_SCHEMA, runId, releaseKind: env.NATIVE_RELEASE_KIND,
      sourceManifestPath: `${reportDir}/source-manifest.json`, sourceManifestSha256: sha256(bytes),
      sourceInventory, expectedCheckIds: steps.map(step => step.id), fullExpectedCheckIds: allSteps.map(step => step.id),
      executedCheckIds: checks.filter(check => check.started).map(check => check.id),
      ...sourceTestFileCoverage(inventory, testInventories), checks, testInventories, acceptance: 'not-run', completedOutcomeIds,
      candidatePlan: candidate?.candidatePlan || null, archives: candidate?.archives || [],
      buildProducts: buildProducts || [], buildProductsSha256: buildProducts ? buildProductsDigest(buildProducts) : null };
    const data = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
    assert(data.length <= 256 * 1024 * 1024, 'source build report exceeds its retention limit');
    writeFileSync(inRoot(root, `${reportDir}/source-build.json`), data, { flag: 'wx' });
    return report;
  }
  const retainedReports = {};
  for (const [name, path] of Object.entries({ bundleSize: `${reportDir}/bundle-size.json`, installedTreeShaking: `${reportDir}/installed-tree-shaking.json` })) {
    if (existsSync(inRoot(root, path))) retainedReports[name] = { path, sha256: sha256(readFileSync(inRoot(root, path))) };
  }
  for (const [name, producer] of [['bundleSize', 'bundle-size'], ['installedTreeShaking', 'installed-tree-shaking']]) {
    const check = checks.find(c => c.id === producer);
    if (check.status === 'passed' && !retainedReports[name]) {
      check.status = 'failed'; check.exitCode = 1; blocked = true;
      writeFileSync(inRoot(root, check.log), `\nERROR: required ${name} report is missing\n`, { flag: 'a' });
      check.sha256 = sha256(readFileSync(inRoot(root, check.log)));
    }
  }
  const phaseReports = {};
  for (const [name, path] of Object.entries({ sourceConsumerReport: `tests/reports/native-consumers/${runId}/source.json`, matrixSourceReport: `tests/reports/native-consumers/${runId}/matrix-source.json`, examplesSourceReport: `tests/reports/native-examples-catalog/${runId}/examples-source.json` })) {
    if (existsSync(inRoot(root, path))) phaseReports[name] = { path, sha256: sha256(readFileSync(inRoot(root, path))) };
  }
  // Missing output from a nominally passing producer is an error, even if the process returned zero.
  for (const [name, producer] of [['sourceConsumerReport', 'clean-install-source'], ['matrixSourceReport', 'consumer-matrix-source'], ['examplesSourceReport', 'examples-source']]) {
    const check = checks.find(c => c.id === producer);
    if (check.status === 'passed' && !phaseReports[name]) {
      check.status = 'failed'; check.exitCode = 1; blocked = true;
      writeFileSync(inRoot(root, check.log), `\nERROR: required ${name} is missing\n`, { flag: 'a' });
      check.sha256 = sha256(readFileSync(inRoot(root, check.log)));
    }
  }
  const toolVersion = (command, args) => {
    const result = spawnSync(command, args, { cwd: root, env: childEnv, encoding: 'utf8', maxBuffer: 64 * 1024 });
    return result.status === 0 ? result.stdout?.trim().split('\n')[0] || null : null;
  };
  const { consumers, pnpmConsumers, ...portableInputs } = verified.portable;
  const report = { schema: REPORT_SCHEMA, runId, releaseKind: env.NATIVE_RELEASE_KIND, phaseReports, retainedReports,
    sourceManifestPath: `${reportDir}/source-manifest.json`, sourceManifestSha256: sha256(bytes),
    sourceInventory, buildHandoff: verified.handoff.reportRef, portableInputs, resumeRebuild,
    expectedCheckIds: allSteps.map(step => step.id), fullExpectedCheckIds: allSteps.map(step => step.id),
    executedCheckIds: checks.filter(check => check.started).map(check => check.id),
    ...sourceTestFileCoverage(inventory, testInventories), checks, testInventories, acceptance: 'not-run', deferredAcceptanceTests: manifest.deferredAcceptanceTests, deferredReplayTests: manifest.deferredReplayTests, deferredExternalCodecTests: manifest.deferredExternalCodecTests, completedOutcomeIds, candidatePlan: candidate?.candidatePlan || null, archives: candidate?.archives || [], tools: { node: process.version, pnpm: toolVersion('pnpm', ['--version']), glslang: toolVersion('glslangValidator', ['--version']), naga: toolVersion('naga', ['--version']), ffmpeg: toolVersion('ffmpeg', ['-version']) } };
  writeFileSync(inRoot(root, `${reportDir}/source-reports.json`), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

// Restore only the current run's named artifact directories. Never overwrite
// prior candidate evidence; all manifest/report/archive bytes are rechecked.
export function materializeBuildResults(root, downloadedRoot, runId, releaseKind) {
  assert(ID.test(runId || '') && ['patch', 'minor', 'major'].includes(releaseKind), 'invalid build materialization identity');
  const payload = resolve(downloadedRoot, runId, 'prepare');
  const reportDir = `tests/reports/native-capabilities/${runId}`;
  const manifestBytes = readFileSync(inRoot(payload, `${reportDir}/source-manifest.json`));
  const manifest = JSON.parse(manifestBytes), reportBytes = readFileSync(inRoot(payload, `${reportDir}/source-build.json`));
  const expectedReportSha256 = sha256(reportBytes);
  stageSourceBuildHandoff({ root: payload, dest: root, runId, releaseKind, manifestBytes, manifest,
    expectedReportSha256, api: sourceHandoffApi() });
  const taskLog = `${reportDir}/source-task.log`, source = inRoot(payload, taskLog);
  if (statIfPresent(source)) {
    assert(lstatSync(source).isFile() && !lstatSync(source).isSymbolicLink(), 'unsafe source task log');
    copyFileSync(source, inRoot(root, taskLog), constants.COPYFILE_EXCL);
  }
  return { path: `${reportDir}/source-build.json`, sha256: expectedReportSha256 };
}

function mergeDownloadedRun(root, payload, dirs) {
  const created = [];
  const ensureDir = path => {
    let current = realpathSync(root);
    for (const part of safePath(path).split('/')) {
      current = join(current, part);
      const stat = statIfPresent(current);
      if (!stat) { mkdirSync(current); created.push({ path: current, directory: true }); }
      else assert(stat.isDirectory() && !stat.isSymbolicLink(), `unsafe retained artifact directory: ${path}`);
    }
  };
  const files = [];
  const collect = path => {
    const stat = lstatSync(inRoot(payload, path));
    assert(!stat.isSymbolicLink(), `symlink in downloaded artifacts: ${path}`);
    if (stat.isDirectory()) { for (const name of readdirSync(inRoot(payload, path)).sort()) collect(`${path}/${name}`); }
    else { assert(stat.isFile(), `invalid downloaded artifact: ${path}`); files.push(path); }
  };
  for (const dir of dirs) collect(dir);
  // All collisions must match before writing any new evidence.
  for (const path of files) {
    let ancestor = realpathSync(root);
    for (const part of dirname(path).split('/')) {
      ancestor = join(ancestor, part);
      const stat = statIfPresent(ancestor);
      if (!stat) break;
      assert(stat.isDirectory() && !stat.isSymbolicLink(), `unsafe retained artifact directory: ${path}`);
    }
    const existing = statIfPresent(inRoot(root, path));
    if (existing) assert(existing.isFile() && !existing.isSymbolicLink()
      && readEntry(root, path).sha256 === readEntry(payload, path).sha256, `retained artifact changed: ${path}`);
  }
  try {
    for (const path of files) {
      ensureDir(dirname(path));
      if (statIfPresent(inRoot(root, path))) continue;
      copyFileSync(inRoot(payload, path), inRoot(root, path), constants.COPYFILE_EXCL);
      created.push({ path: inRoot(root, path), directory: false });
    }
  } catch (error) {
    for (const item of created.reverse()) {
      try { item.directory ? rmdirSync(item.path) : rmSync(item.path); } catch { /* Preserve any concurrent writer. */ }
    }
    throw error;
  }
}

export function materializeResults(root, downloadedRoot, runId, phase) {
  assert(ID.test(runId), 'invalid run ID');
  assert(phase === undefined || phase === 'resume', 'invalid materialization phase');
  const payload = resolve(downloadedRoot, runId, ...(phase ? [phase] : []));
  const dirs = ['native-capabilities', 'native-consumers', 'native-consumer-matrix', 'native-examples-catalog', ...(phase ? ['native-source-inputs'] : [])]
    .map(family => `tests/reports/${family}/${runId}`)
    .filter(path => existsSync(inRoot(payload, path)));
  assert(dirs.includes(`tests/reports/native-capabilities/${runId}`), 'downloaded source report directory is missing');
  for (const path of dirs) {
    if (!phase) assert(!existsSync(inRoot(root, path)), `refusing to overwrite retained evidence: ${path}`);
    assert(lstatSync(inRoot(payload, path)).isDirectory(), `invalid artifact directory: ${path}`);
    const inspect = absolute => {
      for (const name of readdirSync(absolute)) {
        const file = join(absolute, name), stat = lstatSync(file);
        assert(!stat.isSymbolicLink(), `symlink in downloaded artifacts: ${file}`);
        if (stat.isDirectory()) inspect(file);
        else assert(stat.isFile(), `invalid downloaded artifact: ${file}`);
      }
    };
    inspect(inRoot(payload, path));
  }
  const reportPath = `tests/reports/native-capabilities/${runId}/source-reports.json`;
  if (!existsSync(inRoot(payload, reportPath))) {
    // Early failures may not have produced a report. Retain the task log for
    // diagnosis, but never report successful materialization without a report.
    const taskLog = `tests/reports/native-capabilities/${runId}/${phase ? 'source-task-resume.log' : 'source-task.log'}`;
    if (existsSync(inRoot(payload, taskLog))) {
      mkdirSync(dirname(inRoot(root, taskLog)), { recursive: true });
      copyFileSync(inRoot(payload, taskLog), inRoot(root, taskLog), constants.COPYFILE_EXCL);
    }
    throw new Error('downloaded source report is missing');
  }
  let sourceChecksPassed = false;
  {
    const report = JSON.parse(readFileSync(inRoot(payload, reportPath), 'utf8'));
    assert(report.schema === REPORT_SCHEMA && report.runId === runId && report.acceptance === 'not-run', 'downloaded report identity mismatch');
    assert(report.sourceManifestPath === `tests/reports/native-capabilities/${runId}/source-manifest.json`, 'downloaded source manifest path mismatch');
    const requireDigest = item => {
      assert(item && typeof item.path === 'string' && HASH.test(item.sha256), 'invalid retained artifact reference');
      assert(dirs.some(dir => item.path.startsWith(`${dir}/`)), `artifact path is outside this run: ${item.path}`);
      assert(sha256(readFileSync(inRoot(payload, item.path))) === item.sha256, `downloaded artifact hash mismatch: ${item.path}`);
    };
    requireDigest({ path: report.sourceManifestPath, sha256: report.sourceManifestSha256 });
    const manifest = JSON.parse(readFileSync(inRoot(payload, report.sourceManifestPath), 'utf8'));
    assert(manifest.inputDigest === computeInputDigest(manifest.files), 'downloaded source manifest digest mismatch');
    const inventory = nativeSourceInventoryForManifest(manifest, runId);
    assert(report.sourceInventory?.path === `tests/reports/native-capabilities/${runId}/source-inventory.json`, 'downloaded source inventory path mismatch');
    requireDigest(report.sourceInventory);
    assert(canonicalJson(JSON.parse(readFileSync(inRoot(payload, report.sourceInventory.path), 'utf8'))) === canonicalJson(inventory), 'downloaded source inventory mismatch');
    const steps = buildSteps(runId, `tests/reports/native-capabilities/${runId}`, report.releaseKind, inventory), expectedIds = steps.map(step => step.id);
    assert(canonicalJson(report.expectedCheckIds) === canonicalJson(expectedIds)
      && canonicalJson(report.fullExpectedCheckIds) === canonicalJson(expectedIds)
      && Array.isArray(report.checks) && canonicalJson(report.checks.map(check => check.id)) === canonicalJson(expectedIds), 'downloaded source check inventory mismatch');
    assert(report.checks.every((check, index) => canonicalJson(check.argv) === canonicalJson(steps[index].argv)
      && (check.status === 'passed' && check.exitCode === 0 && check.started === true
      || check.status === 'failed' && Number.isInteger(check.exitCode) && check.exitCode !== 0 && typeof check.started === 'boolean'
      || check.status === 'blocked' && check.exitCode === null && check.started === false)), 'downloaded source check status mismatch');
    assert(canonicalJson(report.executedCheckIds) === canonicalJson(report.checks.filter(check => check.started).map(check => check.id)), 'downloaded executed check inventory mismatch');
    const coverage = sourceTestFileCoverage(inventory, report.testInventories);
    for (const [key, value] of Object.entries(coverage)) assert(canonicalJson(report[key]) === canonicalJson(value), `downloaded source test coverage mismatch: ${key}`);
    sourceChecksPassed = report.checks.every(check => check.status === 'passed');
    if (sourceChecksPassed) {
      assert(canonicalJson(coverage.expectedTestFiles) === canonicalJson(coverage.executedTestFiles)
        && canonicalJson(coverage.expectedSourceTestFiles) === canonicalJson(coverage.executedSourceTestFiles), 'downloaded executed test files mismatch');
    }
    for (const check of report.checks) {
      requireDigest({ path: check.log, sha256: check.sha256 });
      for (const subrun of check.subruns || []) {
        requireDigest(subrun.result);
        if (subrun.testResult) requireDigest(subrun.testResult);
      }
    }
    for (const inventory of report.testInventories || []) if (inventory.result) requireDigest(inventory.result);
    if (sourceChecksPassed) for (const plan of inventory.supplementalChecks) {
      verifySupplementalEvidence({ runId, plan, check: report.checks.find(item => item.id === plan.id),
        inventory: report.testInventories.find(item => item.checkId === plan.id), api: sourceHandoffApi(),
        readRetained: (ref, expectedPath) => {
          assert(ref?.path === expectedPath, 'downloaded supplemental result path mismatch');
          requireDigest(ref);
          return readFileSync(inRoot(payload, ref.path));
        } });
    }
    for (const reference of Object.values(report.phaseReports || {})) requireDigest(reference);
    for (const reference of Object.values(report.retainedReports || {})) requireDigest(reference);
    if (report.candidatePlan) requireDigest(report.candidatePlan);
    for (const archive of report.archives || []) requireDigest(archive);
    if (phase) {
      assert(['patch', 'minor', 'major'].includes(report.releaseKind), 'missing release kind');
      requireDigest(report.buildHandoff);
      assert(report.resumeRebuild?.checkId === 'resume-rebuild' && HASH.test(report.resumeRebuild.buildProductsSha256 || ''), 'missing rebuilt inventory');
      requireDigest(report.resumeRebuild.inventory);
      for (const key of ['sourceManifest', 'candidatePlan', 'inputs', 'consumerBundle', 'exampleBundle', 'matrixBundle']) requireDigest(report.portableInputs?.[key]);
      assert(report.portableInputs?.admissionPolicy?.path === 'tools/release/archive-admission-policy.json'
        && HASH.test(report.portableInputs.admissionPolicy.sha256 || ''), 'missing policy identity');
      for (const [key, folder] of [['candidateReviews', 'candidate-reviews'], ['candidateReviewEvidence', 'candidate-review-evidence']]) {
        const refs = report.portableInputs?.[key], prefix = `tests/reports/native-source-inputs/${runId}/${folder}/`;
        assert(Array.isArray(refs) && refs.length <= 10000, `missing ${key} inventory`);
        let previous = '';
        for (const ref of refs) {
          assert(typeof ref?.path === 'string' && /^[A-Za-z0-9._/-]+$/.test(ref.path) && ref.path.startsWith(prefix) && ref.path.length > prefix.length
            && (!previous || previous < ref.path) && (key !== 'candidateReviews' || ref.path === `${prefix}${ref.sha256}.json`), `invalid ${key} identity`);
          requireDigest(ref); previous = ref.path;
        }
      }
    }
  }
  if (phase) mergeDownloadedRun(root, payload, dirs);
  else for (const path of dirs) {
      const destination = inRoot(root, path); mkdirSync(dirname(destination), { recursive: true });
      cpSync(inRoot(payload, path), destination, { recursive: true, force: false, errorOnExist: true });
    }
  assert(sourceChecksPassed, 'downloaded source checks failed; retained evidence is for diagnosis');
  return dirs;
}

export function evaluateRunResult(log, infrastructureExit) {
  const extract = name => {
    const found = [...log.matchAll(new RegExp(`(?:^|\\s)${name}=(\\d+|not-run)\\s*$`, 'gm'))];
    return found.length === 1 && /^\d+$/.test(found[0][1]) ? Number(found[0][1]) : null;
  };
  const sourceTestExit = extract('SOURCE_TEST_EXIT'), artifactUploadExit = extract('SOURCE_UPLOAD_EXIT');
  return { infrastructureExit, sourceTestExit, artifactUploadExit, ok: infrastructureExit === 0 && sourceTestExit === 0 && artifactUploadExit === 0 };
}
function main(argv) {
  if (argv[0] === 'stage' && argv.length === 2) { stageSource(process.cwd(), argv[1]); return; }
  // CLI invocations have no live in-process capability handoff and stay
  // closed. Never deserialize a capability or infer one from environment.
  if (argv[0] === 'workspace-admission' && argv.length === 1) { assertSourceWorkspaceAdmission(process.cwd()); return; }
  if (argv[0] === 'verify' && argv.length === 1) { const root = process.cwd(); verifyStagedSource(root, JSON.parse(readFileSync(join(root, MANIFEST_NAME), 'utf8'))); return; }
  if (argv[0] === 'independence' && argv.length === 1) { const root = process.cwd(), manifest = JSON.parse(readFileSync(join(root, MANIFEST_NAME), 'utf8')); verifyStagedSource(root, manifest); assertIndependentLock(root, manifest.files); return; }
  if (argv[0] === 'verify-stage-inputs' && argv.length === 1) { verifySourcePhaseInputs(process.cwd(), process.env); return; }
  if (argv[0] === 'stage-resume' && argv.length === 5) { stageResumeInputs(process.cwd(), argv[1], argv[2], argv[3], argv[4]); return; }
  if (argv[0] === 'materialize-build' && argv.length === 4) {
    const result = materializeBuildResults(process.cwd(), argv[1], argv[2], argv[3]);
    console.log(`Retained source-build report SHA-256: ${result.sha256} (byte identity only)`); return;
  }
  if (argv[0] === 'materialize' && argv.length === 3) { materializeResults(process.cwd(), argv[1], argv[2]); return; }
  if (argv[0] === 'materialize' && argv.length === 4 && argv[3] === 'resume') { materializeResults(process.cwd(), argv[1], argv[2], 'resume'); return; }
  if (argv[0] === 'evaluate-result' && argv.length === 6 && /^\d+$/.test(argv[2]) && ID.test(argv[4]) && /^sha256:[a-f0-9]{64}$/.test(argv[5])) {
    const result = { runId: argv[4], imageDigest: argv[5], ...evaluateRunResult(readFileSync(argv[1], 'utf8'), Number(argv[2])) };
    writeFileSync(argv[3], `${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (argv[0] === 'run' && argv.length === 1) { const report = runSource(process.cwd()); if (report.checks.some(c => c.status !== 'passed')) process.exitCode = 1; return; }
  throw new Error('source runner accepts only fixed source staging, verification, reporting and materialization commands; browser/acceptance and arbitrary argv are forbidden');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(`source-checks: ${error.message}`); process.exitCode = 2; }
}
