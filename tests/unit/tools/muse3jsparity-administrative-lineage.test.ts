import {it,expect,afterEach} from 'vitest';
import {validateAdministrativePrdDelta,type AdministrativePrdChange} from '../../../tools/muse3jsparity-readiness/administrative-lineage';
import {sha256} from '../../../tools/muse3jsparity-readiness/evidence-lineage';
const frozen='Status: **IN PROGRESS**\n### R01. Async\n1. Preserve all modes\n- [ ] Verify exact output';
const current=frozen.replace('[ ]','[x]');
const change:AdministrativePrdChange={line:4,beforeSha256:sha256(frozen.split('\n')[3]),afterSha256:sha256(current.split('\n')[3]),kind:'checkbox',evidence:[{path:'verified.json',sha256:'a'.repeat(64)}]};
it('allows evidence-bound status only without rewriting requirement semantics',()=>expect(validateAdministrativePrdDelta(frozen,current,[change],()=>true)).toEqual([]));
it('rejects unverifiable status, unclassified edits, removed/reworded obligations',()=>{
 expect(validateAdministrativePrdDelta(frozen,current,[change],()=>false)).toHaveLength(1);
 expect(validateAdministrativePrdDelta(frozen,current,[],()=>true)).toContain('Unclassified PRD edit: 4');
 expect(validateAdministrativePrdDelta(frozen,current.replace('all modes','some modes'),[change],()=>true)).toContain('Administrative edits changed executable requirements');
 expect(validateAdministrativePrdDelta(frozen,current+'\nnew requirement',[change],()=>true)).toHaveLength(1);
});
it('does not treat appended arbitrary prose as an administrative verification record',()=>{
 const altered=current+' except unsupported modes';const record={...change,afterSha256:sha256(altered.split('\n')[3])};
 expect(validateAdministrativePrdDelta(frozen,altered,[record],()=>true)).toContain('Requirement text changed: 4');
});


