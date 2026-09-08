import { validateRootTemporal } from "./root-temporal-acceptance";
import { artifact, sha256, sameSource, type Artifact, type SourceIdentity } from './source-identity';
export { artifact, sha256, isSourceInput, sourceIdentity, sameSource, type Artifact, type SourceIdentity } from './source-identity';
import { validateReportRegeneration } from './report-regeneration';
import { validateRegistryConsumer } from './registry-consumer';
import { replayMarketingAcceptance } from './marketing-replay';
import { produceRouteAcceptance, produceTypedAssetAcceptance } from './route-acceptance';
import { replayOperationalReleaseSequence } from './release-sequence-replay';
import { auditSource } from '../muse3jsparity-docs-audit/index';
import { validateFinalClaims } from '../muse3jsparity-docs-audit/claims';
import { validateNativeTemporal } from './temporal-acceptance';
import { validateCleanup } from './cleanup';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { ACCEPTANCE_SCHEMAS, validateAcceptance } from './acceptance';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export const SOURCE_AUDIT_BASELINE = '137280b3705e1968a35ddd1c891329e06199597e';
export const MAX_COMPARISON_AGE_MS = 30 * 60 * 1000;
export interface ProducerReceipt {
  schema: 'muse3jsparity-producer/v1'; runId: string; gate: string; tasks: string[];
  command: string[]; cwd: string; exitCode: number; startedAt: string; endedAt: string;
  source: SourceIdentity; claimSurface: string;
  environment: { browser: string; backend: string; hardware: string };
  artifacts: Artifact[]; packages: Artifact[]; tarballs: Artifact[];
  acceptance?: string;
  governorAcceptance?: string;
  cleanupProofs?: {task:string;artifact:string}[];
  finalClaimsProofs?: {task:string;artifact:string}[];
  sourceAuditProofs?: { task: string; artifact: string }[];
  commandProofs?: { task: string; receipts: Artifact[] }[];
  marketingProofs?: {task:string;artifact:Artifact}[];
  reportRegenerationProofs?:{task:string;artifact:Artifact}[];
  registryConsumerProofs?: {task:string;artifact:Artifact}[];
  routeProofs?: {task:string;artifact:Artifact;kind:'routes'|'assets'}[];
  releaseSequenceProofs?: {task:string;artifact:Artifact;mode:'preflight'|'release'}[];
  acceptanceProofs?: { task: string; artifact: string; schema: string }[];
  proofs?: { task: string; report: string; testFile: string; testTitle: string; projectName?: string }[];
}
export function newRunId(): string { return `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`; }
export function writeImmutableJson(path: string, value: unknown): Artifact {
  mkdirSync(dirname(path), { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, body, { flag: 'wx' });
  return { path, sha256: sha256(body) };
}
export function validateReceipt(root: string, reference: Artifact, expected: {
  source: SourceIdentity; gate: string; now: number; maxAgeMs?: number; taskReportRegeneration?:Readonly<Record<string,{schema:'muse301-report-regeneration/v1'}>>; taskRegistryConsumers?:Readonly<Record<string,{schema:'muse301-registry-consumer/v1'}>>; taskMarketing?:Readonly<Record<string,{schema:'muse301-marketing-validation/v1';mode?:'published'}>>; taskRoutes?: Readonly<Record<string,{schema:'aura3d-301-route-acceptance/v1';kind:'routes'|'assets'}>>; taskReleaseSequences?:Readonly<Record<string,{schema:'muse301-release-sequence/v1';mode:'preflight'|'release'}>>; tasks?: readonly string[]; taskTests?: Readonly<Record<string, readonly string[]>>; taskAcceptance?: Readonly<Record<string, { gate: 'l01' | 'l02'; schema: string }>>; taskCommands?: Readonly<Record<string, { commands: readonly (readonly string[])[] }>>; commandDepth?: number;taskAssertions?:Readonly<Record<string,readonly {file:string;title:string}[]>>; taskCleanup?: Readonly<Record<string,{schema:'muse301-cleanup/v1'}>>; taskFinalClaims?: Readonly<Record<string,{schema:'muse301-final-claims-validation/v1'}>>; taskSourceAudits?: Readonly<Record<string, { schema: 'muse3jsparity-docs-audit/v1' }>>;
}): { valid: boolean; errors: string[]; receipt?: ProducerReceipt } {
  const errors: string[] = [];
  try {
    const bytes = readFileSync(resolve(root, reference.path));
    if (sha256(bytes) !== reference.sha256) errors.push('receipt hash mismatch');
    const receipt = JSON.parse(bytes.toString('utf8')) as ProducerReceipt;
    if (receipt.schema !== 'muse3jsparity-producer/v1' || !receipt.runId || receipt.gate !== expected.gate
      || !Array.isArray(receipt.tasks) || new Set(receipt.tasks).size !== receipt.tasks.length
      || !Array.isArray(receipt.command) || !receipt.command.length || !receipt.command.every(x => typeof x === 'string' && x.length > 0)
      || !receipt.cwd || !receipt.claimSurface || !receipt.environment?.browser || !receipt.environment.backend || !receipt.environment.hardware)
      errors.push('malformed producer receipt');
    if (receipt.exitCode !== 0) errors.push('producer did not exit successfully');
    if (!receipt.source || !sameSource(receipt.source, expected.source)) errors.push('source mismatch');
    const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
    if (!utc.test(receipt.startedAt) || !utc.test(receipt.endedAt)) errors.push('timestamps must be ISO UTC');
    const start = Date.parse(receipt.startedAt), end = Date.parse(receipt.endedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end > expected.now || start > expected.now) errors.push('invalid or future timestamp');
    if (expected.maxAgeMs !== undefined && expected.now - start > expected.maxAgeMs) errors.push('stale receipt');
    if (expected.tasks?.some(task => !receipt.tasks?.includes(task))) errors.push('missing required task');
    for (const field of ['artifacts', 'packages', 'tarballs'] as const) {
      if (!Array.isArray(receipt[field]) || (field === 'artifacts' && receipt[field].length === 0)) { errors.push(`missing ${field}`); continue; }
      for (const entry of receipt[field]) {
        if (!entry || typeof entry.path !== 'string' || isAbsolute(entry.path) || relative(root, resolve(root, entry.path)).startsWith('..')) { errors.push('invalid artifact path'); continue; }
        if (resolve(root, entry.path) === resolve(root, reference.path)) errors.push('self-referencing receipt');
        try { if (!/^[a-f0-9]{64}$/.test(entry.sha256) || artifact(root, entry.path).sha256 !== entry.sha256) errors.push(`artifact hash mismatch: ${entry.path}`); }
        catch { errors.push(`missing artifact: ${entry.path}`); }
      }
    }
    if (ACCEPTANCE_SCHEMAS[receipt.gate]) {
      if (!receipt.acceptance || !receipt.artifacts.some(a => a.path === receipt.acceptance)) errors.push('missing hashed acceptance artifact');
      else {
        try { errors.push(...validateAcceptance(receipt.gate, JSON.parse(readFileSync(resolve(root, receipt.acceptance), 'utf8')), [...receipt.artifacts, ...receipt.packages, ...receipt.tarballs], { source: expected.source, now: expected.now, readJson: path => JSON.parse(readFileSync(resolve(root, path), 'utf8')), readBytes: path => readFileSync(resolve(root, path)) })); }
        catch { errors.push('invalid acceptance artifact'); }
      }
    }
    if (receipt.tasks.includes('3.0.1:V02.task.4') || receipt.governorAcceptance) {
      if(receipt.gate!=='v02'||!receipt.tasks.includes('3.0.1:V02.task.4')||!receipt.governorAcceptance||!receipt.artifacts.some(a=>a.path===receipt.governorAcceptance))errors.push('missing or unmapped root governor acceptance');
      else try {
        const script="import {pathToFileURL} from 'node:url';import {readFileSync} from 'node:fs';import {resolve} from 'node:path';const [root,path]=process.argv.slice(1);const {validateRootGovernorReport}=await import(pathToFileURL(resolve(root,'tests/browser/muse3jsparity-301-root-governor-contract.ts')).href);process.stdout.write(JSON.stringify(validateRootGovernorReport(JSON.parse(readFileSync(resolve(root,path),'utf8')))));";
        const replay=JSON.parse(execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',script,root,receipt.governorAcceptance],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
        if(!Array.isArray(replay)||replay.length)errors.push('root governor raw resource validation failed');
      }catch{errors.push('root governor canonical replay failed');}
    }
    // A task cannot evade its canonical temporal replay by relabeling the
    // receipt. Historical A3/J2 tasks retain their distinct legacy proof owners.
    const claimsRootTemporal = receipt.tasks.some(task => /^3\.0\.1:R02\.(?:task|check)\./.test(task));
    const claimsNativeTemporal = receipt.tasks.some(task => /^3\.0\.1:R03\.(?:task|check)\./.test(task));
    if (claimsRootTemporal && receipt.gate !== 'r02') errors.push('root temporal task requires r02 proof owner');
    if (claimsNativeTemporal && receipt.gate !== 'r03') errors.push('native temporal task requires r03 proof owner');
    if (receipt.gate === 'r02') {
      if (!receipt.acceptance || !receipt.artifacts.some(a => a.path === receipt.acceptance)) errors.push('missing root temporal acceptance artifact');
      else try {
        errors.push(...validateRootTemporal(JSON.parse(readFileSync(resolve(root, receipt.acceptance), 'utf8')), {
          source: {...expected.source}, now: expected.now,
          bound: ref => receipt.artifacts.some(a => a.path === ref?.path && a.sha256 === ref?.sha256),
          readBytes: path => readFileSync(resolve(root, path)),
        }));
      } catch { errors.push('invalid root temporal acceptance artifact'); }
    }
    if (receipt.gate === 'r03') {
      if (!receipt.acceptance || !receipt.artifacts.some(a => a.path === receipt.acceptance)) errors.push('missing native temporal acceptance artifact');
      else try {
        errors.push(...validateNativeTemporal(JSON.parse(readFileSync(resolve(root, receipt.acceptance), 'utf8')), {
          source: {...expected.source}, now: expected.now,
          bound: ref => receipt.artifacts.some(a => a.path === ref?.path && a.sha256 === ref?.sha256),
          readBytes: path => readFileSync(resolve(root, path)),
        }));
      } catch { errors.push('invalid native temporal acceptance artifact'); }
    }
    if (receipt.gate === 'l01' && receipt.acceptance) {
      try {
        const data = JSON.parse(readFileSync(resolve(root,receipt.acceptance),'utf8'));
        const input = data.validationInput;
        if (!input || !receipt.artifacts.some(a => a.path === input.path && a.sha256 === input.sha256)) errors.push('missing package validation input');
        else {
          // Replay the canonical pure validator; this does not build, install, or publish.
          const script = "import {pathToFileURL} from 'node:url'; import {readFileSync} from 'node:fs'; import {resolve} from 'node:path'; const [root,input]=process.argv.slice(1); const {producePackageAcceptance}=await import(pathToFileURL(resolve(root,'tools/release/package-acceptance.mjs')).href); process.stdout.write(JSON.stringify(producePackageAcceptance(root,JSON.parse(readFileSync(resolve(root,input),'utf8')))));";
          const replay = JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script,root,input.path],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']}));
          const {validationInput: _input, ...claimed} = data;
          if (!isDeepStrictEqual(replay.acceptance,claimed) || !sameSource(replay.source,expected.source)) errors.push('package acceptance differs from canonical validation');
          for (const ref of replay.artifacts ?? []) if (![...receipt.artifacts,...receipt.packages,...receipt.tarballs].some(a=>a.path===ref.path&&a.sha256===ref.sha256)) errors.push(`missing canonical package input: ${ref.path}`);
        }
      } catch { errors.push('canonical package acceptance replay failed'); }
    }
    if (receipt.gate === 'l02' && receipt.acceptance) {
      try {
        const data=JSON.parse(readFileSync(resolve(root,receipt.acceptance),'utf8'));
        const gallery=JSON.parse(readFileSync(resolve(root,data.visualManifest.path),'utf8'));
        const galleryScript="import {pathToFileURL} from 'node:url';import {readFileSync} from 'node:fs';import {resolve} from 'node:path';const [root,path,source]=process.argv.slice(1);const {validateModernVisualReviewManifest}=await import(pathToFileURL(resolve(root,'tools/release/visual-review-manifest.mjs')).href);process.stdout.write(JSON.stringify(validateModernVisualReviewManifest(JSON.parse(readFileSync(resolve(root,path),'utf8')),JSON.parse(source),p=>readFileSync(resolve(root,p)))));";
        const galleryErrors=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',galleryScript,root,data.visualManifest.path,JSON.stringify(expected.source)],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
        if(!Array.isArray(galleryErrors)||galleryErrors.length)errors.push('canonical visual gallery validation failed');
        for(const ref of [gallery.artifactIndex,...(gallery.sections??[]).flatMap((section:any)=>(section.artifacts??[]).flatMap((a:any)=>[a,a.producer?.report]))])if(!ref||!receipt.artifacts.some(a=>a.path===ref.path&&a.sha256===ref.sha256))errors.push('unbound canonical gallery input');
        const github=JSON.parse(readFileSync(resolve(root,data.github.path),'utf8'));
        if(!github.releasePlan||!receipt.artifacts.some(a=>a.path===github.releasePlan.path&&a.sha256===github.releasePlan.sha256))errors.push('missing canonical GitHub release plan');
        else{
          const script="import {pathToFileURL} from 'node:url';import {readFileSync} from 'node:fs';import {resolve} from 'node:path';const [root,path]=process.argv.slice(1);const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));const report=read(path);const {loadValidatedReleasePlan}=await import(pathToFileURL(resolve(root,'tools/release/exact-release-plan.mjs')).href);const plan=loadValidatedReleasePlan(root,report.releasePlan.path);const docs=report.artifacts.filter(r=>r.path.endsWith('.json')).map(r=>read(r.path));let object=docs.find(d=>d.ref==='refs/tags/v3.0.1')?.object;const seen=new Set();while(object?.type==='tag'){if(seen.has(object.sha))throw Error('Tag cycle');seen.add(object.sha);object=docs.find(d=>d.sha===object.sha&&d.object)?.object;}const releases=docs.filter(d=>d.tag_name==='v3.0.1'&&Array.isArray(d.assets));if(object?.type!=='commit'||releases.length!==1)throw Error('Missing raw tag/release observation');const {validateGitHubRelease}=await import(pathToFileURL(resolve(root,'tools/release/verify-github-release.mjs')).href);process.stdout.write(JSON.stringify(validateGitHubRelease({tagCommit:object.sha,release:releases[0],notes:readFileSync(resolve(root,report.notes.path),'utf8'),assets:report.assets,attachments:report.attachments,requiredArtifacts:read(report.requiredArtifacts.path)},plan)));";
          const failures=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script,root,data.github.path],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
          if(!Array.isArray(failures)||failures.length)errors.push('canonical GitHub release validation failed');
        }
        const selectedPlan=JSON.parse(readFileSync(resolve(root,github.releasePlan.path),'utf8'));
        for(const p of selectedPlan.packages??[])if(![...receipt.artifacts,...receipt.tarballs].some(a=>a.path===p.tarball&&a.sha256===p.sha256))errors.push(`unbound exact publication archive: ${p.name}`);
        const deployment=JSON.parse(readFileSync(resolve(root,data.deployment.path),'utf8'));
        if(deployment.releasePlan?.path!==github.releasePlan?.path||deployment.releasePlan?.sha256!==github.releasePlan?.sha256)errors.push('Origin and GitHub publication plans differ');
        if(!deployment.releasePlan||!receipt.artifacts.some(a=>a.path===deployment.releasePlan.path&&a.sha256===deployment.releasePlan.sha256)||!Array.isArray(deployment.observations)||deployment.observations.length<2)errors.push('missing canonical origin observations/plan');
        else {
          const script="import {pathToFileURL} from 'node:url';import {readFileSync} from 'node:fs';import {resolve} from 'node:path';const [root,path]=process.argv.slice(1);const report=JSON.parse(readFileSync(resolve(root,path),'utf8'));const {loadValidatedReleasePlan}=await import(pathToFileURL(resolve(root,'tools/release/exact-release-plan.mjs')).href);const plan=loadValidatedReleasePlan(root,report.releasePlan.path);const {validateOriginObservation}=await import(pathToFileURL(resolve(root,'tools/release/verify-release-origin.mjs')).href);process.stdout.write(JSON.stringify(report.observations.flatMap(o=>validateOriginObservation(o,plan))));";
          const failures=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script,root,data.deployment.path],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
          if(!Array.isArray(failures)||failures.length)errors.push('canonical deployed-origin validation failed');
          const homepage=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).homepage;
          if(new URL(deployment.origin).origin!==new URL(homepage).origin)errors.push('deployed-origin differs from declared project origin');
        }
      }catch{errors.push('canonical deployed-origin replay failed');}
    }
    const routeTasks = new Set<string>();
    const routeReplays = new Map<string, ReturnType<typeof produceRouteAcceptance>>();
    for (const proof of receipt.routeProofs ?? []) {
      const authorization = expected.taskRoutes?.[proof.task];
      if (receipt.gate !== 'q02' || !authorization || authorization.kind !== proof.kind || authorization.schema !== 'aura3d-301-route-acceptance/v1' || routeTasks.has(proof.task) || !receipt.tasks.includes(proof.task) || !receipt.artifacts.some(a => a.path === proof.artifact?.path && a.sha256 === proof.artifact?.sha256)) {
        errors.push(`unmapped route proof: ${proof.task}`); continue;
      }
      routeTasks.add(proof.task);
      try {
        const report = JSON.parse(readFileSync(resolve(root, proof.artifact.path), 'utf8'));
        if (!routeReplays.has(proof.kind)) routeReplays.set(proof.kind, proof.kind === 'routes' ? produceRouteAcceptance(root, expected.source) : produceTypedAssetAcceptance(root));
        const replay = routeReplays.get(proof.kind)!;
        if (replay.failures.length || !isDeepStrictEqual(report, replay)) errors.push(`route proof differs from canonical replay: ${proof.task}`);
        for (const file of replay.files) if (!receipt.artifacts.some(a => a.path === file.path && a.sha256 === file.sha256)) errors.push(`unbound route input: ${proof.task}:${file.path}`);
      } catch { errors.push(`invalid route proof: ${proof.task}`); }
    }
    for (const task of Object.keys(expected.taskRoutes ?? {})) if (!routeTasks.has(task)) errors.push(`missing route proof: ${task}`);
    if(receipt.tasks.includes('L1.check.4')){
      for(const [path,count] of [['tests/reports/package-clean-install.json',35],['tests/reports/installed-tree-shaking.json',9]] as const){
        try{if(!receipt.artifacts.some(a=>a.path===path))throw Error('unbound check report');const report=JSON.parse(readFileSync(resolve(root,path),'utf8'));if(!Array.isArray(report.checks)||report.checks.length<count||new Set(report.checks.map((c:any)=>c.id)).size!==report.checks.length||report.checks.some((c:any)=>c.pass!==true))throw Error('missing or failed baseline checks');}catch(error){errors.push(`L1.check.4 ${path}: ${String(error)}`);}
      }
    }
    const regenerationTasks=new Set<string>();
    for(const proof of receipt.reportRegenerationProofs??[]){
      if(!expected.taskReportRegeneration?.[proof.task]||receipt.gate!=='l02'||!receipt.tasks.includes(proof.task)||regenerationTasks.has(proof.task)||proof.artifact?.path===reference.path||!receipt.artifacts.some(a=>a.path===proof.artifact?.path&&a.sha256===proof.artifact?.sha256)){errors.push(`unmapped report regeneration: ${proof.task}`);continue;}
      regenerationTasks.add(proof.task);
      try{const input=JSON.parse(readFileSync(resolve(root,proof.artifact.path),'utf8'));errors.push(...validateReportRegeneration(root,input,expected.source,[...receipt.artifacts,...receipt.packages,...receipt.tarballs],expected.now).map(error=>`report regeneration ${proof.task}: ${error}`));}catch(error){errors.push(`report regeneration ${proof.task}: ${String(error)}`);}
    }
    for(const task of Object.keys(expected.taskReportRegeneration??{}))if(!regenerationTasks.has(task))errors.push(`missing report regeneration: ${task}`);
    const registryTasks=new Set<string>();
    for(const proof of receipt.registryConsumerProofs??[]){
      if(!expected.taskRegistryConsumers?.[proof.task]||receipt.gate!=='l02'||!receipt.tasks.includes(proof.task)||registryTasks.has(proof.task)||!receipt.artifacts.some(a=>a.path===proof.artifact?.path&&a.sha256===proof.artifact?.sha256)){errors.push(`unmapped registry consumer: ${proof.task}`);continue;}
      registryTasks.add(proof.task);
      try{
        const refs=[...receipt.artifacts,...receipt.packages,...receipt.tarballs];
        const read=(ref:Artifact)=>{if(!refs.some(a=>a.path===ref?.path&&a.sha256===ref?.sha256))throw Error('Unbound registry consumer artifact');return readFileSync(resolve(root,ref.path));};
        const input=JSON.parse(read(proof.artifact).toString('utf8'));
        const command=(ref:Artifact,packages=false)=>{const child=JSON.parse(read(ref).toString('utf8')) as ProducerReceipt;if(child.registryConsumerProofs?.length||child.releaseSequenceProofs?.length||child.finalClaimsProofs?.length||ref.path===reference.path)throw Error('Recursive registry consumer');if(packages&&child.gate!=='l01')throw Error('Missing canonical package gate');for(const a of [...child.artifacts,...child.packages,...child.tarballs])read(a);const result=validateReceipt(root,ref,{source:expected.source,now:expected.now,gate:child.gate});return {...result,command:child.command};};
        errors.push(...validateRegistryConsumer(input,{source:expected.source,read,validateCommand:ref=>command(ref),validatePackages:ref=>command(ref,true).errors}).map(error=>`registry consumer ${proof.task}: ${error}`));
      }catch(error){errors.push(`registry consumer ${proof.task}: ${String(error)}`);}
    }
    for(const task of Object.keys(expected.taskRegistryConsumers??{}))if(!registryTasks.has(task))errors.push(`missing registry consumer: ${task}`);
    const marketingTasks=new Set<string>();
    for(const proof of receipt.marketingProofs??[]){
      if(!expected.taskMarketing?.[proof.task]||receipt.gate!=='l02'||!receipt.tasks.includes(proof.task)||marketingTasks.has(proof.task)||proof.artifact?.path===reference.path||!receipt.artifacts.some(a=>a.path===proof.artifact?.path&&a.sha256===proof.artifact?.sha256)){errors.push(`unmapped marketing proof: ${proof.task}`);continue;}
      marketingTasks.add(proof.task);
      try{
        const report=JSON.parse(readFileSync(resolve(root,proof.artifact.path),'utf8'));
        const refs=[...receipt.artifacts,...receipt.packages,...receipt.tarballs];
        if(!report.validationInput||!refs.some(a=>a.path===report.validationInput.path&&a.sha256===report.validationInput.sha256)||!Array.isArray(report.artifacts)||report.artifacts.some((a:Artifact)=>!refs.some(b=>a.path===b.path&&a.sha256===b.sha256)))throw Error('Unbound marketing validation input');
        const input=JSON.parse(readFileSync(resolve(root,report.validationInput.path),'utf8'));
        if(expected.taskMarketing?.[proof.task]?.mode==='published'&&input.phase!=='published')throw Error('Published marketing proof required');
        const replay=replayMarketingAcceptance(root,input,report.artifacts,expected.now);
        const {validationInput:_input,artifacts:_refs,...claimed}=report;
        if(!isDeepStrictEqual(replay,claimed)||replay.errors.length||!sameSource(replay.source,expected.source))throw Error('Marketing acceptance differs from canonical replay');
      }catch(error){errors.push(`marketing proof ${proof.task}: ${String(error)}`);}
    }
    for(const task of Object.keys(expected.taskMarketing??{}))if(!marketingTasks.has(task))errors.push(`missing marketing proof: ${task}`);
    const sequenceTasks=new Set<string>();
    const sequenceReplays=new Map<string,string[]>();
    for(const proof of receipt.releaseSequenceProofs??[]){
      const authorization=expected.taskReleaseSequences?.[proof.task];
      if(!authorization||authorization.schema!=='muse301-release-sequence/v1'||authorization.mode!==proof.mode||!receipt.tasks.includes(proof.task)||sequenceTasks.has(proof.task)||receipt.gate!==(proof.mode==='preflight'?'l01':'l02')||proof.artifact?.path===reference.path||!receipt.artifacts.some(a=>a.path===proof.artifact?.path&&a.sha256===proof.artifact?.sha256)){errors.push(`unmapped release sequence linkage: ${proof.task}`);continue;}
      sequenceTasks.add(proof.task);
      const key=`${proof.mode}:${proof.artifact.sha256}`;
      if(!sequenceReplays.has(key))sequenceReplays.set(key,replayOperationalReleaseSequence(root,proof.artifact,expected.source,expected.now,proof.mode,[...receipt.artifacts,...receipt.packages,...receipt.tarballs]));
      errors.push(...sequenceReplays.get(key)!.map(error=>`release sequence ${proof.task}: ${error}`));
    }
    for(const task of Object.keys(expected.taskReleaseSequences??{}))if(!sequenceTasks.has(task))errors.push(`missing release sequence linkage: ${task}`);
    const acceptanceTasks = new Set<string>();
    for (const proof of receipt.acceptanceProofs ?? []) {
      const authorization = expected.taskAcceptance?.[proof.task];
      if (!authorization || authorization.gate !== receipt.gate || !['l01', 'l02'].includes(receipt.gate)
        || authorization.schema !== ACCEPTANCE_SCHEMAS[receipt.gate] || proof.schema !== authorization.schema
        || proof.artifact !== receipt.acceptance || !receipt.tasks.includes(proof.task)
        || !receipt.artifacts.some(a => a.path === proof.artifact) || acceptanceTasks.has(proof.task)) {
        errors.push(`unmapped acceptance linkage: ${proof.task}`); continue;
      }
      acceptanceTasks.add(proof.task);
    }
    for (const task of Object.keys(expected.taskAcceptance ?? {})) {
      if (!acceptanceTasks.has(task)) errors.push(`missing acceptance linkage: ${task}`);
    }
    const commandTasks = new Set<string>();
    for (const proof of receipt.commandProofs ?? []) {
      const authorization = expected.taskCommands?.[proof.task];
      if ((expected.commandDepth ?? 0) > 0 || !authorization || commandTasks.has(proof.task) || !receipt.tasks.includes(proof.task) || !Array.isArray(proof.receipts) || proof.receipts.length !== authorization.commands.length) {
        errors.push(`unmapped command linkage: ${proof.task}`); continue;
      }
      commandTasks.add(proof.task);
      const commandKeys = new Set<string>();
      for (const ref of proof.receipts) {
        if (ref.path === reference.path || !receipt.artifacts.some(a => a.path === ref.path && a.sha256 === ref.sha256)) { errors.push(`unbound command receipt: ${proof.task}`); continue; }
        try {
          const commandReceipt = JSON.parse(readFileSync(resolve(root, ref.path), 'utf8')) as ProducerReceipt;
          const key = JSON.stringify(commandReceipt.command);
          if (!authorization.commands.some(command => JSON.stringify(command) === key) || commandKeys.has(key)) errors.push(`unexpected or duplicate required command: ${proof.task}`);
          commandKeys.add(key);
          if (!commandReceipt.artifacts?.some(a => a.path.endsWith('.log'))) errors.push(`command output log missing: ${proof.task}`);
          const validation = validateReceipt(root, ref, {source:expected.source,gate:commandReceipt.gate,now:expected.now,commandDepth:1});
          errors.push(...validation.errors.map(error => `command ${proof.task}: ${error}`));
          if (Date.parse(commandReceipt.endedAt) > Date.parse(receipt.endedAt)) errors.push(`command completed after parent receipt: ${proof.task}`);
        } catch { errors.push(`unreadable required command: ${proof.task}`); }
      }
    }
    for (const task of Object.keys(expected.taskCommands ?? {})) if (!commandTasks.has(task)) errors.push(`missing command linkage: ${task}`);
    const sourceAuditTasks = new Set<string>();
    for (const proof of receipt.sourceAuditProofs ?? []) {
      if (receipt.gate !== 'q02' || !expected.taskSourceAudits?.[proof.task] || sourceAuditTasks.has(proof.task) || !receipt.tasks.includes(proof.task) || !receipt.artifacts.some(a => a.path === proof.artifact)) {
        errors.push(`unmapped source audit linkage: ${proof.task}`); continue;
      }
      sourceAuditTasks.add(proof.task);
      try {
        const report = JSON.parse(readFileSync(resolve(root, proof.artifact), 'utf8'));
        if (report.schema !== 'muse3jsparity-docs-audit/v1' || report.status !== 'source-audit-passed' || report.source?.baselineCommit !== SOURCE_AUDIT_BASELINE || report.source?.commit !== expected.source.commit || !Array.isArray(report.source?.files) || report.source.files.length === 0 || !Array.isArray(report.unresolved) || report.unresolved.length || !Array.isArray(report.findings) || !Array.isArray(report.checks) || !['candidate-version','public-mirror','agent-doc-budget','candidate-label','notes-exist'].every(id => report.checks.some((c:any) => c.id === id && c.pass === true))) errors.push(`incomplete source audit: ${proof.task}`);
        const reviewInput=report.reviewInput?JSON.parse(readFileSync(resolve(root,report.reviewInput.path),'utf8')):{dispositions:[]};
        const replay=auditSource(root,reviewInput);
        const {generatedAt:_time,command:_command,cwd:_cwd,reviewInput:_review,...claimed}=report;
        if(!isDeepStrictEqual(replay,claimed))errors.push(`source audit differs from canonical AST replay: ${proof.task}`);
        if (sha256(JSON.stringify(report.source?.files)) !== report.source?.auditInputFingerprint) errors.push(`source audit inventory fingerprint mismatch: ${proof.task}`);
        const gitFiles = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\0').filter(Boolean);
        const inventory = new Set([...gitFiles('ls-files','-z'), ...gitFiles('ls-files','--others','--exclude-standard','-z')]);
        const changed = new Set([...gitFiles('diff','--name-only',SOURCE_AUDIT_BASELINE,'-z'), ...gitFiles('ls-files','--others','--exclude-standard','-z')]);
        const surface = (path: string) => /^(apps|examples|templates|packages\/create-aura3d\/templates|docs|marketing)\//.test(path) || ['README.md','CHANGELOG.md','llms.txt','public/llms.txt'].includes(path);
        const expectedFiles = [...inventory].filter(path => changed.has(path) && surface(path) && existsSync(resolve(root,path)) && /\.(?:[cm]?[jt]sx?|html|css|md|txt|json)$/.test(path) && !/(?:^|\/)(?:dist|node_modules|reports)\//.test(path)).sort();
        if (JSON.stringify(expectedFiles) !== JSON.stringify((report.source?.files ?? []).map((ref:any) => ref.path))) errors.push(`incomplete changed-surface inventory: ${proof.task}`);
        if (report.findings?.some((finding:any) => finding.severity === 'error')) errors.push(`hard source boundary violation: ${proof.task}`);
        if (report.reviewInput) {
          const review = JSON.parse(readFileSync(resolve(root,report.reviewInput.path),'utf8'));
          for (const finding of report.findings ?? []) {
            const dispositions = (review.dispositions ?? []).filter((d:any) => d.findingId === finding.id && d.sourceSha256 === finding.sha256 && typeof d.reason === 'string' && d.reason.trim().length >= 30 && d.evidence?.length > 0 && d.evidence.every((ref:any) => receipt.artifacts.some(a => a.path === ref.path && a.sha256 === ref.sha256)));
            if (dispositions.length !== 1) errors.push(`source finding lacks exact disposition: ${proof.task}/${finding.id}`);
          }
        }
        const references = [...(report.source?.files ?? []), ...(report.evidence ?? []), ...(report.reviewInput ? [report.reviewInput] : [])];
        if (report.findings?.length && !report.reviewInput) errors.push(`source audit review input missing: ${proof.task}`);
        for (const ref of references) if (!receipt.artifacts.some(a => a.path === ref.path && a.sha256 === ref.sha256)) errors.push(`unbound source audit input: ${proof.task}/${ref.path}`);
      } catch { errors.push(`invalid source audit artifact: ${proof.task}`); }
    }
    for (const task of Object.keys(expected.taskSourceAudits ?? {})) if (!sourceAuditTasks.has(task)) errors.push(`missing source audit linkage: ${task}`);
    const finalClaimsTasks=new Set<string>();
    for (const proof of receipt.finalClaimsProofs ?? []) {
      if (!['q02','l02'].includes(receipt.gate) || !expected.taskFinalClaims?.[proof.task] || finalClaimsTasks.has(proof.task) || !receipt.tasks.includes(proof.task) || !receipt.artifacts.some(a=>a.path===proof.artifact)) {errors.push(`unmapped final claims linkage: ${proof.task}`);continue;}
      finalClaimsTasks.add(proof.task);
      try {
        const report=JSON.parse(readFileSync(resolve(root,proof.artifact),'utf8'));
        if (!report.validationInput || !receipt.artifacts.some(a=>a.path===report.validationInput.path&&a.sha256===report.validationInput.sha256)) {errors.push(`unbound final claims input: ${proof.task}`);continue;}
        const input=JSON.parse(readFileSync(resolve(root,report.validationInput.path),'utf8'));
        const replay=validateFinalClaims(root,input,expected.now);
        const {validationInput:_input,command:_command,...claimed}=report;
        if(replay.status!=='verified'||!isDeepStrictEqual(replay,claimed)||!sameSource(replay.source,expected.source))errors.push(`final claims differ from validated evidence: ${proof.task}`);
      } catch {errors.push(`invalid final claims proof: ${proof.task}`);}
    }
    for(const task of Object.keys(expected.taskFinalClaims??{}))if(!finalClaimsTasks.has(task))errors.push(`missing final claims linkage: ${task}`);
    const cleanupTasks=new Set<string>();
    for(const proof of receipt.cleanupProofs??[]){
      if(receipt.gate!=='l02'||!expected.taskCleanup?.[proof.task]||cleanupTasks.has(proof.task)||!receipt.tasks.includes(proof.task)||!receipt.artifacts.some(a=>a.path===proof.artifact)){errors.push(`unmapped cleanup linkage: ${proof.task}`);continue;}
      cleanupTasks.add(proof.task);
      try{errors.push(...validateCleanup(JSON.parse(readFileSync(resolve(root,proof.artifact),'utf8')),ref=>!!ref&&receipt.artifacts.some(a=>a.path===ref.path&&a.sha256===ref.sha256),path=>readFileSync(resolve(root,path),'utf8'),expected.now));}catch{errors.push('invalid cleanup artifact');}
    }
    for(const task of Object.keys(expected.taskCleanup??{}))if(!cleanupTasks.has(task))errors.push(`missing cleanup linkage: ${task}`);
    if (expected.taskTests) {
      // Metadata saying a task passed is insufficient: bind it to a real assertion
      // in a hashed producer report and an allowed test file from the task ledger.
      for (const [task, allowedFiles] of Object.entries(expected.taskTests)) {
        if ((regenerationTasks.has(task) || registryTasks.has(task) || marketingTasks.has(task) || sequenceTasks.has(task) || routeTasks.has(task) || acceptanceTasks.has(task) || commandTasks.has(task) || sourceAuditTasks.has(task) || cleanupTasks.has(task) || finalClaimsTasks.has(task)) && allowedFiles.length === 0) continue;
        const links = receipt.proofs?.filter(proof => proof.task === task) ?? [];
        if (!links.length) errors.push(`missing assertion linkage: ${task}`);
        for(const assertion of expected.taskAssertions?.[task]??[])if(!links.some(link=>link.testFile===assertion.file&&link.testTitle===assertion.title))errors.push(`missing required assertion: ${task}/${assertion.title}`);
        for (const proof of links) {
          if (expected.taskAssertions?.[task] && !expected.taskAssertions[task].some(assertion=>assertion.file===proof.testFile&&assertion.title===proof.testTitle)) {errors.push(`wrong required assertion: ${task}`);continue;}
          if (!allowedFiles.includes(proof.testFile) || !proof.testTitle || !receipt.artifacts.some(a => a.path === proof.report)) {
            errors.push(`unmapped assertion linkage: ${task}`); continue;
          }
          try {
            const report = JSON.parse(readFileSync(resolve(root, proof.report), 'utf8'));
            const matches: { passed: boolean }[] = [];
            for (const suite of report.testResults ?? []) {
              const file = String(suite.name ?? '').replace(/\\/g, '/');
              if (file !== proof.testFile && !file.endsWith(`/${proof.testFile}`)) continue;
              for (const test of suite.assertionResults ?? []) if (test.fullName === proof.testTitle) matches.push({ passed: test.status === 'passed' });
            }
            const visit = (suites: any[]): void => {
              for (const suite of suites) {
                for (const spec of suite.specs ?? []) {
                  const file = String(spec.file ?? suite.file ?? '').replace(/\\/g, '/');
                  if (file !== proof.testFile && !file.endsWith(`/${proof.testFile}`) && !proof.testFile.endsWith(`/${file}`)) continue;
                  if (spec.title === proof.testTitle) for (const test of spec.tests ?? []) {
                    if (proof.projectName && test.projectName !== proof.projectName) continue;
                    matches.push({ passed: test.status === 'expected' && test.results?.length > 0 && test.results.every((result: any) => result.status === 'passed') });
                  }
                }
                visit(suite.suites ?? []);
              }
            };
            visit(report.suites ?? []);
            if (matches.length !== 1 || !matches[0].passed) errors.push(`assertion not uniquely passed: ${task}/${proof.testTitle}`);
          } catch { errors.push(`invalid assertion report: ${task}`); }
        }
      }
    }
    return { valid: errors.length === 0, errors, receipt };
  } catch (error) { return { valid: false, errors: [`unreadable receipt: ${String(error)}`] }; }
}
export interface QuarantineEvent {
  gate: string; failedAt: string; source: SourceIdentity | null; failureReceipt: Artifact | null;
  resolution?: { at: string; source: SourceIdentity; receipt: Artifact };
}
export function resolveQuarantine(history: readonly QuarantineEvent[], gate: string, successful: Artifact,
  requiredSource: SourceIdentity, root: string, now: number, taskAcceptance?: Readonly<Record<string, { gate: 'l01' | 'l02'; schema: string }>>, taskCommands?: Readonly<Record<string, { commands: readonly (readonly string[])[] }>>, taskSourceAudits?: Readonly<Record<string, { schema: 'muse3jsparity-docs-audit/v1' }>>,taskCleanup?:Readonly<Record<string,{schema:'muse301-cleanup/v1'}>>, taskFinalClaims?:Readonly<Record<string,{schema:'muse301-final-claims-validation/v1'}>>, additional: Partial<Omit<Parameters<typeof validateReceipt>[2], 'gate' | 'source' | 'now'>> = {}): QuarantineEvent[] {
  const check = validateReceipt(root, successful, { taskAcceptance, taskCommands, taskSourceAudits, taskCleanup, taskFinalClaims, ...additional, gate, source: requiredSource, now });
  if (!check.valid) return [...history];
  return history.map(event => event.gate === gate && !event.resolution && Date.parse(event.failedAt) <= Date.parse(check.receipt!.startedAt)
    ? { ...event, resolution: { at: new Date(now).toISOString(), source: requiredSource, receipt: successful } } : event);
}
