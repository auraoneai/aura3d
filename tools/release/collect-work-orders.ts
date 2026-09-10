/**
 * Single-pass collector for every muse3jsparity work-order gate receipt.
 *
 * Why this exists: the readiness aggregate reduces over per-gate receipts supplied
 * through `--evidence-manifest`, and `validateReceipt` enforces `sameSource`, so
 * every receipt in one manifest must be earned on the same frozen commit. Minting
 * gate by gate re-runs shared specs (85 gates name 145 distinct files but issue 465
 * browser spec invocations) and any commit landed mid-collection invalidates the
 * whole batch. This collector runs each distinct test file exactly once into a
 * hashed pool, then mints every receipt from that pool.
 *
 * Ordering is forced by the validator, not by preference:
 *   1. pool the Node suites, then the browser specs
 *   2. mint the pool-provable gates
 *   3. mint the freshness-bounded gates last (k1/v01/v02 carry MAX_COMPARISON_AGE_MS)
 *
 * Gates that carry typed acceptance contracts (l01, l02, q02) are owned by their
 * dedicated producers and are reported as skipped rather than fabricated here.
 *
 * Usage: collect-work-orders.ts [--pool <dir>] [--only <gate,gate>] [--plan-only]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sameSource, sourceIdentity } from '../muse3jsparity-readiness/evidence-lineage';
import { loadMuse301ExecutionRequirements } from '../muse3jsparity-readiness/requirements';

const root = process.cwd();
const argv = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
};
const pool = option('pool') ?? 'tests/reports/muse3jsparity/wo-pool';
/*
 * Receipts are written with `flag: 'wx'` (writeImmutableJson), so a collection run
 * must own a fresh output root rather than overwriting the previous batch. The
 * earlier per-gate directories stay on disk as history; only receipts inside one
 * run share a frozen source and can be reduced together.
 */
const receiptRoot = option('receipts') ?? 'tests/reports/muse3jsparity/wo';
const only = option('only')?.split(',').map(value => value.trim()).filter(Boolean);
const planOnly = argv.includes('--plan-only');
if (!pool.startsWith('tests/reports/') || pool.includes('..')) throw new Error('Pool must stay under tests/reports');

/** Gates whose receipts require a typed acceptance artifact from a dedicated producer. */
const ACCEPTANCE_OWNED = new Set(['l01', 'l02', 'q02']);
/** Gates bound by the 30-minute comparison window; they must be minted last. */
const FRESHNESS_BOUND = ['k1', 'v01', 'v02'];

const requirements = loadMuse301ExecutionRequirements(root) as readonly {
  readonly id: string; readonly gates: readonly string[]; readonly proofGates?: readonly string[];
  readonly tests?: readonly string[];
}[];

const gateTests = new Map<string, Set<string>>();
for (const requirement of requirements) {
  for (const gate of requirement.proofGates ?? requirement.gates) {
    const entry = gateTests.get(gate) ?? new Set<string>();
    for (const file of requirement.tests ?? []) entry.add(file);
    gateTests.set(gate, entry);
  }
}

const isBrowserSpec = (file: string): boolean => /^tests\/browser\//.test(file) || /\.spec\.ts$/.test(file);
const wanted = (gate: string): boolean => (!only || only.includes(gate)) && !ACCEPTANCE_OWNED.has(gate);
const targets = [...gateTests.entries()].filter(([gate, tests]) => wanted(gate) && tests.size > 0);
const mintable = targets.filter(([gate]) => !FRESHNESS_BOUND.includes(gate)).map(([gate]) => gate).sort();
const deferred = targets.filter(([gate]) => FRESHNESS_BOUND.includes(gate)).map(([gate]) => gate).sort();

const allFiles = [...new Set(targets.flatMap(([, tests]) => [...tests]))].sort();
const nodeSuites = allFiles.filter(file => !isBrowserSpec(file));
const browserSpecs = allFiles.filter(isBrowserSpec);

