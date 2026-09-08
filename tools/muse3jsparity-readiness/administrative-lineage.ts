import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {isAbsolute,relative,resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {reduceReadiness,deriveReleaseVerification,REQUIRED_PARTS,BASELINE_UNIT_TOTAL,BASELINE_RENDERING_TOTAL,BASELINE_UNIT_FAILED_CEILING,validateCaptureOrder,type GateResult} from './contracts';
import {isSourceInput,sourceIdentity,sha256,type Artifact,type SourceIdentity,type ProducerReceipt,validateReceipt,sameSource,MAX_COMPARISON_AGE_MS} from './evidence-lineage';
import {parseMuse301ExecutionRequirements,type Muse301ExecutionRequirement} from './requirements';
export const ADMIN_PRD='muse3jsparity-3.0.1-PRD.md';
export interface AdministrativePrdChange {line:number;beforeSha256:string;afterSha256:string;kind:'checkbox'|'status';evidence:Artifact[]}
export interface AdministrativeCompletion {
 schema:'muse301-administrative-completion/v1'; createdAt:string;
 frozenSource:SourceIdentity; frozenPrd:Artifact; currentPrdSha256:string;
 changes:AdministrativePrdChange[]; previous?:Artifact;
}
const checkbox=/^(\s*[-*]\s+\[)[ xX](\])/;
const proofSuffix=/ <!-- muse301-proof sha256:[a-f0-9]{64} -->$/;
const requirementBody=(text:string)=>text.replace(checkbox,'$1 $2').replace(proofSuffix,'');
/** Only checkbox state/proof suffix and the explicit status line are administrative. */
export function validateAdministrativePrdDelta(frozen:string,current:string,changes:AdministrativePrdChange[],verifyEvidence:(ref:Artifact,change?:AdministrativePrdChange)=>boolean):string[]{
 const errors:string[]=[];const before=frozen.split('\n'),after=current.split('\n');
 if(before.length!==after.length)return ['Administrative PRD edits cannot insert/delete/reorder lines'];
 const recorded=new Set<number>();
 for(const change of changes){
  const line=change.line-1;
  if(recorded.has(line)||line<0||line>=before.length||sha256(before[line])!==change.beforeSha256||sha256(after[line])!==change.afterSha256||before[line]===after[line]){errors.push(`Invalid administrative line record: ${change.line}`);continue;}recorded.add(line);
  if(!change.evidence.length||!change.evidence.every(ref=>verifyEvidence(ref,change)))errors.push(`Unverified administrative decision: ${change.line}`);
  if(change.kind==='checkbox'){
   if(!checkbox.test(before[line])||!checkbox.test(after[line])||requirementBody(before[line])!==requirementBody(after[line]))errors.push(`Requirement text changed: ${change.line}`);
   const suffix=proofSuffix.exec(after[line]);if(suffix&&!change.evidence.some(ref=>suffix[0].includes(ref.sha256)))errors.push(`Proof suffix not bound to decision: ${change.line}`);
  }else if(change.kind==='status'){
   if(!/^Status: \*\*/.test(before[line])||!/^Status: \*\*[^\r\n]+\*\*\s*$/.test(after[line]))errors.push(`Invalid administrative status line: ${change.line}`);
  }else errors.push(`Unknown administrative edit kind: ${change.line}`);
 }
 for(let line=0;line<before.length;line++)if(before[line]!==after[line]&&!recorded.has(line))errors.push(`Unclassified PRD edit: ${line+1}`);
 const semantics=(text:string)=>parseMuse301ExecutionRequirements(text).map(r=>({id:r.id,part:r.part,gates:r.gates,tests:r.tests,text:requirementBody(r.sourceText)}));
 if(JSON.stringify(semantics(frozen))!==JSON.stringify(semantics(current)))errors.push('Administrative edits changed executable requirements');
 return errors;
}
/** Keep both identities: never report administrative HEAD as the published implementation. */
export function validateAdministrativeCompletion(root:string,certificate:AdministrativeCompletion,verifyEvidence:(ref:Artifact,change?:AdministrativePrdChange)=>boolean,now=Date.now()){
 const errors:string[]=[];const actual=sourceIdentity(root);
 if(certificate.schema!=='muse301-administrative-completion/v1'||!Number.isFinite(Date.parse(certificate.createdAt))||Date.parse(certificate.createdAt)>now)errors.push('Invalid administrative certificate');
 let frozen='';
 try{
  const bytes=readFileSync(resolve(root,certificate.frozenPrd.path));if(sha256(bytes)!==certificate.frozenPrd.sha256)errors.push('Frozen PRD hash mismatch');frozen=bytes.toString('utf8');
  const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  if(git('rev-parse',`${certificate.frozenSource.commit}^{tree}`)!==certificate.frozenSource.tree)errors.push('Frozen tree does not match published commit');
  const committed=execFileSync('git',['show',`${certificate.frozenSource.commit}:${ADMIN_PRD}`],{cwd:root,stdio:['ignore','pipe','pipe']});
  if(sha256(committed)!==certificate.frozenPrd.sha256)errors.push('Frozen PRD is not the committed release PRD');
  const current=readFileSync(resolve(root,ADMIN_PRD),'utf8');
  if(sha256(current)!==certificate.currentPrdSha256)errors.push('Administrative PRD hash mismatch');
  errors.push(...validateAdministrativePrdDelta(frozen,current,certificate.changes,verifyEvidence));
  if(certificate.previous&&!verifyEvidence(certificate.previous))errors.push('Administrative history link is not verified');
  const paths=git('ls-files','-z','--cached','--others','--exclude-standard').split('\0').filter(isSourceInput);
  const hash=createHash('sha256');
  for(const path of [...new Set(paths)].sort()){hash.update(path).update('\0');hash.update(path===ADMIN_PRD?Buffer.from(frozen):existsSync(resolve(root,path))?readFileSync(resolve(root,path)):'<deleted>');hash.update('\0');}
  if(hash.digest('hex')!==certificate.frozenSource.fingerprint||actual.lockfileSha256!==certificate.frozenSource.lockfileSha256)errors.push('Non-administrative source changed since publication');
 }catch(error){errors.push(`Unverifiable administrative lineage: ${String(error)}`);}
 return {valid:errors.length===0,errors,implementationSource:certificate.frozenSource,administrativeSource:actual,currentPrdSha256:certificate.currentPrdSha256,frozenPrd:certificate.frozenPrd};
}


export interface AdministrativeDecisionContext {
 frozenSource:SourceIdentity;
 /** Authoritative frozen requirements, including infrastructure; never report-supplied. */
 requirements:readonly Muse301ExecutionRequirement[];
 frozenPrd:string;
 currentPrd:string;
 now:number;
 /** Run the same baseline/stage-specific validations used by the readiness producer. */
 replayGate:(gate:string,receipt:ProducerReceipt)=>readonly string[];
 baselineGates:readonly string[];
}
/** Revalidate producer bytes and re-derive completion; a report's green flags are not evidence. */
export function validateAdministrativeDecision(root:string,reference:Artifact,change:AdministrativePrdChange,context:AdministrativeDecisionContext):{valid:boolean;errors:string[]} {
 const errors:string[]=[];
 try {
  if(!reference||typeof reference.path!=='string'||isAbsolute(reference.path)||relative(root,resolve(root,reference.path)).startsWith('..')||!/^([a-f0-9]{64})$/.test(reference.sha256))throw new Error('Invalid decision evidence reference');
  const bytes=readFileSync(resolve(root,reference.path));
  if(sha256(bytes)!==reference.sha256)throw new Error('Decision evidence hash mismatch');
  const report=JSON.parse(bytes.toString('utf8'));
  const reportTime=Date.parse(report.generatedAt);
  if(report.schema!=='muse3jsparity-readiness/v2'||report.scope!=='full'||!report.runId||!report.source||!sameSource(report.source,context.frozenSource)||!Number.isFinite(reportTime)||reportTime>context.now)throw new Error('Not a frozen-source final readiness report');
  if(!isDeepStrictEqual(report.baseline,{unitTotalFloor:BASELINE_UNIT_TOTAL,unitFailedCeiling:BASELINE_UNIT_FAILED_CEILING,renderingTotalFloor:BASELINE_RENDERING_TOTAL}))throw new Error('Final report changed baseline requirements');
  if(!Array.isArray(report.gates)||!report.receipts||typeof report.receipts!=='object'||Array.isArray(report.receipts))throw new Error('Missing final report producer references');
  const results:GateResult[]=[];
  const producers=new Map<string,ProducerReceipt>();
  const gates=new Set<string>();
  for(const result of report.gates as GateResult[]) {
   if(!result||typeof result.gate!=='string'||gates.has(result.gate)||!Array.isArray(result.tasks))throw new Error('Malformed or duplicate final report gate');
   gates.add(result.gate);
   const ref=report.receipts[result.gate] as Artifact|undefined;
   if(!ref||typeof ref.path!=='string'||isAbsolute(ref.path)||relative(root,resolve(root,ref.path)).startsWith('..')||ref.path!==result.receipt||ref.sha256!==result.receiptHash)throw new Error(`Unbound producer receipt: ${result.gate}`);
   const required=context.requirements.filter(r=>(r.proofGates??r.gates).includes(result.gate));
   const executable=required.filter(r=>!r.id.startsWith('infrastructure:')&&r.id!=='3.0.1:FINAL.archive'&&!r.allOf&&!r.derivation);
   const checked=validateReceipt(root,ref,{
    source:context.frozenSource,gate:result.gate,now:reportTime,
    maxAgeMs:/superiority|root-path-integrity|^(k1|v01|v02)$/.test(result.gate)?MAX_COMPARISON_AGE_MS:undefined,
    tasks:required.map(r=>r.id),
    taskTests:Object.fromEntries(executable.map(r=>[r.id,r.tests])),
    taskAssertions:Object.fromEntries(executable.filter(r=>r.assertions).map(r=>[r.id,r.assertions!])),
    taskAcceptance:Object.fromEntries(executable.filter(r=>r.acceptance).map(r=>[r.id,r.acceptance!])),
    taskCommands:Object.fromEntries(executable.filter(r=>r.commandAcceptance).map(r=>[r.id,r.commandAcceptance!])),
    taskSourceAudits:Object.fromEntries(executable.filter(r=>r.sourceAuditAcceptance).map(r=>[r.id,r.sourceAuditAcceptance!])),
    taskFinalClaims:Object.fromEntries(executable.filter(r=>r.finalClaimsAcceptance).map(r=>[r.id,r.finalClaimsAcceptance!])),
    taskRoutes:Object.fromEntries(executable.filter(r=>r.routeAcceptance).map(r=>[r.id,r.routeAcceptance!])),
    taskMarketing:Object.fromEntries(executable.filter(r=>r.marketingAcceptance).map(r=>[r.id,r.marketingAcceptance!])),
    taskRegistryConsumers:Object.fromEntries(executable.filter(r=>r.registryConsumerAcceptance).map(r=>[r.id,r.registryConsumerAcceptance!])),
    taskReportRegeneration:Object.fromEntries(executable.filter(r=>r.reportRegenerationAcceptance).map(r=>[r.id,r.reportRegenerationAcceptance!])),
    taskReleaseSequences:Object.fromEntries(executable.filter(r=>r.releaseSequenceAcceptance).map(r=>[r.id,r.releaseSequenceAcceptance!])),
    taskCleanup:Object.fromEntries(executable.filter(r=>r.cleanupAcceptance).map(r=>[r.id,r.cleanupAcceptance!])),
   });
   const failures=[...checked.errors];
   if(checked.receipt) {
    producers.set(result.gate,checked.receipt);
    failures.push(...context.replayGate(result.gate,checked.receipt));
    if(!isDeepStrictEqual([...result.tasks].sort(),[...checked.receipt.tasks].sort()))failures.push('Report changed producer task list');
   }else failures.push('Producer receipt could not be parsed');
   if(failures.length)errors.push(...failures.map(error=>`${result.gate}: ${error}`));
   results.push({...result,tasks:checked.receipt?.tasks??[],verdict:failures.length?'blocked':'pass',receiptValid:failures.length===0});
  }
  if(!isDeepStrictEqual(Object.keys(report.receipts).sort(),[...gates].sort()))errors.push('Final report receipt inventory differs from gates');
  for(const gate of context.baselineGates)if(!producers.has(gate))errors.push(`Missing baseline receipt: ${gate}`);
  for(const [gate,receipt] of producers)if(/superiority|^(k1|v01|v02)$/.test(gate))errors.push(...validateCaptureOrder(receipt.startedAt,context.baselineGates.flatMap(baseline=>{const p=producers.get(baseline);return p?[{gate:baseline,endedAt:p.endedAt}]:[];})));
  const archive=producers.get('archive');
  if(!archive)errors.push('Missing exact final archive producer');
  else {
   const snapshotRefs=archive.artifacts.filter(ref=>ref.path.endsWith('/release-verification.json'));
   const prdRefs=archive.artifacts.filter(ref=>ref.path.endsWith(`/${ADMIN_PRD}`));
   if(snapshotRefs.length!==1||prdRefs.length!==1)errors.push('Archive must bind one exact PRD and release-verification snapshot');
   else {
    if(sha256(readFileSync(resolve(root,prdRefs[0].path)))!==sha256(context.frozenPrd))errors.push('Archived PRD differs from frozen release PRD');
    const snapshot=JSON.parse(readFileSync(resolve(root,snapshotRefs[0].path),'utf8'));
    const phase=deriveReleaseVerification(context.requirements,results.filter(result=>result.gate!=='archive'));
    const expectedReceipts=Object.fromEntries(Object.entries(report.receipts).filter(([gate])=>gate!=='archive'));
    const snapshotTime=Date.parse(snapshot.generatedAt);
    const {source:snapshotSource,runId:snapshotRunId,generatedAt:_generatedAt,receipts:snapshotReceipts,...recordedPhase}=snapshot;
    if(!phase.readyToArchive||!isDeepStrictEqual(recordedPhase,phase)||!snapshotSource||!sameSource(snapshotSource,context.frozenSource)||snapshotRunId!==report.runId||!isDeepStrictEqual(snapshotReceipts,expectedReceipts)||!Number.isFinite(snapshotTime)||snapshotTime<Date.parse(archive.startedAt)||snapshotTime>Date.parse(archive.endedAt))errors.push('Archive snapshot differs from independently verified release phase');
   }
  }
  const derived=reduceReadiness(context.requirements,results,{scope:'full',requiredParts:REQUIRED_PARTS});
  errors.push(...derived.errors);
  if(derived.overall!=='supersede')errors.push('Underlying release requirements are not complete');
  if(report.overall!==derived.overall||!isDeepStrictEqual(report.tasks,derived.tasks)||!isDeepStrictEqual(report.parts,derived.parts)||!isDeepStrictEqual(report.errors,derived.errors)||report.gates.some((r:GateResult)=>r.verdict!=='pass'||r.receiptValid!==true))errors.push('Final report status does not match independently replayed evidence');
  const before=context.frozenPrd.split('\n')[change.line-1],after=context.currentPrd.split('\n')[change.line-1];
  if(before===undefined||after===undefined||sha256(before)!==change.beforeSha256||sha256(after)!==change.afterSha256)errors.push('Decision does not bind exact PRD line');
  if(change.kind==='checkbox') {
   const obligations=context.requirements.filter(r=>r.id.startsWith('3.0.1:')&&r.sourceLine===change.line);
   if(!obligations.length)errors.push('Checkbox line has no executable obligation');
   if(!/^\s*[-*]\s+\[[xX]\]/.test(after??'')||obligations.some(r=>derived.tasks[r.id]!=='pass'))errors.push('Checkbox is not supported by every obligation on its line');
  }else if(change.kind==='status') {
   if(!/^Status: \*\*(?:COMPLETE|COMPLETED|SUPERSEDED)\*\*\s*$/.test(after??''))errors.push('Final decision only supports an explicit completed status');
  }else errors.push('Unknown administrative decision kind');
 }catch(error){errors.push(`Unverifiable administrative decision: ${String(error)}`);}
 return {valid:errors.length===0,errors};
}
