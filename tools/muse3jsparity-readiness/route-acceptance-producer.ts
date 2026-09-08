// Run on the remote evidence worker: canonical replay decodes route captures
// and verifies every asset blob. It never repairs a failing input in place.
import { mkdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { produceRouteAcceptance, produceTypedAssetAcceptance } from './route-acceptance';
import { artifact, newRunId, sameSource, sourceIdentity, writeImmutableJson, type ProducerReceipt } from './evidence-lineage';

const root = process.cwd();
const kind = process.argv[2];
if (kind !== 'routes' && kind !== 'assets') throw new Error('Usage: route-acceptance-producer.ts <routes|assets> [output-directory]');
const output = resolve(root, process.argv[3] ?? `tests/reports/muse3jsparity/route-acceptance/${newRunId()}`);
if (relative(root, output).startsWith('..')) throw new Error('Evidence output must be inside the repository');
mkdirSync(output, { recursive: true });
const source = sourceIdentity(root), startedAt = new Date().toISOString();
const result = kind === 'routes' ? produceRouteAcceptance(root, source) : produceTypedAssetAcceptance(root);
const stable = sameSource(source, sourceIdentity(root));
const reportPath = resolve(output, `${kind}.json`);
writeImmutableJson(reportPath, result);
const report = artifact(root, relative(root, reportPath));
const tasks = kind === 'routes' ? ['3.0.1:Q02.task.1', '3.0.1:Q02.check.1'] : ['3.0.1:Q02.task.3'];
const inputs = [...new Map(result.files.map(file => [file.path, { path: file.path, sha256: file.sha256 }])).values()];
const receipt: ProducerReceipt = {
  schema: 'muse3jsparity-producer/v1', runId: newRunId(), gate: 'q02', tasks,
  command: process.argv, cwd: root, startedAt, endedAt: new Date().toISOString(),
  exitCode: stable && result.failures.length === 0 ? 0 : 1, source,
  claimSurface: kind === 'assets' ? 'CLI asset pipeline' : 'createAuraApp root safe API',
  environment: { browser: 'retained browser evidence', backend: 'canonical artifact replay', hardware: 'remote evidence worker' },
  artifacts: [report, ...inputs], packages: [], tarballs: [],
  routeProofs: tasks.map(task => ({ task, kind, artifact: report })),
};
writeImmutableJson(resolve(output, 'receipt.json'), receipt);
console.log(JSON.stringify({ output: relative(root, output), kind, sourceStable: stable, failures: result.failures, exitCode: receipt.exitCode }));
process.exitCode = receipt.exitCode;
