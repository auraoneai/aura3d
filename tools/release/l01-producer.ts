/** Canonical remote L01 producer: build, pack once, replay all exact-package
 * checks, retain the preflight, and emit one fail-closed gate receipt. */
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { artifact, newRunId, sameSource, sourceIdentity, validateReceipt, writeImmutableJson, type Artifact, type ProducerReceipt } from '../muse3jsparity-readiness/evidence-lineage';
import { loadMuse301ExecutionRequirements } from '../muse3jsparity-readiness/requirements';
// @ts-expect-error Existing release module is JavaScript and has no declaration file.
import { buildReleaseArtifactManifest } from './build-artifact-manifest.mjs';
// @ts-expect-error Existing release module is JavaScript and has no declaration file.
import { packageAcceptanceDocument, producePackageAcceptance, recordBuild, recordCommand } from './package-acceptance.mjs';

interface PackageAcceptanceEntry { name: string; manifest: string; tarball: string; sha256: string }
interface PackageReplay { acceptance: { schema: 'muse301-packages/v1'; packages: PackageAcceptanceEntry[] }; source: unknown; artifacts: Artifact[] }
const root = process.cwd();
const runId = newRunId();
const output = resolve(root, process.argv[2] ?? `tests/reports/muse3jsparity/l01/${runId}`);
if (relative(root, output).startsWith('..')) throw new Error('L01 output must remain inside the repository');
mkdirSync(output, { recursive: true });
const pathInRoot = (path: string) => relative(root, resolve(path));
const reference = (path: string): Artifact => artifact(root, pathInRoot(path));
const source = sourceIdentity(root);
const startedAt = new Date().toISOString();
const planPath = 'tests/reports/release-tarballs/release-plan.json';
const commandReceipts: Record<string, string> = {};

function run(command: string[], name: string, extraEnv: NodeJS.ProcessEnv = {}): { code: number; log: Artifact; startedAt: string; endedAt: string } {
  const logPath = resolve(output, `${name}.log`), fd = openSync(logPath, 'wx');
  const commandStartedAt = new Date().toISOString();
  let result;
  try {
    result = spawnSync(command[0]!, command.slice(1), {
      cwd: root, env: {...process.env, ...extraEnv}, stdio: ['ignore', fd, fd],
      timeout: 3_600_000, killSignal: 'SIGKILL',
    });
  } finally { closeSync(fd); }
  return {code: result!.status ?? 1, log: reference(logPath), startedAt: commandStartedAt, endedAt: new Date().toISOString()};
}

