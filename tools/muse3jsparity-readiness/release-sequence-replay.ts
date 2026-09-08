import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { validateReleasePreflight, validateReleaseSequence, type ReleaseRef, type ReleaseSource, type ReleasePhase, type ReleaseSequence, type ReplayedReleasePhase } from './release-sequencing';
import { loadMuse301ExecutionRequirements } from './requirements';
import { validateReceipt, type ProducerReceipt } from './evidence-lineage';

export interface ReleasePhaseEvidence {
 phase: ReleasePhase; report?: ReleaseRef; manifest?: ReleaseRef; log?: ReleaseRef;
 benchmarkReceipt?: ReleaseRef;
}
export interface OperationalReleaseSequence extends ReleaseSequence {
 machineReceipts: ReleaseRef[];
}
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
/** All adapters replay retained producer inputs. No callback/boolean is supplied by
 * the report author. External actions are deliberately absent from this function. */
export function replayOperationalReleaseSequence(root:string, reference:ReleaseRef, source:ReleaseSource, now:number, mode:'preflight'|'release', parentArtifacts:ReleaseRef[]):string[] {
 const bound=(ref:ReleaseRef)=>!!ref && parentArtifacts.some(a=>a.path===ref.path&&a.sha256===ref.sha256);
 const bytes=(ref:ReleaseRef):Buffer=>{
  if(!bound(ref)||ref.path.startsWith('/')||ref.path.split('/').includes('..'))throw Error(`Unbound release sequence input: ${ref?.path}`);
  const result=readFileSync(resolve(root,ref.path));if(sha(result)!==ref.sha256)throw Error(`Changed release sequence input: ${ref.path}`);return result;
 };
 const json=(ref:ReleaseRef)=>JSON.parse(bytes(ref).toString('utf8'));
 const invoke=(body:string,args:string[])=>JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`import {pathToFileURL} from 'node:url';import {readFileSync} from 'node:fs';import {resolve} from 'node:path';const [root,...args]=process.argv.slice(1);const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));${body}`,root,...args],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']}));
 try {
  const sequence=json(reference) as OperationalReleaseSequence & {packages:ReleaseRef;preflight:ReleaseRef};
  const requirements=loadMuse301ExecutionRequirements(root);
  const checked=new Map<string,ReplayedReleasePhase>();
  const checkProducer=(ref:ReleaseRef):ProducerReceipt=>{
   const receipt=json(ref) as ProducerReceipt & {releaseSequenceProofs?:unknown[]};
   if(receipt.releaseSequenceProofs?.length)throw Error('Recursive release sequence receipt');
   const required=requirements.filter(r=>receipt.tasks?.includes(r.id));
   if(receipt.tasks?.some(t=>!t.startsWith('infrastructure:')&&!requirements.some(r=>r.id===t)))throw Error('Unknown release dependency requirement');
   if(required.some(r=>r.releaseSequenceAcceptance))throw Error('Release dependency includes downstream sequencing obligation');
   const result=validateReceipt(root,ref,{source,now,gate:receipt.gate,
    tasks:required.map(r=>r.id),taskTests:Object.fromEntries(required.map(r=>[r.id,r.tests])),
    taskAssertions:Object.fromEntries(required.filter(r=>r.assertions).map(r=>[r.id,r.assertions!])),
    taskAcceptance:Object.fromEntries(required.filter(r=>r.acceptance).map(r=>[r.id,r.acceptance!])),
    taskCommands:Object.fromEntries(required.filter(r=>r.commandAcceptance).map(r=>[r.id,r.commandAcceptance!])),
    taskSourceAudits:Object.fromEntries(required.filter(r=>r.sourceAuditAcceptance).map(r=>[r.id,r.sourceAuditAcceptance!])),
    taskMarketing:Object.fromEntries(required.filter(r=>r.marketingAcceptance).map(r=>[r.id,r.marketingAcceptance!])),
    taskRegistryConsumers:Object.fromEntries(required.filter(r=>r.registryConsumerAcceptance).map(r=>[r.id,r.registryConsumerAcceptance!])),
    taskReportRegeneration:Object.fromEntries(required.filter(r=>r.reportRegenerationAcceptance).map(r=>[r.id,r.reportRegenerationAcceptance!])),
    taskRoutes:Object.fromEntries(required.filter(r=>r.routeAcceptance).map(r=>[r.id,r.routeAcceptance!])),
    taskFinalClaims:Object.fromEntries(required.filter(r=>r.finalClaimsAcceptance).map(r=>[r.id,r.finalClaimsAcceptance!])),
    taskCleanup:Object.fromEntries(required.filter(r=>r.cleanupAcceptance).map(r=>[r.id,r.cleanupAcceptance!]))});
   if(!result.valid)throw Error(`Release dependency failed ${ref.path}: ${result.errors.join('; ')}`);
   for(const artifact of [...receipt.artifacts,...receipt.packages,...receipt.tarballs])bytes(artifact);
   return receipt;
  };
  const planReplay=()=>{
   bytes(sequence.releasePlan);
   const plan=invoke("const {loadValidatedReleasePlan}=await import(pathToFileURL(resolve(root,'tools/release/exact-release-plan.mjs')));process.stdout.write(JSON.stringify(loadValidatedReleasePlan(root,args[0])));",[sequence.releasePlan.path]);
   for(const p of plan.packages)bytes({path:p.tarball,sha256:p.sha256});
   return plan;
  };
  const plan=planReplay();
  const replay=(phase:ReleasePhase,ref:ReleaseRef):ReplayedReleasePhase=>{
   const key=`${phase}:${ref.sha256}`;if(checked.has(key))return checked.get(key)!;
   const receipt=checkProducer(ref) as ProducerReceipt & {releasePhase?:ReleasePhaseEvidence};
   const detail=receipt.releasePhase;
   if(detail?.phase!==phase)throw Error(`Wrong release phase: ${ref.path}`);
   const row:ReplayedReleasePhase={source:receipt.source,startedAt:receipt.startedAt,endedAt:receipt.endedAt,command:receipt.command,errors:[],facts:{}};
   const report=detail.report?json(detail.report):undefined;
   for(const artifact of [detail.report,detail.manifest,detail.log,detail.benchmarkReceipt].filter(Boolean) as ReleaseRef[])if(!receipt.artifacts.some(a=>a.path===artifact.path&&a.sha256===artifact.sha256))throw Error('Release phase input is not bound to its producer');
   if(phase==='baseline'&&receipt.command.some(c=>/^test:/.test(c))&&!receipt.proofs?.length)throw Error('Baseline test command lacks actual assertion reports');
   if(phase==='source-audit'&&!receipt.sourceAuditProofs?.length)throw Error('Source audit phase lacks canonical audit proof');
   if(['preflight','publish'].includes(phase)){
    if(!detail.log)throw Error('Missing observed publisher output');
    const log=bytes(detail.log).toString('utf8');
    if(!receipt.artifacts.some(a=>a.path===detail.log!.path&&a.sha256===detail.log!.sha256)||!log.trimEnd().endsWith(phase==='preflight'?'dry-run complete.':'publish complete.'))throw Error('Publisher command did not complete');
    if(phase==='publish'){
     if(report?.schema!=='aura3d-npm-registry-verification/1.0'||report.commit!==source.commit||report.version!=='3.0.1'||report.packages?.length!==29)throw Error('Missing actual publisher registry results');
     for(const p of plan.packages){const found=report.packages.filter((x:any)=>x.name===p.name);if(found.length!==1||found[0].version!=='3.0.1'||found[0].latest!=='3.0.1'||found[0].localIntegrity!==p.integrity||found[0].registryIntegrity!==p.integrity)throw Error(`Publisher registry mismatch ${p.name}`);}
     row.facts!.publishedPackages=report.packages.map((p:any)=>p.name);
    }
   }
   if(phase==='packages' || phase==='registry'){
    if(receipt.gate!=='l01'||!receipt.acceptance)throw Error('Package phase lacks canonical exact-package acceptance');
    const acceptance=json(receipt.artifacts.find(a=>a.path===receipt.acceptance)!);
    row.facts!.publishedPackages=acceptance.packages.map((p:any)=>p.name);
   }
   if(phase==='capture'){
    const images=receipt.artifacts.filter(a=>/\.(png|webm|mp4)$/.test(a.path));
    if(!images.length||!receipt.proofs?.length)throw Error('Capture requires real passing browser test evidence');
    row.facts!.artifactHashes=images.map(a=>a.sha256);
   }
   if(phase==='gallery'||phase==='review'){
    const manifestRef=phase==='gallery'?detail.report:detail.manifest;
    if(!manifestRef)throw Error('Missing canonical gallery');
    const manifest=json(manifestRef);
    for(const a of [manifest.artifactIndex,...manifest.sections.flatMap((s:any)=>s.artifacts.flatMap((a:any)=>[a,a.producer.report]))])bytes(a);
    const errors=invoke("const {validateModernVisualReviewManifest}=await import(pathToFileURL(resolve(root,'tools/release/visual-review-manifest.mjs')));process.stdout.write(JSON.stringify(validateModernVisualReviewManifest(read(args[0]),JSON.parse(args[1]),p=>readFileSync(resolve(root,p)))));",[manifestRef.path,JSON.stringify(source)]);
    if(errors.length)throw Error(`Canonical gallery failed: ${errors.join('; ')}`);
    row.facts!.artifactHashes=manifest.sections.flatMap((s:any)=>s.artifacts.map((a:any)=>a.sha256));
    if(phase==='review'){
     const reviewer=report?.reviewer;
     if(report?.decision!=='approved'||reviewer?.kind!=='human'||!reviewer.id?.trim()||!reviewer.name?.trim()||/pending|unassigned|unknown|machine|bot|automated|fixture|synthetic/i.test(`${reviewer.id} ${reviewer.name}`)||report.independent!==true)throw Error('Independent human approval missing');
     if(report.manifestSha256!==manifestRef.sha256||report.sourceCommit!==source.commit||report.sourceFingerprint!==source.fingerprint||!report.origin?.recordId)throw Error('Review does not bind exact source/gallery/origin');
     const origin=json(report.origin);
     if(origin.recordId!==report.origin.recordId||origin.actor?.id!==reviewer.id||origin.actor?.kind!=='human'||origin.decision!=='approved'||origin.manifestSha256!==manifestRef.sha256||origin.reviewedAt!==report.reviewedAt)throw Error('Human approval differs from retained original decision');
     if(!Number.isFinite(Date.parse(report.reviewedAt))||Date.parse(report.reviewedAt)<Date.parse(manifest.generatedAt)||Date.parse(report.reviewedAt)>now)throw Error('Invalid actual review time');
     for(const section of manifest.sections)if(report.sections?.filter((s:any)=>s.id===section.id&&s.decision==='approved'&&Array.isArray(s.blockingIssues)&&s.blockingIssues.length===0).length!==1)throw Error('Missing human review scope');
     row.facts!.reviewerIdentity=reviewer.id;row.facts!.independent=true;row.facts!.decision='approved';
     row.startedAt=report.reviewedAt;row.endedAt=report.reviewedAt;
    }
   }
   if(phase==='origin'){
    if(!isDeepStrictEqual(report?.releasePlan,sequence.releasePlan)||report.observations?.length!==2)throw Error('Origin plan/observations missing');
    for(const artifact of [...(report.artifacts??[]),...(report.screenshots??[])])bytes(artifact);
    const errors=invoke("const {validateOriginObservation}=await import(pathToFileURL(resolve(root,'tools/release/verify-release-origin.mjs')));process.stdout.write(JSON.stringify(read(args[0]).observations.flatMap(o=>validateOriginObservation(o,JSON.parse(args[1])))));",[detail.report!.path,JSON.stringify(plan)]);
    if(errors.length)throw Error(`Canonical origin failed: ${errors.join('; ')}`);
    const homepage=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).homepage;if(new URL(report.origin).origin!==new URL(homepage).origin)throw Error('Origin differs from project homepage');
   }
   if(phase==='github'){
    if(!isDeepStrictEqual(report?.releasePlan,sequence.releasePlan))throw Error('GitHub plan mismatch');
    const docs=(report.artifacts??[]).map((a:ReleaseRef)=>{const b=bytes(a);return a.path.endsWith('.json')?JSON.parse(b.toString()):null}).filter(Boolean);
    for(const a of [...(report.assets??[]),...(report.attachments??[])]){bytes(a.artifact);if(a.sha256!==a.artifact.sha256)throw Error('GitHub download digest differs from claimed asset');}
    let object=docs.find((d:any)=>d.ref==='refs/tags/v3.0.1')?.object;const seen=new Set();while(object?.type==='tag'){if(seen.has(object.sha))throw Error('Tag cycle');seen.add(object.sha);object=docs.find((d:any)=>d.sha===object.sha&&d.object)?.object;}
    const releases=docs.filter((d:any)=>d.tag_name==='v3.0.1'&&Array.isArray(d.assets));if(object?.type!=='commit'||releases.length!==1)throw Error('Missing raw release observation');
    bytes(report.notes);bytes(report.requiredArtifacts);
    const errors=invoke("const {validateGitHubRelease,loadRequiredReleaseArtifacts}=await import(pathToFileURL(resolve(root,'tools/release/verify-github-release.mjs')));const p=JSON.parse(args[1]),r=read(args[0]),required=loadRequiredReleaseArtifacts(root,r.requiredArtifacts.path,p);process.stdout.write(JSON.stringify(validateGitHubRelease({...JSON.parse(args[2]),notes:readFileSync(resolve(root,r.notes.path),'utf8'),assets:r.assets,attachments:r.attachments,requiredArtifacts:required},p)));",[detail.report!.path,JSON.stringify(plan),JSON.stringify({tagCommit:object.sha,release:releases[0]})]);
    if(errors.length)throw Error(`Canonical GitHub failed: ${errors.join('; ')}`);
    if(!detail.benchmarkReceipt)throw Error('Missing passing benchmark receipt');
    const benchmark=checkProducer(detail.benchmarkReceipt);if(!['k1','k2','v01','v02'].includes(benchmark.gate))throw Error('Wrong benchmark gate');
    if(!releases[0].body?.includes(benchmark.runId))throw Error('Release does not cite actual passing benchmark run');
    row.facts!.tagCommit=object.sha;row.facts!.benchmarkRound=benchmark.runId;
   }
   checked.set(key,row);return row;
  };
  const context={now,read:bytes,replay,replayPlan:()=>({source:plan.source,version:plan.version,packages:plan.packages.map((p:any)=>p.name),errors:[]}),
   replayRegistry:(ref:ReleaseRef)=>replayRegistryHttpSnapshot(json(ref),bytes),
   replayMachineReadiness:(_source:ReleaseSource,before:number)=>{
    const receipts=(sequence.machineReceipts??[]).map(ref=>checkProducer(ref));
    const errors:string[]=[];
    const leaves=requirements.filter(r=>!r.allOf&&!r.derivation&&!r.releaseSequenceAcceptance&&r.id!=='3.0.1:FINAL.archive'&&!r.gates.includes('l02'));
    for(const r of leaves)for(const gate of r.proofGates??r.gates)if(!receipts.some(receipt=>receipt.gate===gate&&receipt.tasks.includes(r.id)&&Date.parse(receipt.endedAt)<=before))errors.push(`Missing pre-capture machine obligation ${r.id}/${gate}`);
    return errors;
   }};
  return mode==='preflight'?validateReleasePreflight(sequence,source,context):validateReleaseSequence(sequence,source,context);
 }catch(error){return [`Operational release replay failed: ${String(error)}`];}
}
/** Retained raw npm metadata, not success flags. Each collection response is bound
 * separately and reproduces the normalized preservation inventory exactly. */
