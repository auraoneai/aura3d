import { describe, expect, it } from 'vitest';
import { validateAcceptance, type ParticleAcceptance, type VisualMatrixAcceptance } from '../../../tools/muse3jsparity-readiness/acceptance';
import { sha256, type SourceIdentity } from '../../../tools/muse3jsparity-readiness/source-identity';
import { REQUIRED_VISUAL_QUALITY_METRIC, VISUAL_FAMILIES } from '../../../tools/muse3jsparity-readiness/visual-acceptance';
const particles = (): ParticleAcceptance => ({ schema: 'muse301-particles/v1', nativeWebGPU: true, adapter: 'Apple Metal', referenceDevice: 'reference M3', thermalConditions: 'nominal', foreground: true, readbackBytes: 0,
 samples: Array.from({length: 3601},(_,i) => ({atMs:i*1000/60,frameId:i,frameMs:1000/60,live:10000,rendered:10000,width:1280,height:720,features:{collision:1,trails:1,subemitters:1,turbulence:1,lifeCurves:1,lighting:1,softDepthFade:1}})) });
describe('typed quantitative acceptance', () => {
 it('accepts a full stable native 60 second workload', () => expect(validateAcceptance('p01',particles(),[])).toEqual([]));
 it('accepts two distinct coalesced completion observations without dropping either',()=>{
   const d=particles();d.samples[100]!.atMs=d.samples[99]!.atMs;d.samples[100]!.frameMs=0;d.samples[101]!.frameMs=d.samples[101]!.atMs-d.samples[100]!.atMs;
   expect(validateAcceptance('p01',d,[])).toEqual([]);expect(d.samples).toHaveLength(3601);expect(d.samples[100]!.frameMs).toBe(0);
 });
 it.each(['backward','duplicate','nonfinite','fractional'] as const)('rejects invalid completion receipts: %s',kind=>{
   const d=particles();if(kind==='backward')d.samples[100]!.atMs=d.samples[99]!.atMs-1;if(kind==='duplicate')d.samples[100]!.frameId=d.samples[99]!.frameId;if(kind==='nonfinite')d.samples[100]!.atMs=Infinity;if(kind==='fractional')d.samples[100]!.frameId=100.5;
   expect(validateAcceptance('p01',d,[]).length).toBeGreaterThan(0);
 });
 it('rejects a zero-duration capture even with distinct frame IDs',()=>{const d=particles();d.samples.forEach(s=>{s.atMs=0;s.frameMs=0;});expect(validateAcceptance('p01',d,[])).toContain('particle window shorter than 60 seconds');});
 it.each(['live','rendered'] as const)('rejects a single deficient %s sample despite sufficient capacity',field => {const d=particles();d.samples[100][field]=9999;expect(validateAcceptance('p01',d,[])).toContain('invalid particle workload/sample');});
 it('rejects feature reduction and changing resolution',()=>{const d=particles();d.samples[5].features.trails=0;d.samples[6].width=640;expect(validateAcceptance('p01',d,[])).toHaveLength(2);});
 it('rejects dropped frame records',()=>{const d=particles();d.samples.splice(50,1);expect(validateAcceptance('p01',d,[])).toContain('non-contiguous frames or changed workload resolution');});
 it('rejects short capture',()=>{const d=particles();d.samples.pop();expect(validateAcceptance('p01',d,[])).toContain('particle window shorter than 60 seconds');});
 it('rejects sustained rolling slowdown despite fast intervening frames and passing global percentiles', () => {
   const d = particles();
   // Two seconds alternate 10/30 ms frames: 50 FPS, with no contiguous
   // individually slow run longer than 30 ms and fewer than 5% slow samples.
   for (let i = 100; i < 200; i++) d.samples[i]!.frameMs = i % 2 === 0 ? 10 : 30;
   for (let i = 1; i < d.samples.length; i++) d.samples[i]!.atMs = d.samples[i - 1]!.atMs + d.samples[i]!.frameMs;
   expect(validateAcceptance('p01', d, [])).toEqual(['sustained particle interval below 55 fps']);
 });
 it('uses the producer p95 boundary and excludes the pre-window frame', () => {
   const d = particles();
   for (let i = 1; i < d.samples.length; i++) {
     if (i % 20 === 0) d.samples[i]!.frameMs = 21;
     d.samples[i]!.atMs = d.samples[i - 1]!.atMs + d.samples[i]!.frameMs;
   }
   expect(validateAcceptance('p01', d, [])).toEqual(['particle median/p95 threshold failed']);
 });
 it('rejects software rendering and missing thermal metadata',()=>{const d=particles();d.nativeWebGPU=false;d.thermalConditions='';expect(validateAcceptance('p01',d,[])).toContain('missing native reference hardware/workload metadata');});
 it('rejects invalid/NaN timing',()=>{const d=particles();d.samples[2].frameMs=NaN;expect(validateAcceptance('p01',d,[])).toContain('invalid particle workload/sample');});
 it('requires shadow oracle discrimination and a real 60 second series',()=>{
 const d={schema:'muse301-shadows/v1',oracle:'fixed receiver grid',samplingHz:1,threshold:.05,lightTypes:['spot','point','directional'],samples:Array.from({length:61},(_,i)=>({atMs:i*1000,frameId:i*60,shimmerScore:.01})),controls:{snappingDisabledScore:.1,jitteredLightScore:.2}};
 expect(validateAcceptance('p02',d,[])).toContain('P02 five raw sequences required'); d.controls.snappingDisabledScore=.01; expect(validateAcceptance('p02',d,[])).toContain('P02 five raw sequences required');
 });
 it('rejects partial package/scaffold inventory even when checks claim success',()=>expect(validateAcceptance('l01',{schema:'muse301-packages/v1',version:'3.0.1',packages:[],scaffolds:[],lifecycleAssertions:149,checks:{}},[])).toHaveLength(3));
});

