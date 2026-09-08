import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { validateReleaseSequence, validateRegistryPreservation, validateReleasePreflight, type RegistrySnapshot, type ReleasePhase, type ReplayedReleasePhase, type ReleaseSequence } from '../../../tools/muse3jsparity-readiness/release-sequencing';
const names = Array.from({length:29},(_,i)=>`@aura3d/package-${i}`);
const snapshot = (after: boolean): RegistrySnapshot => ({observedAt:`2026-09-05T00:${after?'30':'00'}:00Z`,packages:Object.fromEntries(names.map(name=>[name,{versions:{'3.0.0':{dist:{integrity:'sha512-old'}},...(after?{'3.0.1':{dist:{integrity:'sha512-new'}}}:{})},distTags:{latest:after?'3.0.1':'3.0.0',legacy:'2.0.4'}}]))});
function fixture() {
 const source={commit:'a'.repeat(40),tree:'b'.repeat(40),lockfileSha256:'c'.repeat(64),fingerprint:'d'.repeat(64)};
 const files=new Map<string,Uint8Array>();
 const ref=(path:string,value:unknown)=>{const bytes=Buffer.from(JSON.stringify(value));files.set(path,bytes);return{path,sha256:createHash('sha256').update(bytes).digest('hex')}};
 const rows=new Map<string,ReplayedReleasePhase>();
 const phaseNames:ReleasePhase[]=['baseline','source-audit','packages','capture','gallery','review','preflight','publish','registry','origin','github'];
 const plan=ref('plan.json',{});
 const phases={} as ReleaseSequence['phases'];
 for (const [i,phase] of phaseNames.entries()) {
  const commands=phase==='baseline'?['typecheck','test:unit','test:integration','test:browser','build'].map(c=>['pnpm',c]):phase==='registry'?[['pnpm','verify:package-install-smoke:fresh'],['pnpm','verify:package-provenance'],['pnpm','exec','vitest','run','tests/unit/package-dist']]:phase==='preflight'||phase==='publish'?[['node','tools/release/publish-all.mjs','--from-plan','plan.json',...(phase==='preflight'?['--dry-run']:[])]]:[[phase]];
  phases[phase]=commands.map((command,j)=>{
   const path=`${phase}-${j}.json`;
   const row:ReplayedReleasePhase={source,startedAt:`2026-09-05T00:${String(i*2+1).padStart(2,'0')}:00Z`,endedAt:`2026-09-05T00:${String(i*2+2).padStart(2,'0')}:00Z`,command,errors:[],facts:{artifactHashes:['e'.repeat(64)],reviewerIdentity:'independent human',independent:true,decision:'approved',publishedPackages:names,tagCommit:source.commit,benchmarkRound:'round-actual'}};
   rows.set(path,row); return ref(path,row);
  });
 }
 const value:ReleaseSequence={schema:'muse301-release-sequence/v1',source,releasePlan:plan,phases,registryBefore:ref('before.json',snapshot(false)),registryAfter:ref('after.json',snapshot(true))};
 const context={now:Date.parse('2026-09-05T01:00:00Z'),read:(r:{path:string})=>files.get(r.path)!,replay:(_p:ReleasePhase,r:{path:string})=>rows.get(r.path)!,replayRegistry:()=>[] as string[],replayMachineReadiness:()=>[] as string[],replayPlan:()=>({source,version:'3.0.1',packages:names,errors:[]})};
 return {value,context,source,rows,files};
}
describe('release sequencing evidence',()=>{
 it('accepts canonical frozen-source ordered commands and exact reviewed artifacts',()=>{const f=fixture();expect(validateReleaseSequence(f.value,f.source,f.context)).toEqual([])});
 it.each(['baseline','source-audit','packages'] as const)('rejects %s finishing after capture starts',phase=>{const f=fixture();f.rows.get(`${phase}-0.json`)!.endedAt='2026-09-05T00:20:00Z';expect(validateReleaseSequence(f.value,f.source,f.context)).toContain(`${phase} must finish before capture`)});
 it('rejects reused approval of different pixels',()=>{const f=fixture();f.rows.get('review-0.json')!.facts!.artifactHashes=['f'.repeat(64)];expect(validateReleaseSequence(f.value,f.source,f.context)).toContain('review does not bind exact final captures')});
 it('rejects publication before independent approval',()=>{const f=fixture();f.rows.get('publish-0.json')!.startedAt='2026-09-05T00:10:00Z';expect(validateReleaseSequence(f.value,f.source,f.context)).toContain('review must finish before publish')});
 it('rejects an alleged successful phase whose canonical replay fails',()=>{const f=fixture();f.rows.get('packages-0.json')!.errors=['tarball mismatch'];expect(validateReleaseSequence(f.value,f.source,f.context).join()).toContain('canonical packages replay/source failed')});
 it('rejects publishing by repacking instead of the frozen plan',()=>{const f=fixture();f.rows.get('publish-0.json')!.command=['node','tools/release/publish-all.mjs'];expect(validateReleaseSequence(f.value,f.source,f.context)).toContain('missing exact frozen-plan publication command')});
 it('rejects a mutated retained receipt',()=>{const f=fixture();f.files.set('capture-0.json',Buffer.from('{}'));expect(validateReleaseSequence(f.value,f.source,f.context).join()).toContain('hash mismatch')});
 it('rejects incomplete machine work before capture',()=>{const f=fixture();f.context.replayMachineReadiness=()=>['route missing'];expect(validateReleaseSequence(f.value,f.source,f.context)).toContain('full machine readiness not established before final capture')});
 it('rejects unauthenticated registry snapshots',()=>{const f=fixture();f.context.replayRegistry=()=>['no raw HTTP response'];expect(validateReleaseSequence(f.value,f.source,f.context)).toContain('canonical registry observation replay failed')});
 it('rejects a tag pointing to another commit',()=>{const f=fixture();f.rows.get('github-0.json')!.facts!.tagCommit='f'.repeat(40);expect(validateReleaseSequence(f.value,f.source,f.context)).toContain('release tag differs from validated commit')});
});
describe('historical npm preservation',()=>{
 it('allows only the new version and latest tag',()=>expect(validateRegistryPreservation(snapshot(false),snapshot(true),names)).toEqual([]));
 it('rejects deprecating an old version',()=>{const after=snapshot(true);after.packages[names[0]].versions['3.0.0'].deprecated='obsolete';expect(validateRegistryPreservation(snapshot(false),after,names).join()).toContain('historical version mutated')});
 it('rejects changing historical tarball integrity',()=>{const after=snapshot(true);after.packages[names[0]].versions['3.0.0'].dist={integrity:'different'};expect(validateRegistryPreservation(snapshot(false),after,names).join()).toContain('historical version mutated')});
 it('rejects changing a legacy dist tag',()=>{const after=snapshot(true);after.packages[names[0]].distTags.legacy='3.0.1';expect(validateRegistryPreservation(snapshot(false),after,names).join()).toContain('historical dist-tag mutated')});
 it('rejects a target already published at preflight',()=>expect(validateRegistryPreservation(snapshot(true),snapshot(true),names).join()).toContain('preflight target already published'));
});