export function replayRegistryHttpSnapshot(snapshot:any,read:(ref:ReleaseRef)=>Uint8Array):string[]{
 try{
  if(snapshot.schema!=='muse301-registry-snapshot/v1'||snapshot.registry!=='https://registry.npmjs.org'||!Array.isArray(snapshot.responses)||snapshot.responses.length!==29)throw Error('Incomplete npm HTTP observations');
  const packages:Record<string,unknown>={};
  for(const response of snapshot.responses){
   if(response.status!==200||response.method!=='GET'||!response.name||packages[response.name]||response.url!==`https://registry.npmjs.org/${encodeURIComponent(response.name)}`)throw Error('Invalid npm observation endpoint/status');
   const raw=read(response.body);if(sha(raw)!==response.body.sha256)throw Error('Changed npm HTTP body');
   const body=JSON.parse(Buffer.from(raw).toString('utf8'));
   if(body.name!==response.name||!body.versions||!body['dist-tags'])throw Error('Invalid npm package document');
   packages[response.name]={versions:Object.fromEntries(Object.entries(body.versions).map(([version,data]:[string,any])=>[version,{...(data.deprecated===undefined?{}:{deprecated:data.deprecated}),dist:data.dist}])),distTags:body['dist-tags']};
  }
  if(!isDeepStrictEqual(packages,snapshot.packages))throw Error('Registry snapshot differs from raw HTTP bodies');
  return [];
 }catch(error){return [String(error)];}
}
