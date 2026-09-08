import { validateRawShadowAcceptance } from './shadow-acceptance';
import { measureParticlePacing } from "./particle-pacing";
import { evaluateVisualMatrix, REQUIRED_VISUAL_QUALITY_METRIC, VISUAL_FAMILIES, type VisualContract, type VisualObservation } from "./visual-acceptance";
import { sha256, sameSource, type SourceIdentity } from "./source-identity";
/** Acceptance data is an artifact of the producer, never a receipt's boolean assertion. */
export interface ParticleSample { atMs: number; frameId: number; frameMs: number; live: number; rendered: number; width: number; height: number; features: Record<string, number> }
export interface ParticleAcceptance { schema: 'muse301-particles/v1'; nativeWebGPU: boolean; adapter: string; referenceDevice: string; thermalConditions: string; foreground: boolean; readbackBytes: number; samples: ParticleSample[] }
export interface ShadowAcceptance { schema: 'muse301-shadows/v1'; samples: { atMs: number; frameId: number; shimmerScore: number }[]; threshold: number; controls: { snappingDisabledScore: number; jitteredLightScore: number }; oracle: string; samplingHz: number; lightTypes: string[] }
export interface PackageAcceptance { schema: 'muse301-packages/v1'; version: '3.0.1'; packages: { name: string; manifest: string; tarball: string; sha256: string }[]; scaffolds: { name: string; sourcePassed: boolean; installedPassed: boolean; tarballHashes: string[] }[]; lifecycleAssertions: number; checks: Record<string, boolean> }
export interface ReleaseAcceptance { schema: 'muse301-release/v1'; version: '3.0.1'; tag: 'v3.0.1'; tagCommit: string; visualManifest: { path: string; sha256: string }; humanApproval: { path: string; sha256: string }; registry: { path: string; sha256: string }; deployment: { path: string; sha256: string }; github: {path:string;sha256:string} }
export interface VisualMatrixAcceptance {
  schema: 'aura3d.visual-matrix-301/v1';
  producer: { path: string; sha256: string };
  source: SourceIdentity;
  generatedAt: string;
  contracts: VisualContract[];
  observations: VisualObservation[];
  complete: boolean;
  qualityTargetsMet: boolean;
  superiorityTargetsMet: boolean;
  superiorityClaims: { family: string; verdict: string; winningMetrics: string[] }[];
  featureQualityCoverage: Record<string, boolean>;
  failures: string[];
  fidelitySSIM: Record<string, number>;
  artifacts: { path: string; sha256: string }[];
}
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const populated = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const FEATURES = ['collision', 'trails', 'subemitters', 'turbulence', 'lifeCurves', 'lighting', 'softDepthFade'];
export const ACCEPTANCE_SCHEMAS: Readonly<Record<string,string>> = { p01: 'muse301-particles/v1', p02: 'muse301-shadows/v1', v01: 'aura3d.visual-matrix-301/v1', l01: 'muse301-packages/v1', l02: 'muse301-release/v1' };
export function validateAcceptance(gate: string, raw: unknown, artifacts: readonly { path: string; sha256: string }[], context?: { source: Pick<SourceIdentity, 'commit' | 'fingerprint'> & Partial<Pick<SourceIdentity, 'tree' | 'lockfileSha256'>>; now: number; readJson: (path: string) => any; readBytes?: (path: string) => Uint8Array }): string[] {
  const errors: string[] = [];
  if (!ACCEPTANCE_SCHEMAS[gate]) return errors;
  if (!raw || typeof raw !== 'object') return ['missing typed acceptance data'];
  const data = raw as any;
  if (data.schema !== ACCEPTANCE_SCHEMAS[gate]) return ['wrong acceptance schema'];
  if (gate === 'p01') {
    const d = data as ParticleAcceptance;
    if (d.nativeWebGPU !== true || d.foreground !== true || !populated(d.adapter) || !/metal/i.test(d.adapter) || /swiftshader|software|llvmpipe/i.test(d.adapter) || !populated(d.referenceDevice) || !populated(d.thermalConditions) || !finite(d.readbackBytes) || d.readbackBytes < 0) errors.push('missing native reference hardware/workload metadata');
    const samples = d.samples;
    if (!Array.isArray(samples) || samples.length < 2) return [...errors, 'missing particle samples'];
    if (!samples.every(s => s && [s.atMs,s.frameId,s.frameMs,s.live,s.rendered,s.width,s.height].every(finite) && Number.isSafeInteger(s.frameId) && s.frameId >= 0 && s.frameMs >= 0 && s.live >= 10000 && s.rendered >= 10000 && s.width >= 1280 && s.height >= 720 && FEATURES.every(f => finite(s.features?.[f]) && s.features[f] > 0))) errors.push('invalid particle workload/sample');
    if (samples.some((s,i) => i > 0 && (s.atMs < samples[i-1].atMs || s.frameId !== samples[i-1].frameId + 1 || s.width !== samples[0].width || s.height !== samples[0].height))) errors.push('non-contiguous frames or changed workload resolution');
    if (samples.at(-1)!.atMs - samples[0].atMs < 60000) errors.push('particle window shorter than 60 seconds');
    if (samples.some((s,i) => i > 0 && Math.abs((s.atMs - samples[i-1].atMs) - s.frameMs) > 1)) errors.push('frame timings disagree with capture timestamps');
    // The first sample begins the window; its prior-frame duration is outside it.
    // Match the producer's timestamp-derived intervals and frozen quantile index.
    const timings = samples.slice(1).map((s, i) => s.atMs - samples[i]!.atMs).sort((a,b) => a-b);
    const percentile = (p: number) => timings[Math.min(timings.length - 1, Math.floor(p * timings.length))]!;
    if (1000 / percentile(.5) < 59 || percentile(.95) > 20) errors.push('particle median/p95 threshold failed');
    // Replay the same rolling completed-frame cadence as the native producer.
    // Fast individual frames do not erase a sustained slow rolling interval.
    const timestamps = samples.map(s => s?.atMs);
    if (timestamps.at(-1)! > timestamps[0]!
      && timestamps.every((at, i) => finite(at) && (i === 0 || at >= timestamps[i - 1]!))
      && samples.every((s,i)=>Number.isSafeInteger(s.frameId)&&s.frameId>=0&&(i===0||s.frameId===samples[i-1]!.frameId+1))
      && measureParticlePacing(timestamps,samples.map(s=>s.frameId)).longestBelow55Ms > 1000) {
      errors.push('sustained particle interval below 55 fps');
    }
  }
  if (gate === 'p02') errors.push(...validateRawShadowAcceptance(data));
  if (gate === 'v01') {
    if (!context) return ['missing visual-matrix validation context'];
    const d = data as VisualMatrixAcceptance;
    const bound = (reference: any): boolean => !!reference && typeof reference.path === 'string'
      && /^[a-f0-9]{64}$/.test(reference.sha256)
      && artifacts.some(artifact => artifact.path === reference.path && artifact.sha256 === reference.sha256);
    if (!d.source || !sameSource(d.source, context.source as SourceIdentity)) errors.push('visual matrix source mismatch');
    const generatedAt = Date.parse(d.generatedAt);
    if (!Number.isFinite(generatedAt) || generatedAt > context.now) errors.push('invalid visual matrix generation time');
    if (d.producer?.path !== 'tests/browser/muse3jsparity-301-visual.spec.ts'
      || !/^[a-f0-9]{64}$/.test(d.producer?.sha256 ?? '')) errors.push('invalid visual matrix producer');
    else if (!context.readBytes) errors.push('missing visual matrix producer reader');
    else {
      try { if (sha256(context.readBytes(d.producer.path)) !== d.producer.sha256) errors.push('visual matrix producer hash mismatch'); }
      catch { errors.push('unreadable visual matrix producer'); }
    }
    const contracts = Array.isArray(d.contracts) ? d.contracts : [];
    const observations = Array.isArray(d.observations) ? d.observations : [];
    const replay = evaluateVisualMatrix(contracts, observations);
    if (!replay.complete || replay.errors.length || replay.outcomes.length !== VISUAL_FAMILIES.length) errors.push('incomplete visual matrix');
    const expectedClaims = replay.outcomes
      .filter(outcome => outcome.verdict === 'win')
      .map(outcome => ({ family: outcome.family, verdict: outcome.verdict, winningMetrics: outcome.reasons.filter(reason => reason.endsWith(': win')) }));
    const actualClaims = Array.isArray(d.superiorityClaims) ? d.superiorityClaims : [];
    if (JSON.stringify(actualClaims) !== JSON.stringify(expectedClaims)
      || actualClaims.some(claim => claim.verdict !== 'win' || !Array.isArray(claim.winningMetrics) || claim.winningMetrics.length === 0)) {
      errors.push('visual superiority claims differ from measured wins');
    }
    const coverage = d.featureQualityCoverage && typeof d.featureQualityCoverage === 'object' ? d.featureQualityCoverage : {};
    for (const family of VISUAL_FAMILIES) {
      const contract = contracts.find(item => item.family === family);
      const observation = observations.find(item => item.family === family);
      const metric = contract?.metrics.find(item => item.id === REQUIRED_VISUAL_QUALITY_METRIC[family]);
      const value = metric && observation?.aura[metric.id];
      const accepted = Boolean(metric && value !== undefined && Number.isFinite(value)
        && observation?.controls.brokenRejected === true
        && (metric.minimum === undefined || value >= metric.minimum)
        && (metric.maximum === undefined || value <= metric.maximum));
      if (!accepted || coverage[family] !== accepted) errors.push(`visual feature quality target failed: ${family}`);
      const fidelity = d.fidelitySSIM?.[family];
      if (!finite(fidelity) || fidelity < -1 || fidelity > 1) errors.push(`invalid visual fidelity metric: ${family}`);
    }
    if (Object.keys(coverage).length !== VISUAL_FAMILIES.length) errors.push('unexpected visual feature coverage');
    if (d.complete !== replay.complete || d.qualityTargetsMet !== true || d.superiorityTargetsMet !== true
      || !Array.isArray(d.failures) || d.failures.length !== 0) errors.push('visual matrix claimed status differs from replay');
    const reportArtifacts = Array.isArray(d.artifacts) ? d.artifacts : [];
    const expectedPaths = [
      ...VISUAL_FAMILIES.flatMap(family => ['aura', 'three'].flatMap(engine => ['on', 'off', 'repeat', 'broken'].map(state =>
        `tests/reports/muse3jsparity/visual-301-${family}-${engine}-${state}.png`))),
      ...['aura', 'three'].flatMap(engine => [0, 15, 30, 45, 60].map(frame =>
        `tests/reports/muse3jsparity/visual-301-camera-game-feel-${engine}-frame-${frame}.png`))
    ];
    if (reportArtifacts.length !== expectedPaths.length || new Set(reportArtifacts.map(item => item.path)).size !== expectedPaths.length
      || expectedPaths.some(path => reportArtifacts.filter(item => item.path === path).length !== 1)) errors.push('visual capture inventory incomplete or duplicated');
    for (const reference of reportArtifacts) if (!bound(reference)) errors.push(`unbound visual capture: ${String(reference?.path)}`);
  }
  if (gate === 'l01') {
    const d = data as PackageAcceptance;
    if (d.version !== '3.0.1' || !Array.isArray(d.packages) || d.packages.length !== 29 || new Set(d.packages.map(p => p.name)).size !== 29) errors.push('expected 29 unique 3.0.1 public packages');
    for (const p of d.packages ?? []) if (!populated(p.name) || !artifacts.some(a => a.path === p.manifest) || !artifacts.some(a => a.path === p.tarball && a.sha256 === p.sha256)) errors.push('package manifest/tarball not bound to receipt');
    const hashes = new Set((d.packages ?? []).map(p => p.sha256));
    if (!Array.isArray(d.scaffolds) || d.scaffolds.length !== 19 || new Set(d.scaffolds.map(s => s.name)).size !== 19 || d.scaffolds.some(s => !populated(s.name) || s.sourcePassed !== true || s.installedPassed !== true || !s.tarballHashes?.length || s.tarballHashes.some(h => !hashes.has(h)))) errors.push('all 19 source/exact-installed scaffolds required');
    if (!finite(d.lifecycleAssertions) || d.lifecycleAssertions < 149 || !['compatibility','optionalPeers','imports','exports','smoke','provenance','bundleBudgets','leanIsolation'].every(k => d.checks?.[k] === true)) errors.push('required package checks incomplete');
  }
  if (gate === 'l02') {
    if (!context) return ['missing release validation context'];
    const bound = (reference: any): boolean => !!reference && typeof reference.path === 'string' && artifacts.some(a => a.path === reference.path && a.sha256 === reference.sha256);
    const readBound = (reference: any): any => {
      if (!bound(reference)) { errors.push('unbound release evidence'); return undefined; }
      try { return context.readJson(reference.path); } catch { errors.push('unreadable release evidence'); return undefined; }
    };
    if (data.version !== '3.0.1' || data.tag !== 'v3.0.1' || data.tagCommit !== context.source.commit) errors.push('release version/tag/source mismatch');
    const manifest = readBound(data.visualManifest);
    const approval = readBound(data.humanApproval);
    if (manifest) {
      if (manifest.version !== '3.0.1' || manifest.sourceCommit !== context.source.commit || manifest.sourceFingerprint !== context.source.fingerprint) errors.push('visual manifest source mismatch');
      const required = ['flagship-routes','showcase-games','aura-clash','selected-threejs-comparison','night-adoption','crowd-adoption'];
      if (!Array.isArray(manifest.sections) || required.some(id => !manifest.sections.some((s: any) => s.id === id && s.artifacts?.length > 0))) errors.push('incomplete final review gallery');
      for (const section of manifest.sections ?? []) for (const image of section.artifacts ?? []) if (!bound(image)) errors.push('unbound reviewed artifact');
    }
    if (approval) {
      const reviewer = approval.reviewer;
      if (approval.decision !== 'approved' || reviewer?.kind !== 'human' || !populated(reviewer?.id) || !populated(reviewer?.name) || /pending|unassigned|unknown|machine|bot|automated|fixture|synthetic/i.test(`${reviewer?.id} ${reviewer?.name}`) || approval.independent !== true) errors.push('independent human approval required');
      if (!bound(approval.origin) || !populated(approval.origin?.recordId)) errors.push('human decision origin record required');
      if (approval.manifestSha256 !== data.visualManifest?.sha256 || approval.sourceCommit !== context.source.commit || approval.sourceFingerprint !== context.source.fingerprint) errors.push('human decision does not bind final artifacts');
      const reviewedAt = Date.parse(approval.reviewedAt);
      if (!Number.isFinite(Date.parse(manifest?.generatedAt ?? '')) || !Number.isFinite(reviewedAt) || reviewedAt > context.now || reviewedAt < Date.parse(manifest?.generatedAt ?? '')) errors.push('invalid human review time');
      const sections = manifest?.sections?.map((s: any) => s.id) ?? [];
      if (!Array.isArray(approval.sections) || sections.some((id: string) => !approval.sections.some((s: any) => s.id === id && s.decision === 'approved' && Array.isArray(s.blockingIssues) && s.blockingIssues.length === 0))) errors.push('required review scope not approved');
    }
    const registry = readBound(data.registry);
    if (registry) {
      if (registry.version !== '3.0.1' || registry.registry !== 'https://registry.npmjs.org' || !Array.isArray(registry.packages) || registry.packages.length !== 29 || new Set(registry.packages.map((p: any) => p.name)).size !== 29) errors.push('incomplete registry package inventory');
      for (const p of registry.packages ?? []) if (p.version !== '3.0.1' || p.latest !== '3.0.1' || p.deprecated || !populated(p.integrity) || !bound(p.downloadedTarball) || p.downloadedTarball?.sha256 !== p.validatedTarballSha256 || !bound(p.provenance)) errors.push('registry artifact differs from validated publication');
      if (!Array.isArray(registry.scaffolds) || registry.scaffolds.length !== 19 || new Set(registry.scaffolds.map((s: any) => s.name)).size !== 19 || registry.scaffolds.some((s: any) => s.passed !== true || !bound(s.report))) errors.push('registry scaffold lifecycles incomplete');
      if (!bound(registry.cleanInstallReport)) errors.push('registry clean install report missing');
    }
    const github=readBound(data.github);
    if(github){
      if(github.schema!=='aura3d-github-release/v1'||github.version!=='3.0.1'||github.repository!=='auraoneai/aura3d'||github.tag!=='v3.0.1'||github.tagCommit!==context.source.commit||github.source?.commit!==context.source.commit||github.source?.fingerprint!==context.source.fingerprint||!bound(github.releasePlan)||!bound(github.notes)||!Array.isArray(github.assets)||github.assets.length!==29||!Array.isArray(github.artifacts)||github.artifacts.length===0)errors.push('incomplete GitHub release provenance');
      for(const asset of github.assets??[])if(!bound(asset.artifact)||asset.sha256!==asset.artifact?.sha256)errors.push('unbound GitHub package asset');
      for(const artifact of github.artifacts??[])if(!bound(artifact))errors.push('unbound GitHub API observation');
      const required = readBound(github.requiredArtifacts);
      const ids = ['registry','visualManifest','humanApproval','bundleSizes'];
      if (!required || required.schema !== 'aura3d-github-required-artifacts/v1' || required.version !== '3.0.1' || required.source?.commit !== context.source.commit || required.source?.fingerprint !== context.source.fingerprint || !bound(required.releasePlan) || required.releasePlan?.sha256 !== github.releasePlan?.sha256 || !Array.isArray(required.artifacts) || required.artifacts.length !== 4 || new Set(required.artifacts.map((a:any)=>a.id)).size !== 4) errors.push('incomplete GitHub required attachment manifest');
      if (!Array.isArray(github.attachments) || github.attachments.length !== 4 || new Set(github.attachments.map((a:any)=>a.id)).size !== 4) errors.push('incomplete GitHub downloaded attachment inventory');
      for (const id of ids) {
        const expected = required?.artifacts?.find((a:any)=>a.id===id);
        const downloaded = github.attachments?.find((a:any)=>a.id===id);
        if (!bound(expected) || !bound(downloaded?.artifact) || !bound(downloaded?.expected) || downloaded?.sha256 !== expected?.sha256 || downloaded?.artifact?.sha256 !== expected?.sha256 || downloaded?.expected?.path !== expected?.path || downloaded?.expected?.sha256 !== expected?.sha256) errors.push(`unbound GitHub required attachment: ${id}`);
        if (id !== 'bundleSizes' && (expected?.path !== data[id]?.path || expected?.sha256 !== data[id]?.sha256)) errors.push(`GitHub attachment differs from approved release input: ${id}`);
      }

    }
    const deployment = readBound(data.deployment);
    if (deployment && (deployment.version !== '3.0.1' || deployment.sourceCommit !== context.source.commit || !Array.isArray(deployment.pages) || deployment.pages.length === 0 || deployment.pages.some((p: any) => !/^https:\/\//.test(p.url) || p.status !== 200 || p.version !== '3.0.1' || !bound(p.content) || !bound(p.screenshot)) || !Array.isArray(deployment.links) || deployment.links.length === 0 || deployment.links.some((l: any) => l.status !== 200 || !populated(l.url)))) errors.push('deployed origin/content/link proof incomplete');
  }
  return errors;
}
