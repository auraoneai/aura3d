import { readFileSync } from 'node:fs';
import type { PathLike } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { ArchiveAdmissionCapability, ArchiveAdmissionReceipt, VerifyArchiveAdmissionInput } from '../../../tools/release/archive-admission.mjs';
import { CODEC_NPM_INPUT_SCHEMA, admitCodecArchives, assertCleanCodecTemporaryParent, runCodecPreflight, validateCodecArchiveInventory } from '../../../tools/remote-acr/external-codec-run.mjs';

const gatePath = 'tests/reports/native-capabilities/code-complete-go.json';
const gateHash = 'a'.repeat(64);
const runId = 'synthetic-codec-run';

function fixture() {
  const gate = { freezeCommit: 'b'.repeat(40), sourceInputDigest: 'c'.repeat(64),
    candidatePlan: { path: 'tests/reports/native-capabilities/candidate-plan.json', sha256: 'd'.repeat(64) } };
  const archive = { resolved: 'https://registry.npmjs.org/independent/-/independent-1.0.0.tgz',
    path: `tests/reports/native-external-codec-inputs/${runId}/npm/independent.tgz` };
  const inventory = { schema: CODEC_NPM_INPUT_SCHEMA, runId, gate: { path: gatePath, sha256: gateHash },
    freezeCommit: gate.freezeCommit, sourceInputDigest: gate.sourceInputDigest,
    candidatePlan: { ...gate.candidatePlan }, archives: [archive] };
  return { gate, inventory };
}

// These bytes and refs are synthetic transport inputs, never review evidence.
function reviewFixture() {
  const sourceRun = 'synthetic-source-run';
  const prefix = `tests/reports/native-source-inputs/${sourceRun}`;
  const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
  const reviewBytes = Buffer.from('synthetic review bytes');
  const evidenceBytes = Buffer.from('synthetic supporting bytes');
  const review = { path: `${prefix}/candidate-reviews/${digest(reviewBytes)}.json`, sha256: digest(reviewBytes) };
  const evidence = { path: `${prefix}/candidate-review-evidence/source.txt`, sha256: digest(evidenceBytes) };
  const sourceManifest = { path: 'source-manifest.json', sha256: '1'.repeat(64) };
  const candidatePlan = { path: 'candidate-plan.json', sha256: '2'.repeat(64) };
  const envelopePath = `${prefix}/inputs.json`;
  const envelope = { schema: 'aura3d.native-portable-inputs/1', runId: sourceRun, sourceManifest, candidatePlan,
    candidateReviews: [review], candidateReviewEvidence: [evidence],
    files: [{ ...review, size: reviewBytes.length }, { ...evidence, size: evidenceBytes.length }] };
  const inputBytes = Buffer.from(JSON.stringify(envelope));
  const gate = { status: 'CODE_COMPLETE_GO', runId: sourceRun, sourceManifest, candidatePlan,
    inputs: [envelopePath, review.path, evidence.path],
    portableInputs: { sourceManifest, candidatePlan, inputs: { path: envelopePath, sha256: digest(inputBytes) },
      candidateReviews: [{ ...review }], candidateReviewEvidence: [{ ...evidence }] } };
  const report = { runId: sourceRun, candidateReviews: [{ ...review }] };
  const project = { id: 'npm-react19-peer-present', candidateReviews: [{ ...review }] };
  const files = new Map([[envelopePath, inputBytes], [review.path, reviewBytes], [evidence.path, evidenceBytes]]);
  const readBytes = (path: string, max: number) => {
    const bytes = files.get(path);
    if (!bytes || bytes.length > max) throw new Error('missing synthetic bytes');
    return bytes;
  };
  const manifestBytes = Buffer.from('{"name":"synthetic"}'), lockBytes = Buffer.from('{"lockfileVersion":3}');
  const snapshots = [{ resolved: 'file:synthetic.tgz', bytes: Buffer.from('synthetic archive') }];
  const input = { root: '/synthetic', gate, report, project, manifestBytes, lockBytes, snapshots, readBytes };
  const refreshEnvelope = () => {
    const bytes = Buffer.from(JSON.stringify(envelope));
    files.set(envelopePath, bytes); gate.portableInputs.inputs.sha256 = digest(bytes);
  };
  return { input, envelope, files, review, evidence, refreshEnvelope };
}