describe('release acceptance fails closed',()=>{
 const context={source:{commit:'abc',fingerprint:'def'},now:Date.parse('2026-09-05T12:00:00Z'),readJson:(_path:string):any=>({})};
 it('requires an external release validation context',()=>expect(validateAcceptance('l02',{schema:'muse301-release/v1'},[])).toContain('missing release validation context'));
 it('requires all five hashed release documents and matching tag',()=>{
 const errors=validateAcceptance('l02',{schema:'muse301-release/v1',version:'3.0.0'},[],context);
 expect(errors).toContain('release version/tag/source mismatch');expect(errors.filter(e=>e==='unbound release evidence')).toHaveLength(5);
 });
 it('rejects synthetic reviewer, wrong artifacts, and incomplete gallery/publication/origin',()=>{
 const artifacts=['manifest','approval','registry','deployment'].map(path=>({path,sha256:path}));
 const documents:any={manifest:{version:'3.0.1',sourceCommit:'abc',sourceFingerprint:'def',generatedAt:'2026-09-05T10:00:00Z',sections:[]},approval:{decision:'approved',reviewer:{kind:'human',id:'ci-fixture',name:'Synthetic reviewer'},independent:true,reviewedAt:'2026-09-05T11:00:00Z'},registry:{},deployment:{}};
 const errors=validateAcceptance('l02',{schema:'muse301-release/v1',version:'3.0.1',tag:'v3.0.1',tagCommit:'abc',visualManifest:artifacts[0],humanApproval:artifacts[1],registry:artifacts[2],deployment:artifacts[3]},artifacts,{...context,readJson:path=>documents[path]});
 for(const error of ['incomplete final review gallery','independent human approval required','human decision origin record required','human decision does not bind final artifacts','incomplete registry package inventory','registry scaffold lifecycles incomplete','deployed origin/content/link proof incomplete'])expect(errors).toContain(error);
 });
});

