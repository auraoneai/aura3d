#!/usr/bin/env node
/** Derive L01 acceptance from retained commands and their unmodified reports. */
import { createHash, verify } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync, openSync, closeSync, appendFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hostname } from 'node:os';
import { sourceIdentity } from './source-identity.mjs';
import { spawnSync } from 'node:child_process';
import { renderBundleSizeMarkdown } from '../bundle-size/markdown.mjs';
import { validateBudgetContinuity, BUDGET_SOURCE } from './budget-continuity.mjs';
import { validateVersionInventory } from './version-inventory.mjs';
import { validateOptionalPeerObservation } from './optional-peer-fixture.mjs';
import { loadValidatedReleasePlan } from './exact-release-plan.mjs';
export const CHECKS = ['compatibility','optionalPeers','imports','exports','smoke','provenance','bundleBudgets','leanIsolation'];
export const COMMANDS = {
  frozenLock:['pnpm','install','--frozen-lockfile','--ignore-scripts'],
  source: ['pnpm','check:templates'], installed: ['pnpm','check:templates:exact'],
  compatibility: ['pnpm','check:patch-compatibility'], optionalPeers: ['pnpm','check:clean-install'],
  imports: ['pnpm','verify:imports'], exports: ['pnpm','verify:exports'],
  smoke: ['pnpm','verify:package-install-smoke'], provenance: ['node','--experimental-strip-types','tools/package-provenance/index.ts'],
  bundleBudgets: ['pnpm','check:bundle-size'], leanIsolation: ['pnpm','check:installed-tree-shaking']
};
export const REPORTS = {frozenLock:'tests/reports/release-frozen-lock.json',source:'tests/reports/agent-templates.json',installed:'tests/reports/installed-template-lifecycle.json',compatibility:'tests/reports/public-surface-diff-3.0.1.json',optionalPeers:'tests/reports/package-clean-install.json',imports:'tests/reports/import-smoke.json',exports:'tests/reports/exports.json',smoke:'tests/reports/package-install-smoke.json',provenance:'tests/reports/package-provenance.json',bundleBudgets:'tests/reports/bundle-size.json',leanIsolation:'tests/reports/installed-tree-shaking.json'};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = file => sha(readFileSync(file));
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
function file(root, path) { requireThat(typeof path === 'string' && path.length > 0, 'missing artifact path'); const full = resolve(root,path); requireThat(!relative(root, full).startsWith('..'), 'artifact escapes source root'); return full; }
export function validatePassingReport(report, label) {
  requireThat(report && (report.pass === true || report.ok === true), `${label}: report failed or lacks result`);
  for (const field of ['failures','violations','errors']) if (field in report) requireThat(Array.isArray(report[field]) && report[field].length === 0, `${label}: ${field} present`);
  if ('checks' in report) requireThat(Array.isArray(report.checks) && report.checks.length > 0 && new Set(report.checks.map(c=>c.id)).size === report.checks.length && report.checks.every(c=>c.pass === true), `${label}: failed, empty or duplicate checks`);
}
/** File descriptors retain output as it is written, including if the recorder is killed. */
function executeRetained(root,command,args,logPath,execute,options={}) {
  const timeout=Number(process.env.AURA3D_COMMAND_TIMEOUT_MS ?? 2700000);
  requireThat(Number.isInteger(timeout) && timeout>0 && timeout<=3600000,'Invalid command timeout');
  const fd=openSync(file(root,logPath),'w');
  let result;
  try { result=execute(command,args,{cwd:root,encoding:'utf8',...options,stdio:['ignore',fd,fd],timeout,killSignal:'SIGKILL',detached:process.platform!=='win32'}); }
  catch(error){result={status:null,signal:null,error};}
  finally{closeSync(fd);}
  // Only the child group created by this invocation is eligible for cleanup.
  if(result.pid && process.platform!=='win32'){try{process.kill(-result.pid,'SIGKILL');}catch{}}
  // Injected test runners may return buffers; real subprocesses write directly to fd.
  if(result.stdout || result.stderr || result.error)appendFileSync(file(root,logPath),`${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? String(result.error) : ''}`);
  return result;
}
/** Execute the canonical command, invalidate old report, and retain exit/log/report hashes. */
export function recordCommand(root, { kind, planPath, reportPath, outputPath }, runtime = {}) {
  const validatePlan=runtime.validatePlan ?? loadValidatedReleasePlan;
  const execute=runtime.execute ?? spawnSync;
  requireThat(COMMANDS[kind], 'unknown package command');
  requireThat(reportPath===REPORTS[kind], 'wrong canonical report path');
  validatePlan(root,planPath);
  const planSha256 = digest(file(root,planPath));
  const reportFile = file(root,reportPath), outputFile = file(root,outputPath);
  requireThat(new Set([reportFile,outputFile,file(root,planPath),file(root,`${outputPath}.log`)]).size===4, 'overlapping command outputs');
  rmSync(reportFile,{force:true});
  const startedAt = new Date().toISOString();
  const [command,...args] = COMMANDS[kind];
  mkdirSync(dirname(outputFile),{recursive:true});
  const logPath = `${outputPath}.log`;
  writeFileSync(outputFile,JSON.stringify({schema:'muse301-package-command/v1',status:'running',kind,command:COMMANDS[kind],plan:{path:planPath,sha256:planSha256},startedAt,exitCode:null,log:{path:logPath}}));
  const result = executeRetained(root,command,args,logPath,execute,{env:{...process.env,A3D_RELEASE_PLAN:file(root,planPath)}});
  const endedAt = new Date().toISOString();
  const validationErrors=[];
  if(result.error)validationErrors.push(`Command execution: ${String(result.error)}`);
  let finalPlan;
  try { finalPlan=validatePlan(root,planPath); } catch(error) { validationErrors.push(`Final source/plan validation: ${String(error)}`); }
  try { requireThat(digest(file(root,planPath)) === planSha256, 'release plan changed during command'); } catch(error) { validationErrors.push(String(error)); }
  if(kind==='frozenLock') {
    mkdirSync(dirname(reportFile),{recursive:true});
    writeFileSync(reportFile,JSON.stringify({schema:'muse301-frozen-lock/v1',pass:result.status===0 && validationErrors.length===0,source:finalPlan?.source,releasePlan:finalPlan?.reference,command:COMMANDS[kind],validationErrors}));
  }
  let report=null;
  try {
    requireThat(existsSync(reportFile), 'Command did not produce its required report');
    report={path:reportPath,sha256:digest(reportFile)};
    validatePassingReport(json(reportFile),kind);
  } catch(error) { validationErrors.push(`Command report validation: ${String(error)}`); }
  const commandExitCode=result.status ?? 1;
  const receipt = {schema:'muse301-package-command/v1',kind,command:COMMANDS[kind],plan:{path:planPath,sha256:planSha256},startedAt,endedAt,commandExitCode,exitCode:commandExitCode===0 && validationErrors.length>0?1:commandExitCode,signal:result.signal,validationErrors,log:{path:logPath,sha256:digest(file(root,logPath))},report};
  writeFileSync(outputFile,`${JSON.stringify(receipt,null,2)}\n`);
  return receipt;
}
export function packageAcceptanceDocument(result, validationInput) {
  requireThat(result?.acceptance?.schema === 'muse301-packages/v1', 'invalid package acceptance result');
  requireThat(validationInput?.path && /^[a-f0-9]{64}$/.test(validationInput.sha256 ?? ''), 'invalid package validation input');
  return {...result.acceptance, validationInput};
}

