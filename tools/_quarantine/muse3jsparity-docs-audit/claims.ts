import { validateReleaseClaimCoverage } from './release-claim-coverage';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { sourceIdentity, sameSource, artifact, validateReceipt, SOURCE_AUDIT_BASELINE, type Artifact, type SourceIdentity } from '../muse3jsparity-readiness/evidence-lineage';
import { validateDocumentInvariants, structuralDocumentLineNumbers, isDescriptiveDocumentLine, CONTROLLED_CLAIM_DOCUMENTS } from './document-invariants';
import { loadMuse301ExecutionRequirements } from '../muse3jsparity-readiness/requirements';
export const CLAIM_SURFACES = ['createAuraApp root safe API','production-runtime','rendering package','CLI asset pipeline','template-only scaffold','prototype','roadmap','release tooling'] as const;
/** Exact labels only: descriptive prose mentioning root must not promote an internal receipt. */
export function claimSurfaceCompatible(claim:string, receipt:string):boolean {
 return (CLAIM_SURFACES as readonly string[]).includes(claim) && receipt===claim;
}
export interface FinalClaim {
 file:string; line:number; text:string; sourceSha256:string;
 kind:'capability'|'performance'|'history'|'limitation'; surface:string; requirements:string[];
 receipts:(Artifact & {gate:string; requirements:string[]})[];
 assertions:{receipt:string; artifact:string; pointer:string; equals:unknown}[];
}
export interface FinalClaimsConfig { schema:'muse301-final-claims/v1'; source:SourceIdentity; documents:Artifact[]; claims:FinalClaim[]; historicalInventory:{file:string;sourceSha256:string;line:number;text:string;reason:string}[]; structuralLines?:{file:string;sourceSha256:string;line:number;text:string}[]; descriptiveLines?:{file:string;sourceSha256:string;line:number;text:string}[] }
export function finalClaimsDocuments(root:string):string[] {
 const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim().split('\0').filter(Boolean);
 return [...new Set([...CONTROLLED_CLAIM_DOCUMENTS,...git('diff','--name-only',SOURCE_AUDIT_BASELINE,'-z'),...git('ls-files','--others','--exclude-standard','-z')])].filter(p=>existsSync(resolve(root,p)) && /\.(md|html|txt)$/.test(p) && (/^(docs|marketing|apps|examples|templates|packages\/create-aura3d\/templates)\//.test(p)||['README.md','CHANGELOG.md','llms.txt','public/llms.txt'].includes(p)) && !/(^|\/)(dist|node_modules|reports)\//.test(p)).sort();
}
export function validateFinalClaims(root:string, config:FinalClaimsConfig, now=Date.now()) {
 const errors:string[]=[]; const rows:{file:string;line:number;status:'verified'|'unverified';errors:string[]}[]=[];
 const current=sourceIdentity(root);const expectedDocuments=finalClaimsDocuments(root);
 if(config.schema!=='muse301-final-claims/v1'||!sameSource(config.source,current))errors.push('schema/source identity mismatch');
 if(!isDeepStrictEqual(config.documents?.map(x=>x.path).sort(),expectedDocuments))errors.push('incomplete changed-public-document inventory');
 const requirements=loadMuse301ExecutionRequirements(root);const expand=(ids:string[],seen=new Set<string>()):string[]=>ids.flatMap(id=>{
  if(seen.has(id))throw new Error(`Cyclic claim requirement:${id}`);
  const requirement=requirements.find(r=>r.id===id);if(!requirement)throw new Error(`Unknown claim requirement:${id}`);
  if(requirement.derivation)throw new Error(`Final aggregate cannot prove a claim:${id}`);
  return requirement.allOf?expand(requirement.allOf,new Set([...seen,id])):[id];
 });
 const safe=(p:string)=>!relative(root,resolve(root,p)).startsWith('..');
 for(const doc of config.documents??[])if(!safe(doc.path)||!existsSync(resolve(root,doc.path))||artifact(root,doc.path).sha256!==doc.sha256)errors.push(`document hash mismatch:${doc.path}`);
 const documentInvariants=validateDocumentInvariants(root);errors.push(...documentInvariants.errors);
 errors.push(...validateReleaseClaimCoverage(config.claims??[],path=>readFileSync(resolve(root,path),'utf8')));
 const covered=new Set<string>();
 const structuralCache=new Map<string,Set<number>>();
 const structuralSet=(file:string):Set<number>=>{
  let set=structuralCache.get(file);
  if(!set){set=structuralDocumentLineNumbers(readFileSync(resolve(root,file),'utf8'));structuralCache.set(file,set);}
  return set;
 };
 for(const row of config.structuralLines??[]) {
  const key=`${row.file}:${row.line}`;
  if(!expectedDocuments.includes(row.file)||!safe(row.file)||!existsSync(resolve(root,row.file))||artifact(root,row.file).sha256!==row.sourceSha256||readFileSync(resolve(root,row.file),'utf8').split('\n')[row.line-1]!==row.text||!structuralSet(row.file).has(row.line)||covered.has(key))errors.push(`invalid structural classification:${key}`);
  else covered.add(key);
 }
 /*
  * Descriptive prose. Each row must still bind its exact file, hash and line, and
  * must independently satisfy the negative claim-bearing test, so this cannot be
  * used to exempt a sentence that actually asserts something.
  */
 for(const row of config.descriptiveLines??[]) {
  const key=`${row.file}:${row.line}`;
  if(!expectedDocuments.includes(row.file)||!safe(row.file)||!existsSync(resolve(root,row.file))||artifact(root,row.file).sha256!==row.sourceSha256||readFileSync(resolve(root,row.file),'utf8').split('\n')[row.line-1]!==row.text||structuralSet(row.file).has(row.line)||!isDescriptiveDocumentLine(row.text)||covered.has(key))errors.push(`invalid descriptive classification:${key}`);
  else covered.add(key);
 }
 for(const claim of config.claims??[]) {
  const issues:string[]=[];const fail=(s:string)=>issues.push(s);
  let lines:string[]=[];try{lines=readFileSync(resolve(root,claim.file),'utf8').split('\n');}catch{fail('missing claim source');}
  if(!expectedDocuments.includes(claim.file)||!safe(claim.file)||!existsSync(resolve(root,claim.file))||artifact(root,claim.file).sha256!==claim.sourceSha256||lines[claim.line-1]!==claim.text)fail('claim does not bind exact source line');
  if(covered.has(`${claim.file}:${claim.line}`))fail('duplicate claim line');covered.add(`${claim.file}:${claim.line}`);
  if(!['capability','performance','history','limitation'].includes(claim.kind)||!(CLAIM_SURFACES as readonly string[]).includes(claim.surface)||!claim.requirements?.length)fail('missing claim kind/surface/requirements');
  let requiredLeaves:string[]=[];try{requiredLeaves=[...new Set(expand(claim.requirements??[]))];}catch(error){fail(String(error));}
  const validReceipts=new Map<string,ReturnType<typeof validateReceipt>>();
  for(const ref of claim.receipts??[]) {
   if(ref.gate==='q02'||/claims/i.test(ref.gate)||!ref.requirements.length||ref.requirements.some(id=>!requiredLeaves.includes(id))) {fail('self-supporting or unmapped receipt');continue;}
   if(ref.requirements.some(id=>!requirements.some(r=>r.id===id&&(r.proofGates??r.gates).includes(ref.gate)))){fail('receipt is not requirement proof owner');continue;}
   const selected=requirements.filter(r=>ref.requirements.includes(r.id));
   // Final claim verification cannot serve as the evidence for another final
   // claim, including when its receipt is routed through the release gate.
   if(selected.some(r=>r.finalClaimsAcceptance)){fail('self-supporting final claims requirement');continue;}
   const taskTests=Object.fromEntries(selected.map(r=>[r.id,r.tests]));
   const taskAcceptance=Object.fromEntries(selected.filter(r=>r.acceptance).map(r=>[r.id,r.acceptance!]));
   const taskCommands=Object.fromEntries(selected.filter(r=>r.commandAcceptance).map(r=>[r.id,r.commandAcceptance!]));
   const taskRoutes=Object.fromEntries(selected.filter(r=>r.routeAcceptance).map(r=>[r.id,r.routeAcceptance!]));
   const taskMarketing=Object.fromEntries(selected.filter(r=>r.marketingAcceptance).map(r=>[r.id,r.marketingAcceptance!]));
   const taskRegistryConsumers=Object.fromEntries(selected.filter(r=>r.registryConsumerAcceptance).map(r=>[r.id,r.registryConsumerAcceptance!]));
   const taskReportRegeneration=Object.fromEntries(selected.filter(r=>r.reportRegenerationAcceptance).map(r=>[r.id,r.reportRegenerationAcceptance!]));
   const taskReleaseSequences=Object.fromEntries(selected.filter(r=>r.releaseSequenceAcceptance).map(r=>[r.id,r.releaseSequenceAcceptance!]));
   const taskSourceAudits=Object.fromEntries(selected.filter(r=>r.sourceAuditAcceptance).map(r=>[r.id,r.sourceAuditAcceptance!]));
   const taskCleanup=Object.fromEntries(selected.filter(r=>r.cleanupAcceptance).map(r=>[r.id,r.cleanupAcceptance!]));
   const taskAssertions=Object.fromEntries(selected.filter(r=>r.assertions).map(r=>[r.id,r.assertions!]));
   const checked=validateReceipt(root,ref,{source:current,gate:ref.gate,now,tasks:ref.requirements,taskTests,taskAcceptance,taskCommands,taskRoutes,taskMarketing,taskRegistryConsumers,taskReportRegeneration,taskReleaseSequences,taskSourceAudits,taskCleanup,taskAssertions});if(checked.receipt&&!claimSurfaceCompatible(claim.surface,checked.receipt.claimSurface)){checked.valid=false;checked.errors.push('claim surface differs from receipt surface');}
   validReceipts.set(ref.path,checked);if(!checked.valid)fail(`invalid receipt:${ref.path}:${checked.errors.join(';')}`);
  }
  for(const id of requiredLeaves)if(!requirements.some(r=>r.id===id)||!claim.receipts?.some(r=>r.requirements.includes(id)&&validReceipts.get(r.path)?.valid))fail(`missing validated requirement receipt:${id}`);
  if(!claim.assertions?.length)fail('missing exact claim value comparison');
  for(const a of claim.assertions??[]) {
   const receipt=validReceipts.get(a.receipt)?.receipt;
   if(!receipt?.artifacts.some(x=>x.path===a.artifact)||!a.pointer.startsWith('/')){fail('unbound claim assertion');continue;}
   try {let actual:any=JSON.parse(readFileSync(resolve(root,a.artifact),'utf8'));for(const key of a.pointer.slice(1).split('/').map(x=>x.replace(/~1/g,'/').replace(/~0/g,'~'))){if(actual===null||typeof actual!=='object'||!Object.hasOwn(actual,key))throw new Error('missing assertion pointer');actual=actual[key];}if(!isDeepStrictEqual(actual,a.equals))fail(`claim value mismatch:${a.artifact}${a.pointer}`);}catch{fail('unreadable claim assertion');}
  }
  rows.push({file:claim.file,line:claim.line,status:issues.length?'unverified':'verified',errors:issues});
 }
 // No classifier can silently omit prose: every nonempty changed document line
 // needs an explicit table row, including headings, examples and negative claims.
 for(const file of expectedDocuments)readFileSync(resolve(root,file),'utf8').split('\n').forEach((line,i)=>{if(line.trim()&&!covered.has(`${file}:${i+1}`))errors.push(`unmapped document line:${file}:${i+1}`);});
 const inventory=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(p=>p.endsWith('.md')&&existsSync(resolve(root,p))&&!/^(archive|release-artifacts|tests\/reports|\.goal|\.orchestrate)\//.test(p));
 const historicalKeys=new Set<string>();
 for(const file of [...new Set(inventory)])readFileSync(resolve(root,file),'utf8').split('\n').forEach((text,i)=>{
  if(!/\b(?:2\.0\.4|3\.0\.0)\b/.test(text))return;
  const key=`${file}:${i+1}`;historicalKeys.add(key);
  const matches=(config.historicalInventory??[]).filter(x=>x.file===file&&x.line===i+1);
  if(matches.length!==1||matches[0]!.text!==text||matches[0]!.sourceSha256!==artifact(root,file).sha256||typeof matches[0]!.reason!=='string'||matches[0]!.reason.trim().length<30)errors.push(`unclassified historical reference:${key}`);
 });
 for(const row of config.historicalInventory??[])if(!historicalKeys.has(`${row.file}:${row.line}`))errors.push(`extraneous historical reference:${row.file}:${row.line}`);
 return {schema:'muse301-final-claims-validation/v1',source:current,documents:expectedDocuments,documentInvariants,rows,errors,status:errors.length||rows.some(r=>r.status!=='verified')?'unverified':'verified'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const configPath=process.argv[2];if(!configPath)throw new Error('Usage: claims.ts <source-table.json> [output.json]');
 const root=process.cwd();const result={...validateFinalClaims(root,JSON.parse(readFileSync(configPath,'utf8'))),validationInput:artifact(root,configPath),command:process.argv};
 const out=process.argv[3]??'tests/reports/muse3jsparity-final-claims.json';mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({out,status:result.status,errors:result.errors.length,claims:result.rows.length}));if(result.status!=='verified')process.exitCode=1;
}
