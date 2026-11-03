import { posix } from 'node:path';

const SCHEMA = 'aura3d.native-source-inventory/1';
const MANIFEST_SCHEMA = 'aura3d.native-source-manifest/1';
const MATRIX_IDS = Object.freeze([
  'parity', 'unit', 'unit-dist', 'unit-packed', 'assets-qr',
  'integration', 'packages', 'packages-dist', 'node-release'
]);
const MATRIX_PATHS = Object.freeze({
  parity: /^tests\/unit\/parity\/.+\.test\.ts$/,
  unit: /^tests\/unit\/.+\.test\.ts$/,
  'unit-dist': /^tests\/unit\/.+\.test\.ts$/,
  'unit-packed': /^tests\/unit\/.+\.test\.ts$/,
  'assets-qr': /^tests\/(?:assets|qr)\/.+\.test\.ts$/,
  integration: /^tests\/integration\/.+\.test\.ts$/,
  packages: /^packages\/[^/]+\/tests\/.+\.test\.ts$/,
  'packages-dist': /^packages\/[^/]+\/tests\/.+\.test\.ts$/,
  'node-release': /^tools\/release\/[^/]+\.test\.mjs$/
});
const GAME_RUNTIME_TEST = 'tests/game-runtime/aura3d104-game-runtime-source.test.ts';
const GAME_RUNTIME_INPUTS = Object.freeze([
  'tests/fixtures/game-runtime/browser-evidence.manifest.json',
  'tests/fixtures/game-runtime/command-gates.manifest.json',
  'tests/fixtures/game-runtime/runtime-evidence.manifest.json'
]);
const SCRATCH_PROBE = Object.freeze({
  path: 'tests/browser-probe/to-data-url.probe.spec.ts',
  sha256: 'e31ea093fb088eadbf9ab5c618c9ca8832009063a2099f5774788e622d741507'
});
const NODE_TESTS = Object.freeze({
  'app-animation-studio-node': Object.freeze(['apps/animation-studio-web/verify/wiring.test.cjs']),
  'app-clash-node': Object.freeze(['apps/aura-clash-showcase/tests/copy-boundary.test.mjs']),
  'cli-config-node': Object.freeze([
    'tests/cli-configs/install-meshy-mcp.test.mjs',
    'tests/cli-configs/meshy-docs-skill.test.mjs',
    'tests/cli-configs/meshy-live-smoke-workflow.test.mjs'
  ]),
  'docs-game-upgrades-node': Object.freeze(['docs/prds/game-upgrades-47/lanes/wp36-decisions.test.mjs']),
  'node-release-unit': Object.freeze([
    'tests/unit/release/exact-plan.test.mjs',
    'tests/unit/release/final-review-approval.test.mjs',
    'tests/unit/release/muse301-publication-workflows.test.mjs'
  ]),
  'template-node': Object.freeze([
    'tools/agent-templates/cli.test.mjs',
    'tools/agent-templates/command.test.mjs'
  ])
});
const SHELL_TESTS = Object.freeze([
  'tests/cli-configs/meshy-agent.test.sh',
  'tests/cli-configs/meshy-mcp-keychain-launcher.test.sh',
  'tests/cli-configs/setup-meshy.test.sh'
]);
const VITEST_RULES = Object.freeze([
  {
    id: 'app-cross-hop-vitest',
    pattern: /^apps\/showcase-cross-hop\/tests\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/,
    cwd: 'apps/showcase-cross-hop',
    config: 'vitest.config.ts'
  },
  {
    id: 'app-wonder-world-vitest',
    pattern: /^apps\/veer-wonder-world\/tests\/unit\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/,
    cwd: 'apps/veer-wonder-world',
    config: '../../tools/native-source-inventory/index.mjs'
  },
  {
    id: 'asset-optimize-vitest',
    pattern: /^tools\/asset-optimize\/tests\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/,
    cwd: 'tools/asset-optimize',
    config: 'vitest.config.ts'
  },
  {
    id: 'game-runtime-vitest',
    pattern: /^tests\/game-runtime\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/,
    cwd: '.',
    config: 'tools/native-source-inventory/index.mjs'
  },
  {
    id: 'performance-cpu-vitest',
    pattern: /^tests\/performance\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/,
    cwd: '.',
    config: 'tests/performance/vitest.config.ts'
  },
  {
    id: 'template-source-vitest',
    pattern: /^tests\/templates\/(?:[\w.-]+\/)*[\w.-]+\.test\.ts$/,
    cwd: '.',
    config: 'tests/templates/vitest.config.ts'
  }
]);
const FILE_PREREQUISITES = Object.freeze({
  'apps/animation-studio-web/verify/wiring.test.cjs': Object.freeze([
    'apps/animation-studio-web/src/state/backend.ts',
    'apps/animation-studio-web/src/state/mapDocument.ts'
  ]),
  'apps/aura-clash-showcase/tests/copy-boundary.test.mjs': Object.freeze([
    'apps/aura-clash-showcase/index.html',
    'apps/aura-clash-showcase/src/main.ts',
    'apps/aura-clash-showcase/src/legacy/main.ts',
    'apps/aura-clash-showcase/src/legacy/playable/AuraClashArenaApp.ts',
    'apps/aura-clash-showcase/src/legacy/ui/TitleScreen.ts',
    'apps/aura-clash-showcase/src/v2/boot.ts'
  ]),
  'docs/prds/game-upgrades-47/lanes/wp36-decisions.test.mjs': Object.freeze([
    'docs/prds/game-upgrades-47/lanes/wp36-decisions.mjs'
  ]),
  'tests/cli-configs/install-meshy-mcp.test.mjs': Object.freeze(['cli-configs/install-meshy-mcp.sh']),
  'tests/cli-configs/meshy-docs-skill.test.mjs': Object.freeze([
    '.cursor/skills/meshy-cli/SKILL.md',
    'cli-configs/install-meshy-mcp.sh',
    'docs/meshy-cli.md'
  ]),
  'tests/cli-configs/meshy-agent.test.sh': Object.freeze(['cli-configs/meshy-agent']),
  'tests/cli-configs/meshy-mcp-keychain-launcher.test.sh': Object.freeze(['cli-configs/meshy-mcp-keychain-launcher']),
  'tests/cli-configs/setup-meshy.test.sh': Object.freeze(['cli-configs/setup-meshy.sh']),
  'tests/cli-configs/meshy-live-smoke-workflow.test.mjs': Object.freeze(['.github/workflows/meshy-live-smoke.yml']),
  'tests/unit/release/muse301-publication-workflows.test.mjs': Object.freeze([
    'tools/release/publish-all.mjs',
    'tools/release/exact-release-plan.mjs',
    'tools/release/release-inventory.mjs',
    'tools/release/final-review-approval.mjs',
    'tools/release/visual-review-manifest.mjs',
    'tools/release/source-identity.mjs'
  ]),
  'tools/asset-optimize/tests/determinism.test.ts': Object.freeze(['fixtures/asset-corpus/damaged-helmet.glb']),
  'tools/asset-optimize/tests/prd05-pipeline-invariants.test.ts': Object.freeze(['fixtures/asset-corpus/damaged-helmet.glb']),
  [GAME_RUNTIME_TEST]: GAME_RUNTIME_INPUTS
});
const REASON_BY_GROUP = Object.freeze({
  'app-animation-studio-node': 'Reviewed CommonJS Node source-wiring test; no browser is launched.',
  'app-clash-node': 'Reviewed standalone Node source and copy-boundary assertions; no browser is launched.',
  'app-cross-hop-vitest': 'App-owned Vitest configuration selects pure game-math source tests.',
  'app-wonder-world-vitest': 'Node-environment app unit tests use the canonical source aliases instead of stale workspace dist.',
  'asset-optimize-vitest': 'Tool-owned Vitest configuration selects optimizer source and fixture tests; admitted tool dependencies are required.',
  'cli-config-node': 'Reviewed Node CLI-configuration tests use static assertions or synthetic local fixtures.',
  'cli-config-shell': 'Reviewed shell CLI-configuration tests use synthetic executables and temporary inputs.',
  'docs-game-upgrades-node': 'Reviewed Node source tests cover the game-upgrade decision logic.',
  'game-runtime-vitest': 'Vitest source tests exercise the game runtime without running its browser evidence.',
  'node-release-unit': 'Reviewed Node release tests exercise source contracts and synthetic release fixtures.',
  'performance-cpu-vitest': 'Node-only ECS source baseline measures a CPU workload, not rendered performance.',
  'template-node': 'Reviewed Node tests exercise template tooling with synthetic local commands.',
  'template-source-vitest': 'Vitest source tests inspect template configuration and source without building or launching browsers.'
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validPath(path) {
  return typeof path === 'string' && path.length > 0 && !path.startsWith('/')
    && !/^[a-zA-Z]:/.test(path) && !path.includes('\\') && !/[\x00-\x1f\x7f]/.test(path)
    && !path.split('/').some(part => !part || part === '.' || part === '..');
}

function isTestPath(path) {
  if (/\/__snapshots__\/[^/]+\.(?:test|spec)\.[^/]+\.snap$/.test(path)) return false;
  return /(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/.test(path);
}

function deferredPaths(manifest, available) {
  assert(Array.isArray(manifest.deferredAcceptanceTests), 'missing deferred acceptance inventory');
  assert(manifest.deferredReplayTests && typeof manifest.deferredReplayTests === 'object'
    && !Array.isArray(manifest.deferredReplayTests), 'missing deferred replay inventory');
  assert(manifest.deferredExternalCodecTests && typeof manifest.deferredExternalCodecTests === 'object'
    && !Array.isArray(manifest.deferredExternalCodecTests), 'missing deferred codec inventory');
  const result = new Map();
  const groups = [
    [manifest.deferredAcceptanceTests, 'Historical verdict consumes retained browser or visual evidence and is deferred to acceptance.'],
    [[manifest.deferredReplayTests], 'Historical replay requires its separate acceptance replay and is not a source-phase test.'],
    [[manifest.deferredExternalCodecTests], 'External codec fixture acceptance requires its verified gated fixture and installed-consumer environment.']
  ];
  for (const [entries, reason] of groups) for (const entry of entries) {
    assert(entry && validPath(entry.path) && isTestPath(entry.path) && entry.phase === 'acceptance'
      && entry.status === 'not-run', 'invalid deferred acceptance entry');
    assert(available.has(entry.path), `deferred test is not staged in the manifest: ${entry.path}`);
    assert(!result.has(entry.path), `duplicate deferred test: ${entry.path}`);
    result.set(entry.path, reason);
  }
  return result;
}

function acceptanceReason(path) {
  if (/^tests\/(?:browser|visual)\//.test(path)) return 'Browser or rendered visual test; execute only in remote acceptance after the global gate.';
  if (/^tests\/qr\/[^/]+\/(?:browser|perf|games)\//.test(path)) return 'Browser, game-rendering, or rendered-performance suite; execute only in remote acceptance.';
  if (path === 'tests/qr/prd09/capture-divergence.spec.ts' || path === 'tests/qr/prd09/look-perf.spec.ts')
    return 'Browser capture or rendered-performance test; execute only in remote acceptance.';
  if (/^apps\/aura-clash-showcase\/tests\/(?:[\w.-]+\/)*[\w.-]+\.spec\.[cm]?[jt]sx?$/.test(path))
    return /(?:deployed|deploy-check)/.test(path)
      ? 'Browser test for a deployed or live route; acceptance requires the global gate and applicable authorization.'
      : 'App-owned browser test; execute only in remote acceptance after the global gate.';
  if (/^(?:templates\/[^/]+|packages\/create-aura3d\/templates\/[^/]+)\/tests\/(?:[\w.-]+\/)*[\w.-]+\.spec\.[cm]?[jt]sx?$/.test(path))
    return 'Template browser specification; installed-template behavior belongs to remote acceptance.';
  if (path === 'tests/game-runtime/keyboard-operation-browser.spec.ts')
    return 'Game-runtime browser test starts a dev server and browser; execute only in remote acceptance.';
  if (path === 'docs/agents/samples/coin-dash/coin-dash.spec.ts')
    return 'Documentation sample uses Playwright and rendered browser behavior; execute only in remote acceptance.';
  return null;
}

function supplementalGroup(path) {
  for (const rule of VITEST_RULES) if (rule.pattern.test(path)) return rule.id;
  for (const [id, files] of Object.entries(NODE_TESTS)) if (files.includes(path)) return id;
  if (SHELL_TESTS.includes(path)) return 'cli-config-shell';
  return null;
}

function validatedMatrix(expected, available, deferred) {
  assert(expected && typeof expected === 'object' && !Array.isArray(expected), 'missing expected native matrix');
  const keys = Object.keys(expected).sort();
  assert(JSON.stringify(keys) === JSON.stringify([...MATRIX_IDS].sort()), 'invalid expected native matrix check IDs');
  const byPath = new Map();
  const matrix = [];
  for (const id of MATRIX_IDS) {
    const files = expected[id];
    assert(Array.isArray(files), `invalid expected matrix inventory: ${id}`);
    assert(new Set(files).size === files.length, `duplicate expected matrix test: ${id}`);
    const sorted = [...files].sort();
    for (const path of sorted) {
      assert(validPath(path) && isTestPath(path) && MATRIX_PATHS[id].test(path), `invalid ${id} matrix test path: ${path}`);
      assert(available.has(path), `expected matrix test not staged in manifest: ${path}`);
      assert(!deferred.has(path), `deferred acceptance test selected by source matrix: ${path}`);
      assert(!acceptanceReason(path), `browser acceptance test selected by source matrix: ${path}`);
      if (!byPath.has(path)) byPath.set(path, []);
      byPath.get(path).push(id);
    }
    matrix.push({ id, expectedFiles: sorted });
  }
  assert(JSON.stringify(matrix.find(check => check.id === 'packages').expectedFiles)
    === JSON.stringify(matrix.find(check => check.id === 'packages-dist').expectedFiles), 'source and dist package matrix inventories differ');
  return { byPath, matrix };
}

function configForGroup(id) {
  return VITEST_RULES.find(rule => rule.id === id);
}

function groupPrerequisites(id, files) {
  const paths = new Set();
  const config = configForGroup(id);
  if (config) {
    paths.add(posix.normalize(config.cwd === '.' ? config.config : `${config.cwd}/${config.config}`));
    if (id === 'game-runtime-vitest' || id === 'app-wonder-world-vitest') {
      paths.add('vitest.config.ts');
      paths.add('aura.exports.json');
    }
  }
  for (const file of files) for (const path of FILE_PREREQUISITES[file] || []) paths.add(path);
  return [...paths].sort();
}

function createCheck(id, files, available, runId) {
  const config = configForGroup(id);
  const cwd = config?.cwd || '.';
  const expectedFiles = [...files].sort();
  const prerequisitePaths = groupPrerequisites(id, expectedFiles);
  const missingPrerequisitePaths = prerequisitePaths.filter(path => !available.has(path));
  const runner = config ? 'vitest' : id === 'cli-config-shell' ? 'shell' : 'node-test';
  let invocations;
  if (config) {
    const report = `tests/reports/native-capabilities/${runId}/${id}.json`;
    const outputFile = posix.relative(cwd, report);
    invocations = [{
      argv: ['pnpm', 'exec', 'vitest', 'run', '--config', config.config, '--maxWorkers=1',
        '--reporter=json', `--outputFile=${outputFile}`, ...expectedFiles.map(path => posix.relative(cwd, path))]
    }];
  } else {
    invocations = expectedFiles.map(file => ({
      file,
      argv: runner === 'shell'
        ? ['bash', file]
        : ['node', '--test', '--test-reporter=tap', '--test-concurrency=1', file]
    }));
  }
  return {
    id, runner, cwd, expectedFiles, prerequisitePaths, missingPrerequisitePaths,
    execution: 'remote-only', status: 'not-run', invocations
  };
}

export function createNativeSourceInventory({ manifest, expectedTestFiles, runId } = {}) {
  assert(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(runId || ''), 'invalid source inventory run ID');
  assert(manifest?.schema === MANIFEST_SCHEMA && /^[a-f0-9]{64}$/.test(manifest.inputDigest || '')
    && Array.isArray(manifest.files) && manifest.files.length > 0, 'invalid staged source manifest');
  const available = new Map();
  for (const entry of manifest.files) {
    assert(entry && validPath(entry.path) && /^[a-f0-9]{64}$/.test(entry.sha256 || ''), `unsafe or invalid staged source path: ${entry?.path}`);
    assert(!available.has(entry.path), `duplicate staged source path: ${entry.path}`);
    available.set(entry.path, entry);
  }
  const deferred = deferredPaths(manifest, available);
  const { byPath, matrix } = validatedMatrix(expectedTestFiles, available, deferred);
  const groups = new Map();
  const entries = [];
  for (const path of [...available.keys()].filter(isTestPath).sort()) {
    let classification, reason, checkIds = [];
    if (path === SCRATCH_PROBE.path) {
      assert(!deferred.has(path), `scratch probe cannot be declared as acceptance: ${path}`);
      const reviewed = available.get(path);
      if (reviewed.type === 'file' && reviewed.sha256 === SCRATCH_PROBE.sha256) {
        classification = 'scratch';
        reason = 'Ad hoc Playwright probe opens a machine-specific file:///private/tmp page and only logs the results; it has no assertions or portable fixture and is neither a source check nor an acceptance test.';
      } else {
        classification = 'unknown';
        reason = 'Scratch probe bytes or file type differ from the inspected local-only probe; owner review is required before exclusion.';
      }
    } else if (deferred.has(path)) {
      classification = 'acceptance';
      reason = deferred.get(path);
    } else if (path.startsWith('archive/')) {
      classification = 'archived';
      reason = 'Test is in the explicit archive tree, not the active candidate source suite.';
      assert(!byPath.has(path), `archived test selected by source matrix: ${path}`);
    } else if (acceptanceReason(path)) {
      classification = 'acceptance';
      reason = acceptanceReason(path);
    } else if (byPath.has(path)) {
      classification = 'source';
      checkIds = [...byPath.get(path)].sort();
      reason = 'Selected by the staged native source runner matrix.';
    } else {
      const group = supplementalGroup(path);
      if (group) {
        classification = 'source';
        checkIds = [group];
        reason = path === 'tests/cli-configs/meshy-live-smoke-workflow.test.mjs'
          ? 'Static assertions inspect the workflow text; they do not execute a live service or the workflow.'
          : REASON_BY_GROUP[group];
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(path);
      } else {
        classification = 'unknown';
        reason = 'Test path is outside the reviewed source, acceptance, and archive families; owner classification is required.';
      }
    }
    entries.push({ path, sha256: available.get(path).sha256, classification, reason, checkIds });
  }
  const supplementalChecks = [...groups.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([id, files]) => createCheck(id, files, available, runId));
  const blockers = [];
  for (const entry of entries) if (entry.classification === 'unknown')
    blockers.push({ code: 'UNKNOWN_TEST', path: entry.path, reason: entry.reason });
  for (const check of supplementalChecks) for (const path of check.missingPrerequisitePaths)
    blockers.push({ code: 'MISSING_PREREQUISITE', path, checkId: check.id, reason: 'Required test input is absent from the staged source manifest.' });
  blockers.sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1
    : a.path < b.path ? -1 : a.path > b.path ? 1 : (a.checkId || '').localeCompare(b.checkId || ''));
  return {
    schema: SCHEMA, inputDigest: manifest.inputDigest, runId,
    status: blockers.length ? 'blocked' : 'ready',
    entries, matrix, supplementalChecks, blockers
  };
}

export function assertNativeSourceInventoryReady(inventory) {
  assert(inventory?.schema === SCHEMA && Array.isArray(inventory.entries)
    && Array.isArray(inventory.supplementalChecks) && Array.isArray(inventory.blockers), 'invalid source inventory');
  const unknown = inventory.entries.filter(entry => entry.classification === 'unknown').map(entry => entry.path);
  const missing = inventory.supplementalChecks.flatMap(check => check.missingPrerequisitePaths || []);
  const blockers = [...new Set([...unknown, ...missing, ...inventory.blockers.map(blocker => blocker.path)])].sort();
  assert(inventory.status === 'ready' && blockers.length === 0, `source inventory is blocked: ${blockers.join(', ')}`);
  return inventory;
}

export default async function extraVitestConfig() {
  const { default: base } = await import('../../vitest.config.ts');
  return {
    ...base,
    test: {
      ...base.test,
      include: [...base.test.include, 'tests/game-runtime/**/*.test.ts']
    }
  };
}