describe('external codec offline launcher', () => {
  it('forwards the exact gated review references to each fresh archive admission', () => {
    const { input } = reviewFixture();
    const calls: VerifyArchiveAdmissionInput[] = [];
    const expected = { capability: {} as ArchiveAdmissionCapability, receipt: {} as ArchiveAdmissionReceipt };
    const verifier = (args: VerifyArchiveAdmissionInput) => { calls.push(args); return expected; };
    expect(admitCodecArchives(input, verifier)).toBe(expected);
    expect(admitCodecArchives(input, verifier)).toBe(expected);
    expect(calls).toHaveLength(2);
    for (const seen of calls) {
      expect(seen.candidateReviews).toEqual(input.gate.portableInputs.candidateReviews);
      expect(seen.sourceManifestPath).toBe(input.gate.sourceManifest.path);
      expect(seen.planPath).toBe(input.gate.candidatePlan.path);
      expect(seen.manifestBytes).toBe(input.manifestBytes);
      expect(seen.lockBytes).toBe(input.lockBytes);
      expect(seen.archives).toBe(input.snapshots);
    }
  });

  it('rejects mismatched, missing or changed candidate reviews before invoking admission', () => {
    for (const change of [
      (x: ReturnType<typeof reviewFixture>) => { x.input.report.candidateReviews = []; },
      (x: ReturnType<typeof reviewFixture>) => { x.input.project.candidateReviews = []; },
      (x: ReturnType<typeof reviewFixture>) => { x.envelope.candidateReviews = []; x.refreshEnvelope(); },
      (x: ReturnType<typeof reviewFixture>) => { x.envelope.candidateReviewEvidence = []; x.refreshEnvelope(); },
      (x: ReturnType<typeof reviewFixture>) => { x.input.gate.portableInputs.inputs.sha256 = '0'.repeat(64); },
      (x: ReturnType<typeof reviewFixture>) => { x.files.set(x.review.path, Buffer.from('changed review')); },
      (x: ReturnType<typeof reviewFixture>) => { x.files.set(x.evidence.path, Buffer.from('changed evidence')); },
      (x: ReturnType<typeof reviewFixture>) => { x.input.gate.inputs = x.input.gate.inputs.filter(path => path !== x.review.path); },
      (x: ReturnType<typeof reviewFixture>) => { x.envelope.files = x.envelope.files.filter(item => item.path !== x.evidence.path); x.refreshEnvelope(); }
    ]) {
      const x = reviewFixture(); change(x);
      let called = false;
      const verifier = (_args: VerifyArchiveAdmissionInput) => {
        called = true;
        return { capability: {} as ArchiveAdmissionCapability, receipt: {} as ArchiveAdmissionReceipt };
      };
      expect(() => admitCodecArchives(x.input, verifier)).toThrow();
      expect(called).toBe(false);
    }
  });

  it('binds the retained registry archive inventory to the exact gate, candidate and run', () => {
    const { gate, inventory } = fixture();
    expect(validateCodecArchiveInventory(inventory, gate, gatePath, gateHash, runId)).toEqual(inventory.archives);
    const changed = fixture(); changed.inventory.candidatePlan.sha256 = '0'.repeat(64);
    expect(() => validateCodecArchiveInventory(changed.inventory, changed.gate, gatePath, gateHash, runId)).toThrow(/candidate/);
    const stale = fixture(); stale.inventory.gate.sha256 = '0'.repeat(64);
    expect(() => validateCodecArchiveInventory(stale.inventory, stale.gate, gatePath, gateHash, runId)).toThrow(/candidate/);
    const wrongRun = fixture(); wrongRun.inventory.runId = 'other-run';
    expect(() => validateCodecArchiveInventory(wrongRun.inventory, wrongRun.gate, gatePath, gateHash, runId)).toThrow(/candidate/);
  });

  it('rejects missing, ambiguous, remote-only and unsafe archive inputs', () => {
    const missing = fixture(); missing.inventory.archives = [];
    expect(() => validateCodecArchiveInventory(missing.inventory, missing.gate, gatePath, gateHash, runId)).toThrow(/incomplete/);
    const duplicate = fixture(); duplicate.inventory.archives.push({ ...duplicate.inventory.archives[0]! });
    expect(() => validateCodecArchiveInventory(duplicate.inventory, duplicate.gate, gatePath, gateHash, runId)).toThrow(/ambiguous/);
    const otherHost = fixture(); otherHost.inventory.archives[0]!.resolved = 'https://example.invalid/package.tgz';
    expect(() => validateCodecArchiveInventory(otherHost.inventory, otherHost.gate, gatePath, gateHash, runId)).toThrow(/archive/);
    const otherRun = fixture(); otherRun.inventory.archives[0]!.path = 'tests/reports/native-external-codec-inputs/other/npm/package.tgz';
    expect(() => validateCodecArchiveInventory(otherRun.inventory, otherRun.gate, gatePath, gateHash, runId)).toThrow(/run-scoped/);
    const traversal = fixture(); traversal.inventory.archives[0]!.path = `tests/reports/native-external-codec-inputs/${runId}/npm/../package.tgz`;
    expect(() => validateCodecArchiveInventory(traversal.inventory, traversal.gate, gatePath, gateHash, runId)).toThrow(/unsafe/);
  });

  it('does not validate fixture bytes or archives until the real gate succeeds', () => {
    const calls: string[] = [];
    expect(() => runCodecPreflight({
      validateGate: () => { calls.push('gate'); throw new Error('no CODE_COMPLETE_GO'); },
      validateFixtures: () => { calls.push('fixtures'); return {}; },
      validateArchives: () => { calls.push('archives'); return {}; }
    })).toThrow(/CODE_COMPLETE_GO/);
    expect(calls).toEqual(['gate']);
  });

  it('refuses its CLI in a guarded source process before any input or provider work', () => {
    const args = ['tools/remote-acr/external-codec-run.mjs', '--phase', 'execute'];
    if (process.env.AURA3D_SOURCE_PROCESS_GUARD === '1') {
      expect(() => spawnSync(process.execPath, args, { encoding: 'utf8' })).toThrow(/source phase refuses/);
    } else {
      const child = spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, AURA3D_SOURCE_PROCESS_GUARD: '1' } });
      expect(child.status).toBe(2);
      expect(child.stderr).toContain('acceptance is forbidden during source work');
    }
  });

  it('does not inspect or restore packages without an independently verified fixture proof', () => {
    const calls: string[] = [];
    expect(() => runCodecPreflight({
      validateGate: () => { calls.push('gate'); return { candidate: 'frozen' }; },
      validateFixtures: () => { calls.push('fixtures'); throw new Error('missing Git proof'); },
      validateArchives: () => { calls.push('archives'); return {}; }
    })).toThrow(/missing Git proof/);
    expect(calls).toEqual(['gate', 'fixtures']);
  });

  it('preserves the order of successful offline preflight and fails closed for missing packages', () => {
    const calls: string[] = [];
    const result = runCodecPreflight({
      validateGate: () => { calls.push('gate'); return 'candidate'; },
      validateFixtures: (gate: string) => { calls.push(`fixtures:${gate}`); return 'proof'; },
      validateArchives: (gate: string, proof: string) => { calls.push(`archives:${gate}:${proof}`); return 'packages'; }
    });
    expect(calls).toEqual(['gate', 'fixtures:candidate', 'archives:candidate:proof']);
    expect(result).toEqual({ gate: 'candidate', fixtures: 'proof', archives: 'packages' });
    expect(() => runCodecPreflight({ validateGate: () => 'candidate', validateFixtures: () => 'proof',
      validateArchives: () => { throw new Error('missing retained package'); } })).toThrow(/missing retained package/);
  });

  it('rejects temporary parents whose ancestors could supply unverified packages', () => {
    const present = new Set(['/private/tmp/node_modules']);
    expect(() => assertCleanCodecTemporaryParent('/private/tmp/job', '/repo', (path: PathLike) => present.has(String(path))))
      .toThrow(/external node_modules/);
    expect(assertCleanCodecTemporaryParent('/private/var/tmp', '/repo', (path: PathLike) => present.has(String(path))))
      .toBe('/private/var/tmp');
    expect(() => assertCleanCodecTemporaryParent('/repo/temp', '/repo', () => false)).toThrow(/not isolated/);
    expect(() => assertCleanCodecTemporaryParent('relative', '/repo', () => false)).toThrow(/not isolated/);
  });

  it('wires host and staged checks before provisioning and in-image checks before artifact identity', () => {
    const host = readFileSync('tools/remote-acr/run.sh', 'utf8');
    const image = readFileSync('tools/remote-acr/task-run.sh', 'utf8');
    expect(host).toContain('external-codec-fixtures');
    expect(host).toContain('tests/acceptance/gltf-external-decoder-fixtures.test.ts');
    expect(host.indexOf('external-codec-run.mjs --phase preflight')).toBeGreaterThan(host.indexOf('native-capability-gate/index.mjs --phase acceptance'));
    expect(host.indexOf('external-codec-run.mjs --phase preflight')).toBeLessThan(host.indexOf('acr show'));
    expect(host).toContain('(cd "$CTX" && node tools/remote-acr/external-codec-run.mjs --phase preflight');
    expect(image.indexOf('node "$LAUNCHER" "${PREFLIGHT[@]}"')).toBeLessThan(image.indexOf('upload-artifacts.mjs --prefix'));
    expect(image).toContain('AURA3D_SOURCE_PROCESS_GUARD');
  });

  it('keeps archive admission ahead of the offline candidate restore', () => {
    const launcher = readFileSync('tools/remote-acr/external-codec-run.mjs', 'utf8');
    const main = launcher.indexOf('async function main(args)');
    const gate = launcher.indexOf('const inputs = loadCodec(', main);
    const repeat = launcher.indexOf('const current = loadCodec(', gate);
    const restore = launcher.indexOf('const restore = spawnSync(', repeat);
    const installed = launcher.indexOf('const installed = validateExternalCodecInstalledProject(', restore);
    const context = launcher.indexOf('validateExternalCodecRunContext(', installed);
    const test = launcher.indexOf('const result = spawnSync(', context);
    expect(main).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(main);
    expect(repeat).toBeGreaterThan(gate);
    expect(restore).toBeGreaterThan(repeat);
    expect(installed).toBeGreaterThan(restore);
    expect(context).toBeGreaterThan(installed);
    expect(test).toBeGreaterThan(context);
    expect(launcher).toContain("npm_config_offline: 'true'");
    expect(launcher).toContain('assertIndependentNpmConsumer({');
    expect(launcher).toContain('admitCodecArchives({');
    expect(launcher).toContain('archives: allArchives, candidatePackages, admission');
    expect(launcher).toContain('await restoreMatrixProject(');
  });
});