import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateAdministrativeDecision,type AdministrativeDecisionContext} from '../../../tools/muse3jsparity-readiness/administrative-lineage';
import {artifact,type ProducerReceipt} from '../../../tools/muse3jsparity-readiness/evidence-lineage';
import {reduceReadiness,deriveReleaseVerification,REQUIRED_PARTS,type GateResult} from '../../../tools/muse3jsparity-readiness/contracts';
const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
function decisionFixture(){
 const root=mkdtempSync(join(tmpdir(),'muse301-admin-'));roots.push(root);
 const now=Date.parse('2026-09-05T12:00:00Z');
 const source={commit:'a'.repeat(40),tree:'b'.repeat(40),fingerprint:'c'.repeat(64),lockfileSha256:'d'.repeat(64)};
 const testFile='tests/unit/proof.test.ts';
 const requirements=REQUIRED_PARTS.map((part,i)=>({id:i===0?'3.0.1:R01.check.1':`original:${part}`,part,gates:['fixture'],tests:[testFile],sourceLine:i===0?4:100+i,sourceText:'Verify exact output'}));
 const assertions={testResults:[{name:testFile,assertionResults:[{fullName:'actual output',status:'passed'}]}]};
 const receipt:ProducerReceipt={schema:'muse3jsparity-producer/v1',runId:'unit-fixture',gate:'fixture',tasks:requirements.map(r=>r.id),command:['pnpm','exec','vitest','run',testFile],cwd:root,exitCode:0,startedAt:new Date(now-60000).toISOString(),endedAt:new Date(now-30000).toISOString(),source,claimSurface:'unit fixture',environment:{browser:'not applicable',backend:'node',hardware:'unit fixture'},artifacts:[],packages:[],tarballs:[],proofs:requirements.map(r=>({task:r.id,report:'assertions.json',testFile,testTitle:'actual output'}))};
 let result:GateResult={gate:'fixture',parts:REQUIRED_PARTS,tasks:receipt.tasks,verdict:'pass',detail:'verified',receipt:'producer.json',receiptHash:'',receiptValid:true};
 requirements.push({id:'3.0.1:FINAL.archive',part:'L',gates:['archive'],tests:[],sourceLine:99,sourceText:'Archive completed PRD'});
 const context:AdministrativeDecisionContext={frozenSource:source,requirements,frozenPrd:frozen,currentPrd:current,now,replayGate:()=>[],baselineGates:['fixture']};
 function save(){
  writeFileSync(join(root,'assertions.json'),JSON.stringify(assertions));receipt.artifacts=[artifact(root,'assertions.json')];
  writeFileSync(join(root,'producer.json'),JSON.stringify(receipt));const ref=artifact(root,'producer.json');
  result={...result,receiptHash:ref.sha256};
  mkdirSync(join(root,'archive'),{recursive:true});
  const snapshot={...deriveReleaseVerification(requirements,[result]),source,runId:'unit-fixture',generatedAt:new Date(now-10000).toISOString(),receipts:{fixture:ref}};
  writeFileSync(join(root,'archive/release-verification.json'),JSON.stringify(snapshot));writeFileSync(join(root,'archive/muse3jsparity-3.0.1-PRD.md'),frozen);
  const archive:ProducerReceipt={...receipt,gate:'archive',tasks:['3.0.1:FINAL.archive'],startedAt:new Date(now-10000).toISOString(),endedAt:new Date(now-5000).toISOString(),proofs:[],artifacts:[artifact(root,'archive/release-verification.json'),artifact(root,'archive/muse3jsparity-3.0.1-PRD.md')]};
  writeFileSync(join(root,'archive/producer.json'),JSON.stringify(archive));const archiveRef=artifact(root,'archive/producer.json');
  const results=[result,{gate:'archive',tasks:archive.tasks,parts:['L'],verdict:'pass' as const,receipt:archiveRef.path,receiptHash:archiveRef.sha256,receiptValid:true,detail:'verified'}];
  const report={schema:'muse3jsparity-readiness/v2',runId:'unit-fixture',generatedAt:new Date(now).toISOString(),scope:'full',source,baseline:{unitTotalFloor:4417,unitFailedCeiling:0,renderingTotalFloor:983},gates:results,...reduceReadiness(requirements,results,{scope:'full'}),receipts:{fixture:ref,archive:archiveRef}};
  writeFileSync(join(root,'readiness.json'),JSON.stringify(report));return artifact(root,'readiness.json');
 }
 return {root,context,receipt,assertions,save,check:()=>validateAdministrativeDecision(root,save(),change,context)};
}
it('replays underlying assertions and maps the exact checkbox line before accepting final report evidence',()=>{
 const f=decisionFixture();expect(f.check()).toEqual({valid:true,errors:[]});
});
it('does not accept forged all-green report states when retained assertions failed',()=>{
 const f=decisionFixture();f.assertions.testResults[0].assertionResults[0].status='failed';
 expect(f.check().errors).toContain('Underlying release requirements are not complete');
});
it('replays baseline-specific validators, not just successful command status',()=>{
 const f=decisionFixture();f.context.replayGate=()=>['unit floor failed'];
 expect(f.check().errors).toContain('fixture: unit floor failed');
});
it('rejects generic hashed producer receipts as administrative decision evidence',()=>{
 const f=decisionFixture();f.save();expect(validateAdministrativeDecision(f.root,artifact(f.root,'producer.json'),change,f.context).valid).toBe(false);
});
it('rejects changed producer source and receipts completed after report generation',()=>{
 const f=decisionFixture();f.receipt.source={...f.receipt.source,fingerprint:'e'.repeat(64)};expect(f.check().errors).toContain('fixture: source mismatch');
 f.receipt.source=f.context.frozenSource;f.receipt.endedAt=new Date(f.context.now+1).toISOString();expect(f.check().valid).toBe(false);
});
it('requires every obligation on a checkbox line and refuses unrelated lines',()=>{
 const f=decisionFixture();f.context.requirements[0].sourceLine=5;
 expect(f.check().errors).toContain('Checkbox line has no executable obligation');
 f.context.requirements[0].sourceLine=4;f.context.requirements[1].sourceLine=4;f.context.requirements[1].id='3.0.1:R01.check.2';
 expect(f.check().valid).toBe(false);
});
it('rejects tampered report bytes and mismatched reported task status',()=>{
 const f=decisionFixture();const ref=f.save();writeFileSync(join(f.root,'readiness.json'),'{}');expect(validateAdministrativeDecision(f.root,ref,change,f.context).valid).toBe(false);
 const validRef=f.save();const report=JSON.parse(requireRead(f.root));report.tasks['3.0.1:R01.check.1']='blocked';writeFileSync(join(f.root,'readiness.json'),JSON.stringify(report));
 expect(validateAdministrativeDecision(f.root,artifact(f.root,validRef.path),change,f.context).errors).toContain('Final report status does not match independently replayed evidence');
});
import {readFileSync} from 'node:fs';
function requireRead(root:string){return readFileSync(join(root,'readiness.json'),'utf8');}

