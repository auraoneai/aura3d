/**
 * Canonical producer for a muse3jsparity work-order gate.
 *
 * The readiness aggregate reduces over per-work-order receipts supplied through
 * `--evidence-manifest`; it does not itself prove the 757 original PRD obligations.
 * Each obligation names the test files that execute its public production path, so a
 * gate receipt is earned by running exactly those files and binding every obligation
 * to a real passing assertion inside the retained, hashed report.
 *
 * This producer is deliberately generic: proofs come from each requirement's own
 * declared `tests` entries, never from a hardcoded task-to-file table, so it cannot
 * credit an obligation to a test the ledger does not name for it.
 *
 * Usage: work-order-producer.ts <gate> <tests/reports/... output dir>
 */
import { mkdirSync, readFileSync, writeFileSync, closeSync, openSync } from 'node:fs';
import { hostname } from 'node:os';
import { relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { artifact, newRunId, sameSource, sourceIdentity, validateReceipt, writeImmutableJson,
  type Artifact, type ProducerReceipt } from '../muse3jsparity-readiness/evidence-lineage';
import { loadMuse301ExecutionRequirements } from '../muse3jsparity-readiness/requirements';

const root = process.cwd();
const gate = process.argv[2];
const outputArg = process.argv[3];
if (!gate || !outputArg) throw new Error('Usage: work-order-producer.ts <gate> <tests/reports/dir>');
const output = relative(root, resolve(root, outputArg));
if (output.startsWith('..') || !output.startsWith('tests/reports/')) throw new Error('Output must stay under tests/reports');
mkdirSync(resolve(root, output), { recursive: true });

const pathInRoot = (path: string): string => relative(root, resolve(path));
const reference = (path: string): Artifact => artifact(root, pathInRoot(path));
const source = sourceIdentity(root);
const startedAt = new Date().toISOString();

const requirements = loadMuse301ExecutionRequirements(root)
  .filter(item => (item.proofGates ?? item.gates).includes(gate));
if (!requirements.length) throw new Error(`No requirements declare gate ${gate}`);

// Only obligations that name test files are proven here. Obligations carrying a typed
// acceptance contract (l01/l02 release evidence, route/marketing/registry acceptance)
// are owned by their dedicated producers and are not fabricated by this one.
const testTasks = requirements.filter(item => (item.tests ?? []).length > 0);
const vitestFiles = [...new Set(testTasks.flatMap(item => item.tests ?? []))]
  .filter(file => /^tests\/(unit|integration)\//.test(file)).sort();
const otherFiles = [...new Set(testTasks.flatMap(item => item.tests ?? []))]
  .filter(file => !/^tests\/(unit|integration)\//.test(file)).sort();

function run(command: string[], name: string): { code: number; log: Artifact } {
  const logPath = resolve(root, output, `${name}.log`);
  const fd = openSync(logPath, 'w');
  let result;
  try {
    result = spawnSync(command[0]!, command.slice(1), { cwd: root, env: process.env,
      stdio: ['ignore', fd, fd], timeout: 3_600_000, killSignal: 'SIGKILL' });
  } finally { closeSync(fd); }
  return { code: result!.status ?? 1, log: reference(logPath) };
}

const reports: Artifact[] = [];
const logs: Artifact[] = [];
const reportPaths: string[] = [];
if (vitestFiles.length) {
  const reportPath = pathInRoot(resolve(root, output, 'vitest.json'));
  const executed = run(['pnpm', 'exec', 'vitest', 'run', ...vitestFiles, '--reporter=json',
    `--outputFile=${reportPath}`], 'vitest');
  logs.push(executed.log);
  if (executed.code !== 0) throw new Error(`${gate}: named unit/integration suite failed`);
  reports.push(reference(reportPath)); reportPaths.push(reportPath);
}
if (otherFiles.length) {
  const reportPath = pathInRoot(resolve(root, output, 'browser.json'));
  const executed = run(['pnpm', 'exec', 'playwright', 'test', ...otherFiles,
    '--reporter=line,json'], 'browser');
  logs.push(executed.log);
  if (executed.code !== 0) throw new Error(`${gate}: named browser suite failed`);
  reports.push(reference(reportPath)); reportPaths.push(reportPath);
}

/** Find a passing assertion for `file` in the retained reports, or fail loudly. */
const passingAssertion = (file: string): { report: string; title: string } => {
  for (const reportPath of reportPaths) {
    const report = JSON.parse(readFileSync(resolve(root, reportPath), 'utf8'));
    for (const suite of report.testResults ?? []) {
      const name = String(suite.name ?? '').replace(/\\/g, '/');
      if (name !== file && !name.endsWith(`/${file}`)) continue;
      const hit = (suite.assertionResults ?? []).find((a: any) => a.status === 'passed' && typeof a.fullName === 'string');
      if (hit) return { report: reportPath, title: hit.fullName };
    }
    const visit = (suites: any[]): { report: string; title: string } | undefined => {
      for (const suite of suites ?? []) {
        for (const spec of suite.specs ?? []) {
          const specFile = String(spec.file ?? suite.file ?? '').replace(/\\/g, '/');
          if (specFile !== file && !file.endsWith(`/${specFile}`) && !specFile.endsWith(`/${file}`)) continue;
          if ((spec.tests ?? []).some((t: any) => (t.results ?? []).some((r: any) => r.status === 'passed')))
            return { report: reportPath, title: spec.title };
        }
        const nested = visit(suite.suites ?? []);
        if (nested) return nested;
      }
      return undefined;
    };
    const found = visit(report.suites ?? []);
    if (found) return found;
  }
  throw new Error(`${gate}: no passing assertion retained for ${file}`);
};

const proofs = testTasks.flatMap(item => (item.tests ?? []).map(file => {
  const { report, title } = passingAssertion(file);
  return { task: item.id, report, testFile: file, testTitle: title };
}));

const receiptPath = pathInRoot(resolve(root, output, `${gate}.receipt.json`));
const receipt: ProducerReceipt = {
  schema: 'muse3jsparity-producer/v1', runId: newRunId(), gate,
  tasks: requirements.map(item => item.id),
  command: ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json',
    'tools/release/work-order-producer.ts', gate, output],
  cwd: root, exitCode: 0, startedAt, endedAt: new Date().toISOString(), source,
  claimSurface: `${gate} work-order obligations proven by their ledger-named tests`,
  environment: { browser: otherFiles.length ? 'Chromium' : 'not applicable',
    backend: otherFiles.length ? 'browser and node' : 'node',
    hardware: process.env.AURA_EVIDENCE_HARDWARE ?? `local ${hostname()}` },
  artifacts: [...reports, ...logs], packages: [], tarballs: [], proofs,
};
if (!sameSource(source, sourceIdentity(root))) receipt.exitCode = 1;
const written = writeImmutableJson(resolve(root, receiptPath), receipt);
const ref = { ...written, path: receiptPath };
const validation = validateReceipt(root, ref, {
  source, gate, tasks: requirements.map(item => item.id), now: Date.now(),
  taskTests: Object.fromEntries(requirements.map(item => [item.id, item.tests ?? []])),
  taskAssertions: Object.fromEntries(requirements.filter(item => item.assertions).map(item => [item.id, item.assertions!])),
});
writeFileSync(resolve(root, output, 'validation.json'), `${JSON.stringify({ ...validation, receipt: ref }, null, 2)}\n`);
console.log(JSON.stringify({ gate, receipt: ref, valid: validation.valid, errors: validation.errors.slice(0, 8) }));
if (!validation.valid) process.exitCode = 1;
