import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { artifact, sameSource, validateReceipt, isSourceInput, type Artifact, type ProducerReceipt, type SourceIdentity } from './evidence-lineage';
import { loadMuse301ExecutionRequirements } from './requirements';
export interface ReportRegeneration {
 schema:'muse301-report-regeneration/v1'; source:SourceIdentity;
 /** Every release producer leaf, not an arbitrary hand-selected report list. */
 receipts:Artifact[];
 reports:{artifact:Artifact;producer:Artifact}[];
}
/** Rebuild report ownership from canonical release receipt leaves. No report mtime,
 * checked checkbox or ignored JSON alone constitutes regeneration evidence. */
export function validateReportRegeneration(root:string,value:ReportRegeneration,expected:SourceIdentity,bound:Artifact[],now:number):string[]{
 const errors:string[]=[];
 const read=(ref:Artifact)=>{
  if(!ref||!bound.some(a=>a.path===ref.path&&a.sha256===ref.sha256)||artifact(root,ref.path).sha256!==ref.sha256)throw Error(`Unbound/changed regeneration artifact ${ref?.path}`);
  return JSON.parse(readFileSync(resolve(root,ref.path),'utf8'));
 };
 try{
  if(value.schema!=='muse301-report-regeneration/v1'||!sameSource(value.source,expected))throw Error('Regeneration schema/source mismatch');
  const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  if(git('rev-parse','HEAD')!==expected.commit||git('rev-parse','HEAD^{tree}')!==expected.tree)throw Error('Reports are not from final release commit');
  const changed=[...git('diff','--name-only','HEAD').split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(isSourceInput);
  if(changed.length)throw Error('Report regeneration requires committed implementation source');
  const committedAt=Date.parse(git('show','-s','--format=%cI',expected.commit));
  if(!Number.isFinite(committedAt)||committedAt>now)throw Error('Invalid release commit time');
  const requirements=loadMuse301ExecutionRequirements(root);
  const seen=new Set<string>(),producerRows:{ref:Artifact;receipt:ProducerReceipt}[]=[];
  for(const ref of value.receipts??[]){
   if(seen.has(ref.path))throw Error('Duplicate regeneration receipt');seen.add(ref.path);
   const receipt=read(ref) as ProducerReceipt;
   if(receipt.reportRegenerationProofs?.length||receipt.releaseSequenceProofs?.length||receipt.finalClaimsProofs?.length||receipt.marketingProofs?.length||receipt.registryConsumerProofs?.length)throw Error('Regeneration references an aggregate/self-dependent receipt');
   const selected=requirements.filter(r=>receipt.tasks.includes(r.id));
   if(selected.some(r=>r.reportRegenerationAcceptance||r.releaseSequenceAcceptance||r.finalClaimsAcceptance||r.marketingAcceptance||r.registryConsumerAcceptance))throw Error('Regeneration producer claims aggregate release work');
   const checked=validateReceipt(root,ref,{source:expected,gate:receipt.gate,now,tasks:selected.map(r=>r.id),
    taskTests:Object.fromEntries(selected.map(r=>[r.id,r.tests])),taskAssertions:Object.fromEntries(selected.filter(r=>r.assertions).map(r=>[r.id,r.assertions!])),
    taskAcceptance:Object.fromEntries(selected.filter(r=>r.acceptance).map(r=>[r.id,r.acceptance!])),taskCommands:Object.fromEntries(selected.filter(r=>r.commandAcceptance).map(r=>[r.id,r.commandAcceptance!])),
    taskRoutes:Object.fromEntries(selected.filter(r=>r.routeAcceptance).map(r=>[r.id,r.routeAcceptance!])),taskSourceAudits:Object.fromEntries(selected.filter(r=>r.sourceAuditAcceptance).map(r=>[r.id,r.sourceAuditAcceptance!])),taskCleanup:Object.fromEntries(selected.filter(r=>r.cleanupAcceptance).map(r=>[r.id,r.cleanupAcceptance!]))});
   if(!checked.valid||Date.parse(receipt.startedAt)<committedAt)throw Error(`Report producer not freshly successful at release commit: ${ref.path}`);
   for(const a of [...receipt.artifacts,...receipt.packages,...receipt.tarballs])if(!bound.some(b=>a.path===b.path&&a.sha256===b.sha256))throw Error(`Unbound regeneration dependency ${a.path}`);
   producerRows.push({ref,receipt});
  }
  if(!producerRows.length)throw Error('No regeneration producers');
  // All executable pre-review leaves must be represented, including route audits
  // and package validation. Derived/release descendants are excluded explicitly.
  const leaves=requirements.filter(r=>!r.allOf&&!r.derivation&&!r.reportRegenerationAcceptance&&!r.releaseSequenceAcceptance&&!r.finalClaimsAcceptance&&!r.marketingAcceptance&&!r.registryConsumerAcceptance&&!r.gates.includes('l02')&&r.id!=='3.0.1:FINAL.archive');
  for(const requirement of leaves)for(const gate of requirement.proofGates??requirement.gates)if(!producerRows.some(r=>r.receipt.gate===gate&&r.receipt.tasks.includes(requirement.id)))errors.push(`Missing regenerated producer ${requirement.id}/${gate}`);
  const owned=new Map<string,{artifact:Artifact;producer:Artifact}>();
  for(const {ref,receipt} of producerRows)for(const a of receipt.artifacts.filter(a=>a.path.startsWith('tests/reports/'))){
   const previous=owned.get(a.path);if(previous&&previous.artifact.sha256!==a.sha256)throw Error(`Conflicting report generations ${a.path}`);
   if(!previous)owned.set(a.path,{artifact:a,producer:ref});
  }
  const canonical=[...owned.values()].sort((a,b)=>a.artifact.path.localeCompare(b.artifact.path));
  if(!canonical.length||!isDeepStrictEqual(value.reports,canonical))throw Error('Regeneration inventory differs from complete current proof closure');
 }catch(error){errors.push(String(error));}
 return errors;
}
