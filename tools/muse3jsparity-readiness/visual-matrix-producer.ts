import { existsSync, readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { relative, resolve } from 'node:path';
import { artifact, newRunId, sameSource, sourceIdentity, validateReceipt, writeImmutableJson, type Artifact, type ProducerReceipt } from './evidence-lineage';
import { loadMuse301ExecutionRequirements } from './requirements';

interface ReportAssertion { file: string; title: string; passed: boolean }
const root = process.cwd();
const output = resolve(process.argv[2] ?? `tests/reports/muse3jsparity/v01-receipts/${newRunId()}`);
const matrixPath = process.argv[3] ?? 'tests/reports/muse3jsparity/visual-matrix-301.json';
const reportPaths = process.argv.slice(4);
if (!existsSync(resolve(root, matrixPath))) throw new Error(`Missing V01 matrix: ${matrixPath}`);
if (!reportPaths.length) throw new Error('V01 producer requires source-bound JSON test reports');
const source = sourceIdentity(root);
const requirements = loadMuse301ExecutionRequirements(root).filter(item => (item.proofGates ?? item.gates).includes('v01'));
const normalized = (path: string): string => path.replace(/\\/g, '/').replace(/^.*?(tests\/)/, '$1');
function assertions(report: any): ReportAssertion[] {
  const rows: ReportAssertion[] = [];
  for (const suite of report.testResults ?? []) {
    const file = normalized(String(suite.name ?? ''));
    for (const test of suite.assertionResults ?? []) if (typeof test.fullName === 'string') rows.push({ file, title: test.fullName, passed: test.status === 'passed' });
  }
  const visit = (suites: any[]): void => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        const file = normalized(String(spec.file ?? suite.file ?? ''));
        for (const test of spec.tests ?? []) rows.push({ file, title: String(spec.title ?? ''), passed: test.status === 'expected' && test.results?.length > 0 && test.results.every((result: any) => result.status === 'passed') });
      }
      visit(suite.suites ?? []);
    }
  };
  visit(report.suites ?? []);
  return rows;
}
const reports = reportPaths.map(path => {
  const data = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const rawStart = data.stats?.startTime ?? data.startTime;
  const startMs = typeof rawStart === 'number' ? rawStart : Date.parse(String(rawStart ?? ''));
  const durationMs = Number(data.stats?.duration ?? 0);
  const rawEnd = data.endTime;
  const endMs = rawEnd === undefined ? startMs + durationMs : typeof rawEnd === 'number' ? rawEnd : Date.parse(String(rawEnd));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs || endMs > Date.now()) throw new Error(`Invalid V01 report timing: ${path}`);
  return { path, ref: artifact(root, path), rows: assertions(data), startMs, endMs };
});
const startedAt = new Date(Math.min(...reports.map(report => report.startMs))).toISOString();
const endedAt = new Date(Math.max(...reports.map(report => report.endMs))).toISOString();
const proofFor = (requirement: typeof requirements[number]) => {
  const required = requirement.assertions ?? [];
  const candidates = reports.flatMap(report => report.rows.filter(row => row.passed && requirement.tests.includes(row.file)).map(row => ({ ...row, report: report.path })));
  if (required.length) {
    if (required.length !== 1) throw new Error(`V01 task needs exactly one required assertion: ${requirement.id}`);
    const matches = candidates.filter(row => row.file === required[0]!.file && row.title === required[0]!.title);
    if (matches.length !== 1) throw new Error(`V01 required assertion is not uniquely passed: ${requirement.id}/${required[0]!.title}`);
    return { task: requirement.id, report: matches[0]!.report, testFile: matches[0]!.file, testTitle: matches[0]!.title };
  }
  if (!candidates.length) throw new Error(`V01 task has no passed allowed assertion: ${requirement.id}`);
  const first = candidates[0]!;
  return { task: requirement.id, report: first.report, testFile: first.file, testTitle: first.title };
};
const matrix = JSON.parse(readFileSync(resolve(root, matrixPath), 'utf8'));
const nested: Artifact[] = [artifact(root, matrixPath), ...reports.map(report => report.ref), ...(matrix.artifacts ?? [])];
const artifacts = [...new Map(nested.map(item => [item.path, item])).values()];
const receipt: ProducerReceipt = {
  schema: 'muse3jsparity-producer/v1', runId: newRunId(), gate: 'v01', tasks: requirements.map(item => item.id),
  command: ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', 'tools/muse3jsparity-readiness/visual-matrix-producer.ts', relative(root, output), matrixPath, ...reportPaths],
  cwd: root, exitCode: 0, startedAt, endedAt, source,
  claimSurface: 'Seven-family source-frozen Aura root/runtime versus three@0.185.1 paired visual matrix',
  environment: { browser: 'retained Playwright reports', backend: 'browser-reported WebGL2 production rendering', hardware: `${process.env.AURA3D_REMOTE_PROVIDER ?? 'remote'}:${process.env.AURA3D_REMOTE_WORKER_ID ?? hostname()}` },
  artifacts, packages: [], tarballs: [], acceptance: matrixPath,
  proofs: requirements.map(proofFor),
};
if (!sameSource(source, sourceIdentity(root))) receipt.exitCode = 1;
const saved = writeImmutableJson(resolve(output, 'v01.receipt.json'), receipt);
const ref = { ...saved, path: relative(root, saved.path) };
const expected = {
  source, gate: 'v01', tasks: requirements.map(item => item.id), now: Date.now(),
  taskTests: Object.fromEntries(requirements.map(item => [item.id, item.tests])),
  taskAssertions: Object.fromEntries(requirements.filter(item => item.assertions).map(item => [item.id, item.assertions!])),
};
const verified = validateReceipt(root, ref, expected);
writeImmutableJson(resolve(output, 'validation.json'), { source, receipt: ref, valid: verified.valid, errors: verified.errors });
console.log(JSON.stringify({ output: relative(root, output), receipt: ref, valid: verified.valid, errors: verified.errors }));
process.exitCode = verified.valid ? 0 : 1;