function writeJson(path: string, value: unknown): Artifact {
  writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`, {flag: 'wx'});
  return reference(path);
}

const buildPath = pathInRoot(resolve(output, 'build.json'));
const build = recordBuild(root, {outputPath: buildPath});
if (build.exitCode !== 0) throw new Error(`Remote build failed: ${build.validationErrors.join('; ')}`);

const packCommand = ['node','tools/release/publish-all.mjs','--pack-only'];
const pack = run(packCommand, 'pack');
if (pack.code !== 0) throw new Error('Exact pack-once command failed');

const manifest = buildReleaseArtifactManifest(root, planPath);
writeFileSync(resolve(root, 'docs/project/release-artifacts.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const manifestRef = reference('docs/project/release-artifacts.json');
const versioned = run(['pnpm','verify:versioned-release'], 'versioned-release');
if (versioned.code !== 0) throw new Error('Versioned release manifest verification failed');

const kinds = ['frozenLock','source','installed','compatibility','optionalPeers','imports','exports','smoke','provenance','bundleBudgets','leanIsolation'] as const;
const reportPaths: Record<(typeof kinds)[number], string> = {
  frozenLock:'tests/reports/release-frozen-lock.json', source:'tests/reports/agent-templates.json', installed:'tests/reports/installed-template-lifecycle.json',
  compatibility:'tests/reports/public-surface-diff-3.0.1.json', optionalPeers:'tests/reports/package-clean-install.json', imports:'tests/reports/import-smoke.json',
  exports:'tests/reports/exports.json', smoke:'tests/reports/package-install-smoke.json', provenance:'tests/reports/package-provenance.json',
  bundleBudgets:'tests/reports/bundle-size.json', leanIsolation:'tests/reports/installed-tree-shaking.json',
};
for (const kind of kinds) {
  const outputPath = pathInRoot(resolve(output, `command-${kind}.json`));
  const receipt = recordCommand(root, {kind, planPath, reportPath: reportPaths[kind], outputPath});
  if (receipt.exitCode !== 0) throw new Error(`${kind} failed: ${receipt.validationErrors.join('; ')}`);
  commandReceipts[kind] = outputPath;
}

const validation = {
  planPath,
  commands: {build: buildPath, ...commandReceipts},
};
const validationPath = pathInRoot(resolve(output, 'package-validation-input.json'));
const validationRef = writeJson(validationPath, validation);
const replay = producePackageAcceptance(root, validation) as PackageReplay;
const acceptance = packageAcceptanceDocument(replay, validationRef);
const acceptancePath = pathInRoot(resolve(output, 'package-acceptance.json'));
const acceptanceRef = writeJson(acceptancePath, acceptance);

const allInputs = [...new Map([...replay.artifacts, validationRef, manifestRef, pack.log, versioned.log].map(item => [item.path, item])).values()];
const packagePaths = new Set(replay.acceptance.packages.map((item: PackageAcceptanceEntry) => item.manifest));
const tarballPaths = new Set(replay.acceptance.packages.map((item: PackageAcceptanceEntry) => item.tarball));
const packageRefs = allInputs.filter(item => packagePaths.has(item.path));
const tarballRefs = allInputs.filter(item => tarballPaths.has(item.path));
const packageArtifacts = allInputs.filter(item => !packagePaths.has(item.path) && !tarballPaths.has(item.path));
const packageReceiptPath = pathInRoot(resolve(output, 'package-phase.receipt.json'));
const packageReceipt: ProducerReceipt & {releasePhase: {phase: 'packages'; report: Artifact}} = {
  schema:'muse3jsparity-producer/v1', runId, gate:'l01', tasks:['infrastructure:l01-packages'],
  command:['pnpm','exec','tsx','--tsconfig','tsconfig.base.json','tools/release/l01-producer.ts',pathInRoot(output)],
  cwd:root, exitCode:0, startedAt, endedAt:new Date().toISOString(), source,
  claimSurface:'exact 3.0.1 package and scaffold artifacts',
  environment:{browser:'scaffold browser smoke',backend:'remote Linux exact-package replay',hardware:`${process.env.AURA3D_REMOTE_PROVIDER}:${process.env.AURA3D_REMOTE_WORKER_ID}@${hostname()}`},
  artifacts:[acceptanceRef,...packageArtifacts], packages:packageRefs, tarballs:tarballRefs, acceptance:acceptancePath,
  releasePhase:{phase:'packages',report:acceptanceRef},
};
const packageReceiptRef = writeImmutableJson(resolve(root, packageReceiptPath), packageReceipt);
const boundPackageReceipt = {...packageReceiptRef, path:packageReceiptPath};

const docsCommand = ['pnpm','check:agent-docs'];
const docs = run(docsCommand, 'agent-docs');
const docsReceiptPath = pathInRoot(resolve(output, 'agent-docs.receipt.json'));
const docsReceipt: ProducerReceipt = {
  schema:'muse3jsparity-producer/v1',runId:newRunId(),gate:'l01-agent-docs-command',tasks:['infrastructure:l01-agent-docs'],command:docsCommand,cwd:root,
  exitCode:docs.code,startedAt:docs.startedAt,endedAt:docs.endedAt,source,claimSurface:'agent documentation claims',
  environment:{browser:'not applicable',backend:'node',hardware:`remote Linux ${hostname()}`},artifacts:[docs.log],packages:[],tarballs:[],
};
const docsReceiptWritten = writeImmutableJson(resolve(root, docsReceiptPath), docsReceipt);
const docsReceiptRef = {...docsReceiptWritten,path:docsReceiptPath};
if (docs.code !== 0) throw new Error('Agent docs command failed');

const testFiles = [
  'tests/unit/engine/lean-game-surface.test.ts',
  'tests/unit/tools/muse3jsparity-requirements.test.ts',
  'tests/unit/rendering/shader-brdf-reference.test.ts',
];
const testReportPath = pathInRoot(resolve(output, 'l01-tests.json'));
const tests = run(['pnpm','exec','vitest','run',...testFiles,'--reporter=json',`--outputFile=${testReportPath}`], 'l01-tests');
if (tests.code !== 0) throw new Error('L01 focused assertion suite failed');
const testReportRef = reference(testReportPath);
const testReport = JSON.parse(readFileSync(resolve(root,testReportPath),'utf8'));
const firstAssertion = (file: string): string => {
  const suite = (testReport.testResults ?? []).find((item: any) => String(item.name).replace(/\\/g,'/').endsWith(`/${file}`));
  const assertion = suite?.assertionResults?.find((item: any) => item.status === 'passed' && typeof item.fullName === 'string');
  if (!assertion) throw new Error(`No passing assertion retained for ${file}`);
  return assertion.fullName;
};

const preflightCommand = ['node','tools/release/publish-all.mjs','--from-plan',planPath,'--dry-run'];
const preflight = run(preflightCommand, 'preflight');
const preflightReceiptPath = pathInRoot(resolve(output, 'preflight.receipt.json'));
const preflightReceipt: ProducerReceipt & {releasePhase:{phase:'preflight';log:Artifact}} = {
  schema:'muse3jsparity-producer/v1',runId:newRunId(),gate:'l01-preflight-command',tasks:['infrastructure:l01-preflight'],command:preflightCommand,cwd:root,
  exitCode:preflight.code,startedAt:preflight.startedAt,endedAt:preflight.endedAt,source,claimSurface:'npm unpublished-version preflight against exact archives',
  environment:{browser:'not applicable',backend:'npm registry read-only preflight',hardware:`remote Linux ${hostname()}`},artifacts:[preflight.log],packages:[],tarballs:[],
  releasePhase:{phase:'preflight',log:preflight.log},
};
const preflightReceiptWritten = writeImmutableJson(resolve(root, preflightReceiptPath), preflightReceipt);
const preflightReceiptRef = {...preflightReceiptWritten,path:preflightReceiptPath};
if (preflight.code !== 0) throw new Error('Exact frozen-plan npm preflight failed');

const planRef = reference(planPath);
const sequencePath = pathInRoot(resolve(output, 'preflight-sequence.json'));
const sequenceRef = writeJson(sequencePath, {
  schema:'muse301-release-sequence/v1',source,releasePlan:planRef,packages:boundPackageReceipt,preflight:preflightReceiptRef,
});
const requirements = loadMuse301ExecutionRequirements(root).filter(item => (item.proofGates ?? item.gates).includes('l01'));
const acceptanceTasks = requirements.filter(item => item.acceptance).map(item => item.id);
const sequenceTasks = requirements.filter(item => item.releaseSequenceAcceptance?.mode === 'preflight').map(item => item.id);
const commandTasks = requirements.filter(item => item.commandAcceptance).map(item => item.id);
const testTasks = requirements.filter(item => item.tests.length > 0);
const assertionFile = (task: typeof testTasks[number]): string => {
  if (task.id.startsWith('J3.')) return 'tests/unit/engine/lean-game-surface.test.ts';
  if (task.id.startsWith('L7.')) return 'tests/unit/tools/muse3jsparity-requirements.test.ts';
  return 'tests/unit/rendering/shader-brdf-reference.test.ts';
};
const nested = [boundPackageReceipt, ...packageReceipt.artifacts, ...packageReceipt.packages, ...packageReceipt.tarballs, docsReceiptRef, docs.log, preflightReceiptRef, preflight.log, planRef, sequenceRef, testReportRef, tests.log];
const parentArtifacts = [...new Map(nested.map(item => [item.path,item])).values()];
const parentReceiptPath = pathInRoot(resolve(output, 'l01.receipt.json'));
const parent: ProducerReceipt = {
  schema:'muse3jsparity-producer/v1',runId,gate:'l01',tasks:requirements.map(item=>item.id),
  command:['pnpm','exec','tsx','--tsconfig','tsconfig.base.json','tools/release/l01-producer.ts',pathInRoot(output)],cwd:root,exitCode:0,
  startedAt,endedAt:new Date().toISOString(),source,claimSurface:'3.0.1 exact package, compatibility, scaffold, and release preflight contract',
  environment:{browser:'scaffold/browser reports retained',backend:'remote Linux package and npm preflight',hardware:`${process.env.AURA3D_REMOTE_PROVIDER}:${process.env.AURA3D_REMOTE_WORKER_ID}@${hostname()}`},
  artifacts:[acceptanceRef,...parentArtifacts.filter(item=>item.path!==acceptanceRef.path)],packages:packageRefs,tarballs:tarballRefs,acceptance:acceptancePath,
  acceptanceProofs:acceptanceTasks.map(task=>({task,artifact:acceptancePath,schema:'muse301-packages/v1'})),
  releaseSequenceProofs:sequenceTasks.map(task=>({task,artifact:sequenceRef,mode:'preflight'})),
  commandProofs:commandTasks.map(task=>({task,receipts:[docsReceiptRef]})),
  proofs:testTasks.map(task=>{const file=assertionFile(task);return {task:task.id,report:testReportPath,testFile:file,testTitle:firstAssertion(file)};}),
};
if (!sameSource(source, sourceIdentity(root))) parent.exitCode = 1;
const parentWritten = writeImmutableJson(resolve(root,parentReceiptPath),parent);
const parentRef = {...parentWritten,path:parentReceiptPath};
const expected = {
  source,gate:'l01',tasks:requirements.map(item=>item.id),now:Date.now(),
  taskTests:Object.fromEntries(requirements.map(item=>[item.id,item.tests])),
  taskAssertions:Object.fromEntries(requirements.filter(item=>item.assertions).map(item=>[item.id,item.assertions!])),
  taskAcceptance:Object.fromEntries(requirements.filter(item=>item.acceptance).map(item=>[item.id,item.acceptance!])),
  taskCommands:Object.fromEntries(requirements.filter(item=>item.commandAcceptance).map(item=>[item.id,item.commandAcceptance!])),
  taskReleaseSequences:Object.fromEntries(requirements.filter(item=>item.releaseSequenceAcceptance).map(item=>[item.id,item.releaseSequenceAcceptance!])),
};
const verified = validateReceipt(root,parentRef,expected);
writeJson(pathInRoot(resolve(output,'validation.json')),{valid:verified.valid,errors:verified.errors,receipt:parentRef,source});
console.log(JSON.stringify({output:pathInRoot(output),valid:verified.valid,errors:verified.errors,receipt:parentRef}));
process.exitCode = verified.valid ? 0 : 1;