it('allows completed status only after the full underlying release passes',()=>{
 const f=decisionFixture();f.context.currentPrd=frozen.replace('IN PROGRESS','COMPLETE');
 const statusChange:AdministrativePrdChange={...change,line:1,kind:'status',beforeSha256:sha256(frozen.split('\n')[0]),afterSha256:sha256(f.context.currentPrd.split('\n')[0])};
 expect(validateAdministrativeDecision(f.root,f.save(),statusChange,f.context).valid).toBe(true);
 f.assertions.testResults[0].assertionResults[0].status='failed';
 expect(validateAdministrativeDecision(f.root,f.save(),statusChange,f.context).valid).toBe(false);
});
it('uses report completion time for historical replay but never permits future reports',()=>{
 const f=decisionFixture();const ref=f.save();f.context.now+=86400000;
 expect(validateAdministrativeDecision(f.root,ref,change,f.context).valid).toBe(true);
 f.context.now-=86400001;expect(validateAdministrativeDecision(f.root,ref,change,f.context).valid).toBe(false);
});
it.each(['prd','phase'])('rejects rehashed fabricated archive %s despite green final flags',kind=>{
 const f=decisionFixture();f.save();
 const path=kind==='prd'?'archive/muse3jsparity-3.0.1-PRD.md':'archive/release-verification.json';
 if(kind==='prd')writeFileSync(join(f.root,path),current);
 else {const phase=JSON.parse(readFileSync(join(f.root,path),'utf8'));phase.requiredLeafIds=[];writeFileSync(join(f.root,path),JSON.stringify(phase));}
 const archive=JSON.parse(readFileSync(join(f.root,'archive/producer.json'),'utf8'));archive.artifacts=archive.artifacts.map((ref:{path:string})=>artifact(f.root,ref.path));writeFileSync(join(f.root,'archive/producer.json'),JSON.stringify(archive));
 const report=JSON.parse(requireRead(f.root));const ref=artifact(f.root,'archive/producer.json');report.receipts.archive=ref;report.gates.find((r:{gate:string})=>r.gate==='archive').receiptHash=ref.sha256;writeFileSync(join(f.root,'readiness.json'),JSON.stringify(report));
 const result=validateAdministrativeDecision(f.root,artifact(f.root,'readiness.json'),change,f.context);
 expect(result.errors).toContain(kind==='prd'?'Archived PRD differs from frozen release PRD':'Archive snapshot differs from independently verified release phase');
});

it.each([
 ['routeAcceptance',{schema:'aura3d-301-route-acceptance/v1',kind:'routes'},'missing route proof'],
 ['marketingAcceptance',{schema:'muse301-marketing-build/v1',mode:'build'},'missing marketing proof'],
 ['registryConsumerAcceptance',{schema:'muse301-registry-consumer/v1'},'missing registry consumer'],
 ['reportRegenerationAcceptance',{schema:'muse301-report-regeneration/v1'},'missing report regeneration'],
 ['releaseSequenceAcceptance',{schema:'muse301-release-sequence/v1',mode:'release'},'missing release sequence linkage'],
])('administrative replay preserves mandatory %s contracts', (field,contract,message)=>{
 const f=decisionFixture();
 Object.assign(f.context.requirements[0]!,{[field as string]:contract});
 expect(f.check().errors.join(' ')).toContain(message);
});