if (planOnly) {
  console.log(JSON.stringify({
    pool, receiptRoot, gates: targets.length, mintable: mintable.length, deferred,
    skippedAcceptanceOwned: [...ACCEPTANCE_OWNED],
    distinctFiles: allFiles.length, nodeSuites: nodeSuites.length, browserSpecs: browserSpecs.length,
    browserInvocationsAvoided: targets.reduce((total, [, tests]) => total + [...tests].filter(isBrowserSpec).length, 0) - browserSpecs.length,
  }, null, 1));
  process.exit(0);
}

mkdirSync(resolve(root, pool), { recursive: true });
const source = sourceIdentity(root);
const run = (command: readonly string[], logPath: string): number => {
  const result = spawnSync(command[0]!, command.slice(1), { cwd: root, encoding: 'utf8',
    env: { ...process.env }, timeout: 3_600_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(resolve(root, logPath), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  return result.status ?? 1;
};

const poolNodePath = relative(root, resolve(root, pool, 'node-suites.json'));
if (nodeSuites.length && !existsSync(resolve(root, poolNodePath))) {
  console.log(`pooling ${nodeSuites.length} node suites`);
  const code = run(['pnpm', 'exec', 'vitest', 'run', ...nodeSuites, '--reporter=json',
    `--outputFile=${poolNodePath}`], relative(root, resolve(root, pool, 'node-suites.log')));
  if (code !== 0) console.log('node pool reported failures; per-gate minting will surface which gates are affected');
}

/*
 * Browser specs are pooled one file per report. Playwright's json reporter writes a
 * single file, so a per-spec report keeps a failure attributable to its own spec
 * instead of discarding an entire batch, and lets a rerun replace just that file.
 */
for (const spec of browserSpecs) {
  const name = spec.replace(/[^a-zA-Z0-9]+/g, '-');
  const reportPath = relative(root, resolve(root, pool, `${name}.json`));
  if (existsSync(resolve(root, reportPath))) continue;
  console.log(`pooling ${spec}`);
  const result = spawnSync('pnpm', ['exec', 'playwright', 'test', spec, '--reporter=line,json'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: resolve(root, reportPath) },
      timeout: 3_600_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(resolve(root, pool, `${name}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  if ((result.status ?? 1) !== 0) console.log(`  ${spec} reported failures`);
}

if (!sameSource(source, sourceIdentity(root))) {
  throw new Error('Source changed during collection; receipts would not validate. Freeze the tree and rerun.');
}

const mint = (gate: string): { gate: string; valid: boolean; detail: string } => {
  const output = `${receiptRoot}/${gate}`;
  const result = spawnSync('pnpm', ['exec', 'tsx', '--tsconfig', 'tsconfig.base.json',
    'tools/release/work-order-producer.ts', gate, output, '--pool', pool],
    { cwd: root, encoding: 'utf8', timeout: 3_600_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 });
  const validation = resolve(root, output, 'validation.json');
  const valid = existsSync(validation) && JSON.parse(readFileSync(validation, 'utf8')).valid === true;
  const errors = existsSync(validation) ? JSON.parse(readFileSync(validation, 'utf8')).errors ?? [] : [];
  return { gate, valid, detail: valid ? 'receipt valid' : (errors[0] ?? (result.stderr ?? '').trim().split('\n').pop() ?? 'no validation written') };
};

const results = [...mintable, ...deferred].map(gate => {
  const outcome = mint(gate);
  console.log(`${outcome.valid ? 'OK  ' : 'FAIL'} ${gate}: ${outcome.detail}`);
  return outcome;
});

const manifest = {
  schema: 'muse301-evidence-manifest/v1', generatedAt: new Date().toISOString(), source,
  receipts: results.filter(result => result.valid).map(result => {
    const path = `${receiptRoot}/${result.gate}/validation.json`;
    return JSON.parse(readFileSync(resolve(root, path), 'utf8')).receipt;
  }),
};
const manifestPath = 'tests/reports/muse3jsparity/evidence-manifest.json';
writeFileSync(resolve(root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ minted: results.length, valid: results.filter(r => r.valid).length,
  failed: results.filter(r => !r.valid).map(r => r.gate), manifest: manifestPath }, null, 1));
