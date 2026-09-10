/**
 * Canonical Q02 producer: the source/route/claims audit gate.
 *
 * Q02 is the only gate whose 23 obligations span four different typed proof
 * families, so no single existing producer can earn it:
 *   - routeAcceptance (routes + assets): canonical replay of retained route and
 *     typed-asset evidence, produced by route-acceptance.ts.
 *   - sourceAuditAcceptance: the AST source audit with hash-bound dispositions.
 *   - commandAcceptance: child receipts for each declared command, each carrying
 *     its own output log.
 *   - finalClaimsAcceptance: every public claim bound to a validated receipt.
 *
 * This producer runs each canonical validator, binds every input it relies on by
 * SHA-256, and emits one fail-closed receipt. It computes no verdict of its own:
 * `validateReceipt` replays each family independently and rejects a mismatch.
 *
 * Usage: q02-producer.ts [output-directory]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, closeSync, openSync } from 'node:fs';
import { hostname } from 'node:os';
import { relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { artifact, newRunId, sameSource, sourceIdentity, validateReceipt, writeImmutableJson,
  type Artifact, type ProducerReceipt } from '../muse3jsparity-readiness/evidence-lineage';
import { loadMuse301ExecutionRequirements } from '../muse3jsparity-readiness/requirements';
import { produceRouteAcceptance, produceTypedAssetAcceptance } from '../muse3jsparity-readiness/route-acceptance';
import { auditSource } from '../muse3jsparity-docs-audit/index';
import { validateFinalClaims } from '../muse3jsparity-docs-audit/claims';

const root = process.cwd();
const output = relative(root, resolve(root, process.argv[2] ?? `tests/reports/muse3jsparity/q02/${newRunId()}`));
if (output.startsWith('..') || !output.startsWith('tests/reports/')) throw new Error('Q02 output must stay under tests/reports');
mkdirSync(resolve(root, output), { recursive: true });

const reference = (path: string): Artifact => artifact(root, relative(root, resolve(root, path)));
const source = sourceIdentity(root);
const startedAt = new Date().toISOString();
const requirements = loadMuse301ExecutionRequirements(root).filter(item => (item.proofGates ?? item.gates).includes('q02'));
if (!requirements.length) throw new Error('No requirements declare gate q02');

const artifacts: Artifact[] = [];
const bind = (path: string): Artifact => {
  const ref = reference(path);
  if (!artifacts.some(a => a.path === ref.path)) artifacts.push(ref);
  return ref;
};
const writeArtifact = (name: string, value: unknown): Artifact => {
  const path = relative(root, resolve(root, output, name));
  writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`);
  return bind(path);
};

/* Route + typed-asset acceptance: replay the canonical validators. */
const routeProofs: { task: string; kind: 'routes' | 'assets'; artifact: Artifact }[] = [];
const routeReplays = { routes: produceRouteAcceptance(root, source), assets: produceTypedAssetAcceptance(root) } as const;
for (const kind of ['routes', 'assets'] as const) {
  const replay = routeReplays[kind];
  if (replay.failures.length) throw new Error(`Q02 ${kind} acceptance failed: ${replay.failures.slice(0, 3).join('; ')}`);
  const ref = writeArtifact(`${kind}.json`, replay);
  for (const file of replay.files) bind(file.path);
  for (const item of requirements) if (item.routeAcceptance?.kind === kind) routeProofs.push({ task: item.id, kind, artifact: ref });
}

/* Source audit: the AST scan with hash-bound dispositions. */
const reviewPath = 'docs/project/reviews/muse3jsparity-301-combined-source-dispositions.json';
const auditReport = {
  ...auditSource(root, JSON.parse(readFileSync(resolve(root, reviewPath), 'utf8'))),
  reviewInput: reference(reviewPath), generatedAt: new Date().toISOString(),
  command: ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', 'tools/muse3jsparity-docs-audit/index.ts'], cwd: root,
};
if (auditReport.status !== 'source-audit-passed') throw new Error(`Q02 source audit blocked: ${auditReport.unresolved.length} unresolved`);
const auditRef = writeArtifact('source-audit.json', auditReport);
bind(reviewPath);
for (const ref of [...auditReport.source.files, ...(auditReport.evidence ?? [])]) bind(ref.path);
const sourceAuditProofs = requirements.filter(item => item.sourceAuditAcceptance).map(item => ({ task: item.id, artifact: auditRef.path }));

