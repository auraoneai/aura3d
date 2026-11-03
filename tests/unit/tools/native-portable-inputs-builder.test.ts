import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { preparePortableInputs } from '../../../tools/remote-acr/prepare-portable-inputs.mjs';
import { verifyPortableInputs } from '../../../tools/remote-acr/portable-inputs.mjs';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sri = (bytes: Uint8Array) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const canonical = (value: any): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` :
  value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const tempRoots: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const templateIds = [
  'product-viewer', 'cinematic-scene', 'mini-game', 'racing-starter', 'falling-blocks-starter', 'fighting-game',
  'arena-shooter', 'animation-channel', 'prompt-animation-channel', 'animation-studio', 'episode-builder',
  'character-controller', 'premium-product-viewer', 'architecture-interior', 'material-authoring', 'asset-inspector',
  'character-viewer', 'postprocess-scene', 'custom-scene', 'large-scene'
];

/** Synthetic byte strings only. They are not packages, trusted reviews or evidence. */
function fixture() {
  const temporary = mkdtempSync(join(tmpdir(), 'aura3d-portable-builder-')); tempRoots.push(temporary);
  const root = join(temporary, 'source'), inputRoot = join(temporary, 'supplied');
  mkdirSync(root); mkdirSync(inputRoot);
  const runId = 'fixture-run', report = `tests/reports/native-capabilities/${runId}`;
  const side = `tests/reports/native-source-inputs/${runId}`;
  const candidatePath = `${report}/candidate-tarballs/synthetic.tgz`;
  const write = (base: string, path: string, data: Uint8Array) => {
    const file = join(base, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, data); return file;
  };
  const candidateBytes = Buffer.from('synthetic candidate bytes; never executable');
  const externalBytes = Buffer.from('synthetic third party bytes; never executable');
  const workspaceLock = Buffer.from('synthetic staged workspace lock');
  const policy = json({ schema: 'aura3d.archive-admission-policy/1', admissions: [] });
  const templateSource = Buffer.from(`export const CREATE_AURA3D_TEMPLATES = ${JSON.stringify(templateIds, null, 2)} as const;\n`);
  const sourceInputs = [
    { path: 'packages/create-aura3d/src/index.ts', data: templateSource },
    { path: 'pnpm-lock.yaml', data: workspaceLock },
    { path: 'tools/release/archive-admission-policy.json', data: policy }
  ];
  for (const entry of sourceInputs) write(root, entry.path, entry.data);
  const files = sourceInputs.map(entry => ({ path: entry.path, type: 'file', mode: '100644', sha256: sha(entry.data) })).sort((a, b) => a.path.localeCompare(b.path));
  const source = { schema: 'aura3d.native-source-manifest/1', origin: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) }, files,
    administrativeFiles: [], inputDigest: sha(Buffer.from(canonical(files))), lockfileSha256: sha(workspaceLock) };
  const sourceBytes = json(source), sourcePath = `${report}/source-manifest.json`, planPath = `${report}/candidate-plan.json`;
  const plan = { schema: 'aura3d-release-plan/1.0', packOnly: true, lockfileSha256: source.lockfileSha256,
    source: { ...source.origin, lockfileSha256: source.lockfileSha256, inputDigest: source.inputDigest, manifestSha256: sha(sourceBytes), fingerprint: 'c'.repeat(64) },
    packageCount: 1, expectedPackageCount: 1,
    packages: [{ name: '@aura3d/synthetic', version: '0.0.0', tarball: candidatePath, sha256: sha(candidateBytes), integrity: sri(candidateBytes) }] };
  const planBytes = json(plan);
  write(root, sourcePath, sourceBytes); write(root, planPath, planBytes); write(root, candidatePath, candidateBytes);
  write(root, '.native-source-manifest.json', sourceBytes);
  const supplied = (path: string, data: Uint8Array) => { write(inputRoot, path, data); return { path, size: data.byteLength, sha256: sha(data) }; };
  const localConsumer = 'file:tarballs/synthetic.tgz';
  const localExample = `file:aura-candidates/${sha(candidateBytes)}.tgz`;
  const localMatrix = 'file:./tarballs/synthetic.tgz';
  const registry = 'https://registry.npmjs.org/synthetic/-/synthetic-1.0.0.tgz';
  const manifest = supplied('manifest.json', json({ name: 'synthetic-consumer', private: true }));
  const lock = (path: string, resolved: string) => supplied(path, json({ lockfileVersion: 3, packages: { '': {},
    'node_modules/local': { resolved, integrity: sri(candidateBytes) },
    'node_modules/synthetic': { resolved: registry, integrity: sri(externalBytes) } } }));
  const consumerLock = lock('consumer-lock.json', localConsumer), exampleLock = lock('example-lock.json', localExample), matrixLock = lock('matrix-lock.json', localMatrix);
  const pnpmLock = supplied('pnpm-lock.yaml', Buffer.from("lockfileVersion: '9.0'\n# synthetic transport-only lock\n"));
  const external = supplied('archive.tgz', externalBytes);
  const asset = supplied('asset.json', json({ text: 'synthetic public input' }));
  const archive = (resolved: string) => [
    { resolved, origin: 'candidate' as const, path: candidatePath, size: candidateBytes.length, sha256: sha(candidateBytes), integrity: sri(candidateBytes) },
    { resolved: registry, origin: 'supplied' as const, ...external, integrity: sri(externalBytes) }
  ];
  const consumers = ['launcher', ...templateIds, 'react-import'].map(id => ({ id, manifest, lockfile: consumerLock, archives: archive(localConsumer),
    assets: id === 'product-viewer' ? [{ target: 'public/sample.json', file: asset }] : [] }));
  const expectedExampleIds = ['capability-example:synthetic', 'documented-example:apps/sample'];
  const examples = expectedExampleIds.map(id => ({ id, manifest, lockfile: exampleLock, archives: archive(localExample) }));
  const matrix = ['npm', 'pnpm'].flatMap(manager => [18, 19].flatMap(major => ['absent', 'present'].map(peer => ({
    id: `${manager}-react${major}-peer-${peer}`, manager, manifest, lockfile: manager === 'npm' ? matrixLock : pnpmLock, archives: archive(localMatrix)
  }))));
  const options: any = { root, inputRoot, runId, sourceManifestSha256: sha(sourceBytes), candidatePlanSha256: sha(planBytes), expectedExampleIds,
    consumers, examples, matrix, candidateReviews: [], candidateReviewEvidence: [] };
  return { temporary, root, inputRoot, runId, report, side, candidatePath, candidateBytes, externalBytes, sourcePath, planPath, options, supplied, write };
}

function assertNoOutput(f: ReturnType<typeof fixture>) {
  expect(existsSync(join(f.root, f.side))).toBe(false);
  const parent = join(f.root, 'tests/reports/native-source-inputs');
  if (existsSync(parent)) expect(readdirSync(parent)).toEqual([]);
}

describe('offline candidate-bound portable input assembly', () => {
  it('assembles all required consumer, example and matrix inputs without claiming admission', () => {
    const f = fixture();
    const fetch = vi.fn(() => { throw new Error('network must not be called'); }); vi.stubGlobal('fetch', fetch);
    const result = preparePortableInputs(f.options);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.admission).toBe('not-verified');
    const inputBytes = readFileSync(join(f.root, result.inputs.path));
    expect(result.inputs.sha256).toBe(sha(inputBytes));
    const envelope = JSON.parse(inputBytes.toString('utf8'));
    expect(envelope.files.map((item: { path: string }) => item.path)).toEqual([...envelope.files.map((item: { path: string }) => item.path)].sort());
    expect(envelope.candidateReviews).toEqual([]);
    expect(envelope.candidateReviewEvidence).toEqual([]);
    const consumer = JSON.parse(readFileSync(join(f.root, envelope.consumerBundle.path), 'utf8'));
    const examples = JSON.parse(readFileSync(join(f.root, envelope.exampleBundle.path), 'utf8'));
    const matrix = JSON.parse(readFileSync(join(f.root, envelope.matrixBundle.path), 'utf8'));
    expect(consumer.projects).toHaveLength(22);
    expect(examples.examples.map((item: { id: string }) => item.id)).toEqual(f.options.expectedExampleIds);
    expect(matrix.cells).toHaveLength(8);
    const checked = verifyPortableInputs({ root: f.root, runId: f.runId, sourceManifestPath: f.sourcePath,
      candidatePlanPath: f.planPath, inputsPath: result.inputs.path });
    expect(checked.consumers).toHaveLength(28);
    expect(checked.pnpmConsumers).toHaveLength(4);
    expect(checked).not.toHaveProperty('admitted');
  });

  it('emits deterministic bytes independent of caller ordering', () => {
    const first = fixture(), second = fixture();
    second.options.consumers.reverse(); second.options.examples.reverse(); second.options.matrix.reverse(); second.options.expectedExampleIds.reverse();
    for (const project of [...second.options.consumers, ...second.options.examples, ...second.options.matrix]) project.archives.reverse();
    const a = preparePortableInputs(first.options), b = preparePortableInputs(second.options);
    expect(a.inputs.sha256).toBe(b.inputs.sha256);
    expect(readFileSync(join(first.root, a.inputs.path))).toEqual(readFileSync(join(second.root, b.inputs.path)));
  });

  it('retains supplied review and evidence bytes without interpreting a signature', () => {
    const f = fixture();
    const review = f.supplied('review.json', json({ schema: 'synthetic-test-only', text: 'not an admission' }));
    const evidence = f.supplied('evidence.txt', Buffer.from('synthetic evidence; not an independent review'));
    const logical = `${f.side}/candidate-review-evidence/synthetic.txt`;
    f.options.candidateReviews.push(review);
    f.options.candidateReviewEvidence.push({ path: logical, file: evidence });
    const result = preparePortableInputs(f.options), envelope = JSON.parse(readFileSync(join(f.root, result.inputs.path), 'utf8'));
    expect(envelope.candidateReviews).toEqual([{ path: `${f.side}/candidate-reviews/${review.sha256}.json`, sha256: review.sha256 }]);
    expect(envelope.candidateReviewEvidence).toEqual([{ path: logical, sha256: evidence.sha256 }]);
    expect(readFileSync(join(f.root, logical))).toEqual(Buffer.from('synthetic evidence; not an independent review'));
    expect(result.admission).toBe('not-verified');
  });

  it.each([
    ['missing consumer', (f: any) => f.options.consumers.pop()],
    ['duplicated consumer', (f: any) => { f.options.consumers[1] = f.options.consumers[0]; }],
    ['missing matrix cell', (f: any) => f.options.matrix.pop()],
    ['wrong matrix manager', (f: any) => { f.options.matrix[0].manager = 'pnpm'; }],
    ['missing example', (f: any) => f.options.examples.pop()],
    ['unexpected example', (f: any) => { f.options.examples[0].id = 'capability-example:other'; }],
    ['duplicate archive resolution', (f: any) => { f.options.consumers[0].archives.push(f.options.consumers[0].archives[0]); }],
    ['candidate digest mismatch', (f: any) => { f.options.matrix[0].archives[0].sha256 = 'd'.repeat(64); }],
    ['source manifest mismatch', (f: any) => { f.options.sourceManifestSha256 = 'e'.repeat(64); }],
    ['candidate plan mismatch', (f: any) => { f.options.candidatePlanSha256 = 'f'.repeat(64); }],
    ['oversized file', (f: any) => { f.options.consumers[0].manifest = { ...f.options.consumers[0].manifest, size: 64 * 1024 * 1024 + 1 }; }],
    ['unexpected option', (f: any) => { f.options.unexpected = true; }],
    ['missing supplied file', (f: any) => { f.options.consumers[0].manifest = { ...f.options.consumers[0].manifest, path: 'missing.json' }; }],
    ['path traversal', (f: any) => { f.options.consumers[0].manifest = { ...f.options.consumers[0].manifest, path: '../private.json' }; }],
    ['private input path', (f: any) => { f.options.consumers[0].manifest = { ...f.options.consumers[0].manifest, path: '.ssh/secret' }; }],
    ['candidate resolution from supplied origin', (f: any) => { f.options.consumers[0].archives[0].origin = 'supplied'; }]
  ] as Array<[string, (f: ReturnType<typeof fixture>) => void]>)('rejects %s without publishing a partial run', (_label, mutate) => {
    const f = fixture(); mutate(f);
    expect(() => preparePortableInputs(f.options)).toThrow();
    assertNoOutput(f);
  });

  it('rejects a symlinked supplied file and leaves its target intact', () => {
    const f = fixture(), file = join(f.inputRoot, 'manifest.json'), target = join(f.inputRoot, 'actual-manifest.json');
    const contents = readFileSync(file); unlinkSync(file); writeFileSync(target, contents); symlinkSync(target, file);
    expect(() => preparePortableInputs(f.options)).toThrow(/unsafe|unavailable/);
    expect(readFileSync(target)).toEqual(contents);
    assertNoOutput(f);
  });

  it('rejects a candidate archive modified after its plan was created', () => {
    const f = fixture(); writeFileSync(join(f.root, f.candidatePath), Buffer.from('changed synthetic candidate'));
    expect(() => preparePortableInputs(f.options)).toThrow(/identity|size|mismatch/);
    assertNoOutput(f);
  });

  it('rejects credential-bearing metadata before publishing', () => {
    const f = fixture();
    const secret = f.supplied('bad-lock.yaml', Buffer.from("lockfileVersion: '9.0'\nprivateKey: test-placeholder\n"));
    f.options.matrix.find((cell: any) => cell.manager === 'pnpm').lockfile = secret;
    expect(() => preparePortableInputs(f.options)).toThrow(/credential/);
    assertNoOutput(f);
  });

  it('does not overwrite an existing run, including an empty directory or dangling symlink', () => {
    const f = fixture(), output = join(f.root, f.side); mkdirSync(output, { recursive: true });
    const marker = join(output, 'keep.txt'); writeFileSync(marker, 'existing');
    expect(() => preparePortableInputs(f.options)).toThrow(/already exists/);
    expect(readFileSync(marker, 'utf8')).toBe('existing');
    rmSync(output, { recursive: true }); mkdirSync(output);
    expect(() => preparePortableInputs(f.options)).toThrow(/already exists/);
    expect(lstatSync(output).isDirectory()).toBe(true);
    rmSync(output, { recursive: true }); symlinkSync(join(f.temporary, 'missing-target'), output);
    expect(() => preparePortableInputs(f.options)).toThrow(/already exists/);
    expect(lstatSync(output).isSymbolicLink()).toBe(true);
  });

  it('rejects supplied bytes changed after their explicit hash was recorded', () => {
    const f = fixture(); writeFileSync(join(f.inputRoot, 'archive.tgz'), Buffer.from('changed synthetic external bytes'));
    expect(() => preparePortableInputs(f.options)).toThrow(/identity|size|mismatch/);
    assertNoOutput(f);
  });

  it('retains an input spanning several bounded copy chunks with its exact bytes', () => {
    const f = fixture(), data = Buffer.alloc(2 * 256 * 1024 + 37, 0x5a);
    const asset = f.supplied('large-asset.bin', data);
    f.options.consumers.find((item: any) => item.id === 'product-viewer').assets.push({ target: 'public/large.bin', file: asset });
    const result = preparePortableInputs(f.options), envelope = JSON.parse(readFileSync(join(f.root, result.inputs.path), 'utf8'));
    const consumer = JSON.parse(readFileSync(join(f.root, envelope.consumerBundle.path), 'utf8'));
    const retained = consumer.projects.find((item: any) => item.id === 'product-viewer').assets.find((item: any) => item.target === 'public/large.bin');
    expect(readFileSync(join(f.root, retained.path))).toEqual(data);
    expect(retained.sha256).toBe(sha(data));
  });
});