describe('prepublication preflight',()=>{
 it('validates without requiring future publication or approval',()=>{const f=fixture();expect(validateReleasePreflight({...f.value,packages:f.value.phases.packages[0],preflight:f.value.phases.preflight[0]},f.source,f.context)).toEqual([])});
 it('rejects packaging changed source after validation',()=>{const f=fixture();f.rows.get('packages-0.json')!.source={...f.source,fingerprint:'f'.repeat(64)};expect(validateReleasePreflight({...f.value,packages:f.value.phases.packages[0],preflight:f.value.phases.preflight[0]},f.source,f.context)).toContain('preflight dependency canonical replay failed')});
});

import { replayRegistryHttpSnapshot } from '../../../tools/muse3jsparity-readiness/release-sequence-replay';
import { releaseSequenceAcceptanceForRequirement } from '../../../tools/muse3jsparity-readiness/requirements';
describe('operational raw registry replay',()=>{
 function rawFixture(){const s:any=snapshot(true);s.schema='muse301-registry-snapshot/v1';s.registry='https://registry.npmjs.org';const files=new Map<string,Buffer>();s.responses=names.map((name,i)=>{const data=Buffer.from(JSON.stringify({name,versions:s.packages[name].versions,'dist-tags':s.packages[name].distTags}));const path=`raw-${i}.json`;files.set(path,data);return{name,method:'GET',status:200,url:`https://registry.npmjs.org/${encodeURIComponent(name)}`,body:{path,sha256:createHash('sha256').update(data).digest('hex')}}});return{s,read:(r:{path:string})=>files.get(r.path)!}}
 it('reconstructs all metadata from the raw HTTP bodies',()=>{const f=rawFixture();expect(replayRegistryHttpSnapshot(f.s,f.read)).toEqual([])});
 it('rejects normalized metadata hiding an old-version deprecation',()=>{const f=rawFixture();f.s.packages[names[0]].versions['3.0.0'].deprecated='hidden';expect(replayRegistryHttpSnapshot(f.s,f.read).join()).toContain('differs from raw HTTP bodies')});
 it('rejects third-party registry observations',()=>{const f=rawFixture();f.s.responses[0].url='https://example.com/npm';expect(replayRegistryHttpSnapshot(f.s,f.read).join()).toContain('endpoint/status')});
 it('rejects missing historical package inventory',()=>{const f=rawFixture();f.s.responses.pop();expect(replayRegistryHttpSnapshot(f.s,f.read).join()).toContain('Incomplete npm HTTP observations')});
 it('keeps preflight independent from publication contracts',()=>{expect(releaseSequenceAcceptanceForRequirement('L5.check.1')?.mode).toBe('preflight');expect(releaseSequenceAcceptanceForRequirement('3.0.1:FINAL.check.29')?.mode).toBe('release');expect(releaseSequenceAcceptanceForRequirement('L5.task.3')).toBeUndefined()});
});