export const BUILD_COMMAND=['pnpm','build:raw'];
const REMOTE_PROVIDERS = new Set(['aws','azure','gcp','github-actions']);
export function validateRemoteBuildEnvironment(environment) {
  requireThat(environment?.platform === 'linux' && typeof environment.hostname === 'string' && environment.hostname.length > 0, 'Remote Linux build environment required');
  requireThat(REMOTE_PROVIDERS.has(environment.provider), 'Supported remote build provider required');
  requireThat(typeof environment.workerId === 'string' && environment.workerId.length >= 8 && environment.workerId.length <= 256, 'Stable remote worker identity required');
  if (environment.provider === 'aws') requireThat(/^i-[a-f0-9]{8,17}$/.test(environment.workerId), 'Invalid AWS worker identity');
  if (environment.provider === 'azure') requireThat(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(environment.workerId), 'Invalid Azure VM identity');
  return environment;
}
/** Build precedes pack-once: bind source now and compare with the later plan. */
export function recordBuild(root,{outputPath},runtime={}) {
  const identity=runtime.identity ?? sourceIdentity, execute=runtime.execute ?? spawnSync;
  const environment=validateRemoteBuildEnvironment(runtime.environment ?? {platform:process.platform,hostname:hostname(),provider:process.env.AURA3D_REMOTE_PROVIDER,workerId:process.env.AURA3D_REMOTE_WORKER_ID});
  const source=identity(root),startedAt=new Date().toISOString(),output=file(root,outputPath),logPath=`${outputPath}.log`;
  mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,JSON.stringify({schema:'muse301-package-build/v1',status:'running',command:BUILD_COMMAND,source,environment,startedAt,exitCode:null,log:{path:logPath}}));
  const result=executeRetained(root,BUILD_COMMAND[0],BUILD_COMMAND.slice(1),logPath,execute);
  const endedAt=new Date().toISOString();
  const validationErrors=[];
  if(result.error)validationErrors.push(`Build execution: ${String(result.error)}`);
  try { requireThat(JSON.stringify(identity(root))===JSON.stringify(source),'Source changed during remote build'); }catch(error){validationErrors.push(String(error));}
  const commandExitCode=result.status ?? 1;
  const receipt={schema:'muse301-package-build/v1',command:BUILD_COMMAND,source,environment,startedAt,endedAt,commandExitCode,exitCode:commandExitCode===0 && validationErrors.length?1:commandExitCode,signal:result.signal,validationErrors,log:{path:logPath,sha256:digest(file(root,logPath))}};
  writeFileSync(output,`${JSON.stringify(receipt,null,2)}\n`);
  return receipt;
}
export function producePackageAcceptance(root, {planPath, commands}) {
  root=resolve(root);
  const artifacts = new Map();
  const bind = path => { const full=file(root,path); const ref={path,sha256:digest(full)}; artifacts.set(path,ref); return ref; };
  const planRef=bind(planPath), plan=json(file(root,planPath));
  requireThat(plan.schema === 'aura3d-release-plan/1.0' && plan.version === '3.0.1' && plan.packageCount === 29 && plan.expectedPackageCount === 29 && plan.packages?.length === 29, 'invalid 3.0.1 pack plan');
  requireThat(plan.source?.commit && plan.source?.fingerprint && plan.source?.lockfileSha256 === digest(file(root,'pnpm-lock.yaml')), 'plan source/lock identity missing or stale');
  const manifests=['package.json',...readdirSync(resolve(root,'packages'),{withFileTypes:true}).filter(e=>e.isDirectory() && existsSync(resolve(root,'packages',e.name,'package.json'))).map(e=>`packages/${e.name}/package.json`)].map(path=>({path,data:json(file(root,path))})).filter(p=>p.data.private !== true);
  requireThat(manifests.length === 29 && new Set(manifests.map(p=>p.data.name)).size === 29, 'expected 29 public source manifests');
  requireThat(new Set(plan.packages.map(p=>p.name)).size === 29, 'duplicate packed packages');
  const packages=manifests.map(({path,data})=>{
    const p=plan.packages.find(p=>p.name===data.name);
    requireThat(data.version === '3.0.1' && p?.version === '3.0.1', `manifest/version mismatch: ${data.name}`);
    const tarball=bind(p.tarball); bind(path);
    requireThat(tarball.sha256===p.sha256 && /^sha512-/.test(p.integrity ?? ''), `tarball mismatch: ${data.name}`);
    requireThat(`sha512-${createHash('sha512').update(readFileSync(file(root,p.tarball))).digest('base64')}`===p.integrity, `tarball integrity mismatch: ${data.name}`);
    return {name:data.name,manifest:path,tarball:p.tarball,sha256:p.sha256};
  });
  requireThat(typeof commands?.build==='string','remote build receipt missing');
  bind(commands.build); const build=json(file(root,commands.build));
  requireThat(build.schema==='muse301-package-build/v1' && JSON.stringify(build.command)===JSON.stringify(BUILD_COMMAND) && build.exitCode===0 && build.commandExitCode===0 && !build.signal && build.validationErrors?.length===0,'remote build failed or incomplete');
  requireThat(JSON.stringify(build.source)===JSON.stringify(plan.source),'remote build source differs from packed source');
  validateRemoteBuildEnvironment(build.environment);
  requireThat(Number.isFinite(Date.parse(build.startedAt)) && Date.parse(build.endedAt)>=Date.parse(build.startedAt) && Date.parse(build.endedAt)<=Date.parse(plan.generatedAt),'build must finish before packing');
  requireThat(build.log && bind(build.log.path).sha256===build.log.sha256,'remote build log mismatch');
  const readCommand=kind=>{
    requireThat(typeof commands?.[kind] === 'string', `${kind}: command receipt missing`);
    bind(commands[kind]); const c=json(file(root,commands[kind]));
    requireThat(c.schema==='muse301-package-command/v1' && c.kind===kind && JSON.stringify(c.command)===JSON.stringify(COMMANDS[kind]) && c.exitCode===0 && !c.signal && (!c.validationErrors || c.validationErrors.length===0), `${kind}: failed or wrong command`);
    requireThat(c.plan?.sha256===planRef.sha256 && c.plan.path===planPath, `${kind}: wrong exact pack plan`);
    const start=Date.parse(c.startedAt),end=Date.parse(c.endedAt);
    requireThat(Number.isFinite(start) && Number.isFinite(end) && end>=start && start>=Date.parse(plan.generatedAt) && end<=Date.now(), `${kind}: invalid command timing`);
    for(const reference of [c.log,c.report]) requireThat(reference && bind(reference.path).sha256===reference.sha256, `${kind}: command artifact mismatch`);
    requireThat(c.report.path===REPORTS[kind], `${kind}: wrong canonical report`);
    const report=json(file(root,c.report.path)); validatePassingReport(report,kind);
    return report;
  };
  const frozenLock=readCommand('frozenLock');
  requireThat(frozenLock.schema==='muse301-frozen-lock/v1' && frozenLock.releasePlan?.sha256===planRef.sha256 && JSON.stringify(frozenLock.source)===JSON.stringify(plan.source), 'frozen lock/source validation missing');
  const budgetContinuity=validateBudgetContinuity(root); bind(BUDGET_SOURCE);
  const inventory=validateVersionInventory(root,plan);
  for(const path of inventory.paths)bind(path);
  const source=readCommand('source'), installed=readCommand('installed');
  requireThat(installed.releasePlan?.sha256===planRef.sha256, 'installed lifecycle not bound to exact plan');
  requireThat(source.mode==='workspace-source-aliases' && installed.mode==='fresh-local-3.0.1-tarballs', 'wrong lifecycle legs');
  const names=readdirSync(resolve(root,'packages/create-aura3d/templates'),{withFileTypes:true}).filter(e=>e.isDirectory() && existsSync(resolve(root,'packages/create-aura3d/templates',e.name,'package.json'))).map(e=>e.name).sort();
  requireThat(names.length===19, 'expected 19 canonical scaffold manifests');
  const stages=['build','browserSmoke','interactionSmoke','deployCheck','routeHealth','routeHealthReport','screenshot'];
  for(const [label,r] of [['source',source],['installed',installed]]) {
    requireThat(r.checks.length>=149 && r.scaffoldSmoke?.length===19 && new Set(r.scaffoldSmoke.map(s=>s.template)).size===19, `${label}: lifecycle inventory below baseline`);
    requireThat(names.every(name=>r.scaffoldSmoke.some(s=>s.template===name && stages.every(k=>s[k]===true) && s.screenshotFileBytes>1000)), `${label}: incomplete scaffold stages`);
  }
  const scaffolds=names.map(name=>{
    const row=installed.scaffoldSmoke.find(s=>s.template===name);
    requireThat(row.installedArtifacts?.length>0, `${name}: missing installed artifact observation`);
    const hashes=row.installedArtifacts.map(a=>{
      const p=plan.packages.find(p=>p.name===a.name);
      requireThat(p && a.version==='3.0.1' && a.sha256===p.sha256 && a.integrity===p.integrity && a.installedIntegrity===p.integrity, `${name}: installed artifact mismatch`);
      return a.sha256;
    });
    return {name,sourcePassed:true,installedPassed:true,tarballHashes:hashes};
  });
  const checks={};
  let bundleMarkdown;
  for(const kind of CHECKS) {
    const report=readCommand(kind);
    if(kind==='bundleBudgets') {
      requireThat(Array.isArray(report.targets) && report.targets.length===budgetContinuity.currentTargets.length && new Set(report.targets.map(t=>t.id)).size===report.targets.length,'bundle report target inventory incomplete');
      for(const target of budgetContinuity.currentTargets) {
        const row=report.targets.find(r=>r.id===target.id);
        requireThat(row && row.budget===target.budget && row.enforced===target.enforced && typeof row.label==='string' && [row.jsBytes,row.gzipBytes,row.budget].every(n=>Number.isFinite(n)&&n>=0) && typeof row.sizeLimitPassed==='boolean','bundle report target differs from measured contract');
      }
      const path='BUNDLE_SIZES.md';
      requireThat(readFileSync(file(root,path),'utf8')===renderBundleSizeMarkdown(report.targets),'Bundle Markdown differs from canonical measured report');
      bundleMarkdown=bind(path); bind('tools/bundle-size/markdown.mjs');
    }
    if(kind==='compatibility') requireThat(report.currentVersion==='3.0.1' && report.baseline==='v3.0.0' && report.counts?.baselinePackages===29 && report.counts?.currentPackages===29 && report.counts?.removals===0 && report.counts?.declarationContractChanges===0 && report.unresolvedEntrypoints?.length===0, 'patch compatibility scope incomplete');
    if(kind==='optionalPeers') {
      requireThat(report.optionalPeerMatrix?.length===2, 'optional-peer matrix missing');
      for(const mode of ['absent','present']) {
        const row=report.optionalPeerMatrix.find(r=>r.mode===mode);
        requireThat(row?.install?.ok===true && row?.runtime?.ok===true, `${mode}: optional-peer command failed`);
        validateOptionalPeerObservation(row.observation,mode);
        const observationPath=`${row.retained}/optional-peer-result.json`, lockPath=`${row.retained}/package-lock.json`;
        bind(observationPath); bind(`${row.retained}/probe.mjs`); bind(`${row.retained}/commands.json`);
        requireThat(JSON.stringify(json(file(root,observationPath)))===JSON.stringify(row.observation), `${mode}: retained runtime observation mismatch`);
        requireThat(bind(lockPath).sha256===row.installedIdentity?.lockfileSha256, `${mode}: retained installed lock mismatch`);
        requireThat(row.installedIdentity?.packages?.some(p=>p.name==='@aura3d/engine' && packages.some(candidate=>candidate.name===p.name && candidate.sha256===p.sha256)), `${mode}: optional-peer installed identity missing`);
        const present=row.installedIdentity.packages.some(p=>p.name==='@aura3d/navigation-recast');
        requireThat(present===(mode==='present'), `${mode}: optional-peer installed inventory mismatch`);
      }
    }
    if(kind==='exports') requireThat(Array.isArray(report.packages) && packages.every(p=>report.packages.includes(p.name)), 'export inventory incomplete');
    if(kind==='imports') requireThat(report.entries?.length>0 && report.entries.every(e=>e.ok===true) && report.workspaceDependencies?.length>0 && report.workspaceDependencies.every(e=>e.ok===true), 'import checks incomplete');
    if(['optionalPeers','smoke','leanIsolation'].includes(kind)) requireThat(report.releasePlan?.sha256===planRef.sha256, `${kind}: underlying report lacks exact plan binding`);
    if(kind==='smoke') {
      requireThat(packages.some(p=>p.sha256===report.tarballSha256), 'smoke did not test release tarball');
      const exact=report.exactPackages;
      requireThat(exact?.schema==='aura3d-exact-package-smoke/v1' && exact.ok===true && exact.packageCount===29 && exact.packages?.length===29 && new Set(exact.packages.map(p=>p.name)).size===29 && exact.releasePlan?.sha256===planRef.sha256, 'all 29 exact package smoke results required');
      for(const p of plan.packages) {
        const observed=exact.packages.find(o=>o.name===p.name);
        requireThat(observed?.ok===true && observed.version===p.version && observed.sha256===p.sha256 && observed.integrity===p.integrity && observed.installedIntegrity===p.integrity && observed.violations?.length===0 && (observed.importedEntrypoints?.length>0 || observed.binChecks?.length>0), `exact package smoke missing: ${p.name}`);
      }
    }
    if(kind==='provenance') {
      requireThat(packages.some(p=>p.sha256===report.subject?.digest?.sha256) && report.signature?.verified===true, 'provenance does not bind release tarball');
      const statement=Object.fromEntries(['statementType','predicateType','subject','builder','materials','buildType','invocation'].map(k=>[k,report[k]]));
      requireThat(report.signature.algorithm==='ed25519' && verify(null,Buffer.from(JSON.stringify(statement)),report.signature.publicKeyPem,Buffer.from(report.signature.signatureBase64,'base64')), 'provenance signature invalid');
      requireThat(report.materials?.length>0, 'provenance materials missing');
      for(const material of report.materials) requireThat(bind(material.uri).sha256===material.digest?.sha256, 'provenance material changed');
      requireThat(report.packageCount===29 && report.packages?.length===29 && new Set(report.packages.map(p=>p.name)).size===29, 'all 29 provenance statements required');
      for(const p of plan.packages) {
        const proof=report.packages.find(o=>o.name===p.name), st=proof?.statement;
        requireThat(proof?.ok===true && proof.version===p.version && proof.sha256===p.sha256 && st?.subject?.name===p.name && st.subject.version===p.version && st.subject.digest?.sha256===p.sha256 && st.installedIntegrity===p.integrity && st.releasePlan?.sha256===planRef.sha256 && JSON.stringify(st.source)===JSON.stringify(plan.source), `package provenance mismatch: ${p.name}`);
        requireThat(proof.signature?.algorithm==='ed25519' && verify(null,Buffer.from(JSON.stringify(st)),proof.signature.publicKeyPem,Buffer.from(proof.signature.signatureBase64,'base64')), `package provenance signature invalid: ${p.name}`);
        requireThat(st.materials?.length>0, `package provenance materials missing: ${p.name}`);
        for(const material of st.materials) requireThat(bind(material.uri).sha256===material.digest?.sha256, `package provenance material changed: ${p.name}`);
      }
    }
    checks[kind]=true;
  }
  return {acceptance:{schema:'muse301-packages/v1',version:'3.0.1',versionInventory:inventory,budgetContinuity,bundleMarkdown,packages,scaffolds,lifecycleAssertions:Math.min(source.checks.length,installed.checks.length),checks},source:plan.source,plan:planRef,artifacts:[...artifacts.values()]};
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [mode,input,output]=process.argv.slice(2); const config=json(resolve(input));
  if(mode==='record-build') {const receipt=recordBuild(process.cwd(),config);process.exitCode=receipt.exitCode;}
  else if(mode==='record') { const receipt=recordCommand(process.cwd(),config); process.exitCode=receipt.exitCode; }
  else if(mode==='produce') {
    const root=process.cwd(), result=producePackageAcceptance(root,config);
    const validationInput={path:relative(root,file(root,input)),sha256:digest(file(root,input))};
    result.artifacts.push(validationInput);
    const document=packageAcceptanceDocument(result,validationInput);
    mkdirSync(dirname(resolve(output)),{recursive:true});writeFileSync(resolve(output),`${JSON.stringify(document,null,2)}\n`);
  }
  else throw new Error('Usage: package-acceptance.mjs record config.json | produce config.json output.json');
}