it('requires four exact downloaded GitHub attachments crossbound to selected release inputs',()=>{
 const ref=(path:string)=>({path,sha256:path});const refs=['github','plan','notes','required','registry','visualManifest','humanApproval','bundleSizes','download-registry','download-visualManifest','download-humanApproval','download-bundleSizes'].map(ref);
 const ids=['registry','visualManifest','humanApproval','bundleSizes'];
 const docs:any={github:{schema:'aura3d-github-release/v1',version:'3.0.1',repository:'auraoneai/aura3d',tag:'v3.0.1',tagCommit:'abc',source:{commit:'abc',fingerprint:'def'},releasePlan:ref('plan'),notes:ref('notes'),assets:[],artifacts:[ref('notes')],requiredArtifacts:ref('required'),attachments:ids.map(id=>({id,expected:ref(id),artifact:ref(id),sha256:id}))},required:{schema:'aura3d-github-required-artifacts/v1',version:'3.0.1',source:{commit:'abc',fingerprint:'def'},releasePlan:ref('plan'),artifacts:ids.map(id=>({id,...ref(id)}))}};
 const data:any={schema:'muse301-release/v1',version:'3.0.1',tag:'v3.0.1',tagCommit:'abc',github:ref('github'),registry:ref('registry'),visualManifest:ref('visualManifest'),humanApproval:ref('humanApproval')};
 const validate=()=>validateAcceptance('l02',data,refs,{source:{commit:'abc',fingerprint:'def'},now:0,readJson:path=>docs[path]??{}});
 expect(validate().filter(e=>/attachment/.test(e))).toEqual([]);
 docs.github.attachments.pop();expect(validate()).toContain('incomplete GitHub downloaded attachment inventory');
 docs.github.attachments.push({id:'bundleSizes',expected:ref('bundleSizes'),artifact:ref('bundleSizes'),sha256:'wrong'});
 expect(validate()).toContain('unbound GitHub required attachment: bundleSizes');
 data.registry=ref('different');expect(validate()).toContain('GitHub attachment differs from approved release input: registry');
});