/* Command proofs: one child receipt per declared command, each retaining its log. */
const commandProofs: { task: string; receipts: Artifact[] }[] = [];
for (const item of requirements.filter(r => r.commandAcceptance)) {
  const receipts: Artifact[] = [];
  for (const [index, command] of item.commandAcceptance!.commands.entries()) {
    const name = `${item.id.replace(/[^a-zA-Z0-9]+/g, '-')}-${index}`;
    const logPath = relative(root, resolve(root, output, `${name}.log`));
    const fd = openSync(resolve(root, logPath), 'w');
    let status: number | null;
    try {
      const run = spawnSync(command[0]!, command.slice(1), { cwd: root, env: process.env,
        stdio: ['ignore', fd, fd], timeout: 3_600_000, killSignal: 'SIGKILL' });
      status = run.status;
    } finally { closeSync(fd); }
    if (status !== 0) throw new Error(`Q02 required command failed: ${command.join(' ')}`);
    const child: ProducerReceipt = {
      schema: 'muse3jsparity-producer/v1', runId: newRunId(), gate: 'q02', tasks: [item.id],
      command: [...command], cwd: root, exitCode: 0, startedAt, endedAt: new Date().toISOString(), source,
      claimSurface: 'release tooling',
      environment: { browser: 'not applicable', backend: 'node', hardware: `local ${hostname()}` },
      artifacts: [bind(logPath)], packages: [], tarballs: [],
    };
    const childPath = relative(root, resolve(root, output, `${name}.receipt.json`));
    const written = writeImmutableJson(resolve(root, childPath), child);
    receipts.push(bind(childPath));
    void written;
  }
  commandProofs.push({ task: item.id, receipts });
}

/* Final claims: every public claim bound to a validated receipt. */
const claimsInputPath = 'tests/reports/muse3jsparity-final-claims-input.json';
if (!existsSync(resolve(root, claimsInputPath))) throw new Error(`Q02 final-claims input missing: ${claimsInputPath}`);
const claimsInput = JSON.parse(readFileSync(resolve(root, claimsInputPath), 'utf8'));
const claimsReplay = validateFinalClaims(root, claimsInput, Date.now());
if (claimsReplay.status !== 'verified') throw new Error(`Q02 final claims unverified: ${(claimsReplay.errors ?? []).slice(0, 3).join('; ')}`);
const claimsRef = writeArtifact('final-claims.json', { ...claimsReplay, validationInput: reference(claimsInputPath) });
bind(claimsInputPath);
const finalClaimsProofs = requirements.filter(item => item.finalClaimsAcceptance).map(item => ({ task: item.id, artifact: claimsRef.path }));

const receipt: ProducerReceipt = {
  schema: 'muse3jsparity-producer/v1', runId: newRunId(), gate: 'q02', tasks: requirements.map(item => item.id),
  command: ['pnpm', 'exec', 'tsx', '--tsconfig', 'tsconfig.base.json', 'tools/release/q02-producer.ts', output],
  cwd: root, exitCode: 0, startedAt, endedAt: new Date().toISOString(), source,
  claimSurface: 'release tooling',
  environment: { browser: 'retained browser evidence', backend: 'canonical artifact replay', hardware: `local ${hostname()}` },
  artifacts, packages: [], tarballs: [],
  routeProofs, sourceAuditProofs, commandProofs, finalClaimsProofs,
  proofs: requirements.filter(item => (item.tests ?? []).length > 0).flatMap(item => []),
};
if (!sameSource(source, sourceIdentity(root))) receipt.exitCode = 1;
const receiptPath = relative(root, resolve(root, output, 'q02.receipt.json'));
const saved = writeImmutableJson(resolve(root, receiptPath), receipt);
const ref = { ...saved, path: receiptPath };
const validation = validateReceipt(root, ref, {
  source, gate: 'q02', tasks: requirements.map(item => item.id), now: Date.now(),
  taskTests: Object.fromEntries(requirements.map(item => [item.id, item.tests ?? []])),
  taskRoutes: Object.fromEntries(requirements.filter(r => r.routeAcceptance).map(r => [r.id, r.routeAcceptance!])),
  taskSourceAudits: Object.fromEntries(requirements.filter(r => r.sourceAuditAcceptance).map(r => [r.id, r.sourceAuditAcceptance!])),
  taskCommands: Object.fromEntries(requirements.filter(r => r.commandAcceptance).map(r => [r.id, r.commandAcceptance!])),
  taskFinalClaims: Object.fromEntries(requirements.filter(r => r.finalClaimsAcceptance).map(r => [r.id, r.finalClaimsAcceptance!])),
});
writeFileSync(resolve(root, output, 'validation.json'), `${JSON.stringify({ ...validation, receipt: ref }, null, 2)}\n`);
console.log(JSON.stringify({ gate: 'q02', receipt: ref, valid: validation.valid, errors: validation.errors.slice(0, 8) }));
if (!validation.valid) process.exitCode = 1;