describe('V01 visual matrix acceptance fails closed', () => {
 const source: SourceIdentity = { commit: 'a'.repeat(40), tree: 'b'.repeat(40), fingerprint: 'c'.repeat(64), lockfileSha256: 'd'.repeat(64) };
 const producerBytes = new TextEncoder().encode('source-bound visual producer');
 const producer = { path: 'tests/browser/muse3jsparity-301-visual.spec.ts', sha256: sha256(producerBytes) };
 const capturePaths = [...VISUAL_FAMILIES.flatMap(family => ['aura', 'three'].flatMap(engine => ['on', 'off', 'repeat', 'broken'].map(state => `tests/reports/muse3jsparity/visual-301-${family}-${engine}-${state}.png`))), ...['aura', 'three'].flatMap(engine => [0, 15, 30, 45, 60].map(frame => `tests/reports/muse3jsparity/visual-301-camera-game-feel-${engine}-frame-${frame}.png`))];
 const artifacts = capturePaths.map((path, index) => ({ path, sha256: index.toString(16).padStart(64, '0') }));
 const matrix = (): VisualMatrixAcceptance => ({
   schema: 'aura3d.visual-matrix-301/v1', producer, source,
   generatedAt: '2026-09-05T11:59:00Z',
   contracts: VISUAL_FAMILIES.map(family => ({
     family, workloadFingerprint: `frozen-${family}`, minimumEffectDelta: 0.01,
     metrics: [{ id: REQUIRED_VISUAL_QUALITY_METRIC[family], direction: 'lower', maximum: 0.2, tieTolerance: 0.01 }],
   })),
   observations: VISUAL_FAMILIES.map(family => ({
     family, workloadFingerprint: `frozen-${family}`, opponentWorkloadFingerprint: `frozen-${family}`,
     aura: { [REQUIRED_VISUAL_QUALITY_METRIC[family]]: 0.1 },
     three: { [REQUIRED_VISUAL_QUALITY_METRIC[family]]: 0.3 },
     controls: { auraEnabledVsDisabled: 0.1, threeEnabledVsDisabled: 0.1, brokenRejected: true },
   })),
   complete: true, qualityTargetsMet: true, superiorityTargetsMet: true,
   superiorityClaims: VISUAL_FAMILIES.map(family => ({ family, verdict: 'win', winningMetrics: [`${REQUIRED_VISUAL_QUALITY_METRIC[family]}: win`] })),
   featureQualityCoverage: Object.fromEntries(VISUAL_FAMILIES.map(family => [family, true])),
   failures: [], fidelitySSIM: Object.fromEntries(VISUAL_FAMILIES.map(family => [family, 0.9])), artifacts: artifacts.map(reference => ({ ...reference })),
 });
 const context = { source, now: Date.parse('2026-09-05T12:00:00Z'), readJson: (_path: string): any => ({}), readBytes: (path: string) => {
   if (path !== producer.path) throw new Error('unexpected path');
   return producerBytes;
 } };
 it('accepts seven measured wins, fixed quality targets, and the exact control captures', () => {
   expect(validateAcceptance('v01', matrix(), artifacts, context)).toEqual([]);
 });
 it('rejects partial matrices and claimed coverage', () => {
   const data = matrix(); data.observations.pop();
   expect(validateAcceptance('v01', data, artifacts, context)).toContain('incomplete visual matrix');
 });
 it('accepts an honest tie when the claim inventory contains only measured wins', () => {
   const original = matrix();
   const family = original.observations[0]!.family;
   const metric = REQUIRED_VISUAL_QUALITY_METRIC[family];
   const data: VisualMatrixAcceptance = { ...original, observations: [
     { ...original.observations[0]!, three: { [metric]: 0.1 } },
     ...original.observations.slice(1)
   ], superiorityClaims: original.superiorityClaims.filter(claim => claim.family !== family) };
   expect(validateAcceptance('v01', data, artifacts, context)).toEqual([]);
 });
 it('rejects a superiority claim for a tied workload', () => {
   const original = matrix();
   const metric = REQUIRED_VISUAL_QUALITY_METRIC[original.observations[0]!.family];
   const data: VisualMatrixAcceptance = { ...original, observations: [
     { ...original.observations[0]!, three: { [metric]: 0.1 } },
     ...original.observations.slice(1)
   ] };
   expect(validateAcceptance('v01', data, artifacts, context)).toContain('visual superiority claims differ from measured wins');
 });
 it('rejects changed producer or source identity', () => {
   const data = matrix(); data.producer = { ...data.producer, sha256: 'f'.repeat(64) };
   expect(validateAcceptance('v01', data, artifacts, context)).toContain('visual matrix producer hash mismatch');
   const changed = matrix(); changed.source = { ...source, fingerprint: 'e'.repeat(64) };
   expect(validateAcceptance('v01', changed, artifacts, context)).toContain('visual matrix source mismatch');
 });
 it('rejects missing, duplicate, or unbound capture receipts', () => {
   const missing = matrix(); missing.artifacts.pop();
   expect(validateAcceptance('v01', missing, artifacts, context)).toContain('visual capture inventory incomplete or duplicated');
   const duplicate = matrix(); duplicate.artifacts[1] = duplicate.artifacts[0]!;
   expect(validateAcceptance('v01', duplicate, artifacts, context)).toContain('visual capture inventory incomplete or duplicated');
   const unbound = matrix(); unbound.artifacts[0] = { ...unbound.artifacts[0]!, sha256: 'f'.repeat(64) };
   expect(validateAcceptance('v01', unbound, artifacts, context)).toContain(`unbound visual capture: ${unbound.artifacts[0]!.path}`);
 });
 it('recomputes feature quality rather than trusting claimed booleans', () => {
   const original = matrix();
   const family = original.observations[0]!.family;
   const data: VisualMatrixAcceptance = { ...original, observations: [
     { ...original.observations[0]!, aura: { [REQUIRED_VISUAL_QUALITY_METRIC[family]]: 0.25 } },
     ...original.observations.slice(1)
   ] };
   expect(validateAcceptance('v01', data, artifacts, context)).toContain(`visual feature quality target failed: ${family}`);
 });
});
