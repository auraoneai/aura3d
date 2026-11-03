import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PORTABLE_INPUT_CHUNK_BYTES, stagePortableInputs, verifyPortableInputs } from '../../../tools/remote-acr/portable-inputs.mjs';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sri = (bytes: Uint8Array) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const canonical = (value: any): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` :
  value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

/** Local synthetic byte strings only; these are neither packages nor evidence. */
function fixture() {
  const temp = mkdtempSync(join(tmpdir(), 'aura3d-synthetic-portable-')); roots.push(temp);
  const root = join(temp, 'source'), dest = join(temp, 'destination'); mkdirSync(root); mkdirSync(dest);
  const runId = 'synthetic-run';
  const report = `tests/reports/native-capabilities/${runId}`;
  const side = `tests/reports/native-source-inputs/${runId}`;
  const sourceManifestPath = `${report}/source-manifest.json`, candidatePlanPath = `${report}/candidate-plan.json`;
  const inputsPath = `${side}/inputs.json`, policyPath = 'tools/release/archive-admission-policy.json';
  const candidatePath = `${report}/candidate-tarballs/synthetic.tgz`;
  const archiveBytes = Buffer.from('synthetic candidate bytes; never a package');
  const externalBytes = Buffer.from('synthetic external bytes; never a package');
  const registry = 'https://registry.npmjs.org/synthetic/-/synthetic-1.0.0.tgz';
  const source = (dir: string, path: string, data: Uint8Array) => {
    const file = join(dir, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, data);
  };
  const lockBytes = Buffer.from('synthetic lockfile');
  const policyBytes = json({ schema: 'aura3d.archive-admission-policy/1', admissions: [] });
  const entries = [
    { path: 'pnpm-lock.yaml', type: 'file', mode: '100644', sha256: hash(lockBytes) },
    { path: policyPath, type: 'file', mode: '100644', sha256: hash(policyBytes) }
  ];
  const manifest = { schema: 'aura3d.native-source-manifest/1', origin: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) },
    files: entries, administrativeFiles: [], inputDigest: hash(Buffer.from(canonical(entries))), lockfileSha256: hash(lockBytes) };
  const manifestBytes = json(manifest), manifestHash = hash(manifestBytes);
  const plan = { schema: 'aura3d-release-plan/1.0', packOnly: true, lockfileSha256: manifest.lockfileSha256,
    source: { ...manifest.origin, lockfileSha256: manifest.lockfileSha256, inputDigest: manifest.inputDigest, manifestSha256: manifestHash, fingerprint: 'c'.repeat(64) },
    packageCount: 1, expectedPackageCount: 1,
    packages: [{ name: '@aura3d/synthetic', tarball: candidatePath, sha256: hash(archiveBytes), integrity: sri(archiveBytes) }] };
  const planBytes = json(plan), planHash = hash(planBytes);
  for (const dir of [root, dest]) {
    source(dir, 'pnpm-lock.yaml', lockBytes); source(dir, policyPath, policyBytes);
    source(dir, sourceManifestPath, manifestBytes); source(dir, '.native-source-manifest.json', manifestBytes);
    source(dir, candidatePlanPath, planBytes); source(dir, candidatePath, archiveBytes);
  }
  const consumerManifest = json({ name: 'synthetic-consumer', private: true });
  const consumerLock = json({ lockfileVersion: 3, packages: { '': {}, 'node_modules/synthetic-candidate': { resolved: 'file:tarballs/synthetic.tgz', integrity: sri(archiveBytes) },
    'node_modules/synthetic': { resolved: registry, integrity: sri(externalBytes) } } });
  const exampleManifest = json({ name: 'synthetic-example', private: true });
  const exampleResolved = `file:aura-candidates/${hash(archiveBytes)}.tgz`;
  const exampleLock = json({ lockfileVersion: 3, packages: { '': {}, 'node_modules/synthetic-candidate': { resolved: exampleResolved, integrity: sri(archiveBytes) } } });
  const content = new Map<string, Buffer>([
    [`${side}/consumer-manifest.json`, consumerManifest], [`${side}/consumer-lock.json`, consumerLock],
    [`${side}/example-manifest.json`, exampleManifest], [`${side}/example-lock.json`, exampleLock],
    [`${side}/synthetic-external.tgz`, externalBytes], [`${side}/asset.bin`, Buffer.from('synthetic asset')]
  ]);
  const ref = (path: string) => { const data = content.get(path)!; return { path, size: data.length, sha256: hash(data) }; };
  const consumerPath = `${side}/consumer-bundle.json`, examplePath = `${side}/example-bundle.json`;
  const consumer = { schema: 'aura3d.portable-consumer-input/1', candidatePlanSha256: planHash, sourceManifestSha256: manifestHash,
    projects: [{ id: 'synthetic-consumer', manifest: ref(`${side}/consumer-manifest.json`), lockfile: ref(`${side}/consumer-lock.json`),
      archives: [{ resolved: 'file:tarballs/synthetic.tgz', path: candidatePath, size: archiveBytes.length, sha256: hash(archiveBytes), integrity: sri(archiveBytes) },
        { resolved: registry, ...ref(`${side}/synthetic-external.tgz`), integrity: sri(externalBytes) }],
      assets: [{ target: 'synthetic/asset.bin', ...ref(`${side}/asset.bin`) }] }] };
  const examples = { schema: 'aura3d.native-example-locks/1', runId, candidateSha256: planHash, sourceInputDigest: manifest.inputDigest,
    examples: [{ id: 'capability-example:synthetic-example', manifestSha256: hash(exampleManifest), lockPath: `${side}/example-lock.json`,
      lockSha256: hash(exampleLock), archives: [{ resolved: exampleResolved, path: candidatePath }] }] };
  const matrixPath = `${side}/matrix/bundle.json`, matrixArchive = `${side}/matrix/archives/${hash(archiveBytes)}.tgz`;
  content.set(matrixArchive, archiveBytes);
  const matrix = { schema: 'aura3d.native-matrix-input/1', candidatePlanSha256: planHash,
    sourceManifest: { path: sourceManifestPath, sha256: manifestHash },
    cells: ['npm', 'pnpm'].flatMap(manager => [18, 19].flatMap(major => ['absent', 'present'].map(peer => {
      const id = `${manager}-react${major}-peer-${peer}`, prefix = `${side}/matrix/cells/${id}`;
      const project = `${prefix}/package.json`, lock = `${prefix}/${manager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml'}`;
      content.set(project, json({ name: `synthetic-${id}`, private: true }));
      const local = 'file:./tarballs/synthetic.tgz';
      content.set(lock, manager === 'npm' ? json({ lockfileVersion: 3, packages: { '': {}, 'node_modules/synthetic': { resolved: local, integrity: sri(archiveBytes) } } }) : Buffer.from("lockfileVersion: '9.0'\n# synthetic transport-only lock; never admitted\n"));
      return { id, manager, manifest: ref(project), lockfile: ref(lock),
        archives: [{ resolved: local, ...ref(matrixArchive), integrity: sri(archiveBytes) }] };
    }))) };
  content.set(consumerPath, json(consumer)); content.set(examplePath, json(examples)); content.set(matrixPath, json(matrix));
  const envelope = { schema: 'aura3d.native-portable-inputs/1', runId,
    sourceManifest: { path: sourceManifestPath, sha256: manifestHash }, candidatePlan: { path: candidatePlanPath, sha256: planHash },
    admissionPolicy: { path: policyPath, sha256: hash(policyBytes) },
    consumerBundle: { path: consumerPath, sha256: hash(content.get(consumerPath)!) },
    exampleBundle: { path: examplePath, sha256: hash(content.get(examplePath)!) },
    matrixBundle: { path: matrixPath, sha256: hash(content.get(matrixPath)!) },
    exampleManifests: [{ id: 'capability-example:synthetic-example', ...ref(`${side}/example-manifest.json`) }],
    candidateReviews: [] as { path: string; sha256: string }[], candidateReviewEvidence: [] as { path: string; sha256: string }[],
    files: [...content.keys()].sort().map(ref) };
  const writeEnvelope = () => source(root, inputsPath, json(envelope));
  for (const [path, bytes] of content) source(root, path, bytes);
  writeEnvelope();
  const update = (path: string, bytes: Buffer) => {
    source(root, path, bytes);
    const entry = envelope.files.find(item => item.path === path)!;
    entry.size = bytes.length; entry.sha256 = hash(bytes);
    if (path === consumerPath) envelope.consumerBundle.sha256 = entry.sha256;
    if (path === examplePath) envelope.exampleBundle.sha256 = entry.sha256;
    if (path === matrixPath) envelope.matrixBundle.sha256 = entry.sha256;
    writeEnvelope();
  };
  return { root, dest, runId, side, report, inputsPath, sourceManifestPath, candidatePlanPath, candidatePath,
    archiveBytes, externalBytes, consumerPath, examplePath, matrixPath, consumer, examples, matrix, envelope, source, writeEnvelope, update,
    options: { root, runId, sourceManifestPath, candidatePlanPath, inputsPath } };
}

function addSyntheticReview(f: ReturnType<typeof fixture>) {
  const review = json({ note: 'synthetic transport fixture; no review authority or valid signature' });
  const evidence = Buffer.from('synthetic evidence bytes');
  const reviewRef = { path: `${f.side}/candidate-reviews/${hash(review)}.json`, sha256: hash(review) };
  const evidenceRef = { path: `${f.side}/candidate-review-evidence/note.txt`, sha256: hash(evidence) };
  for (const [ref, bytes] of [[reviewRef, review], [evidenceRef, evidence]] as const) {
    f.source(f.root, ref.path, bytes);
    f.envelope.files.push({ ...ref, size: bytes.length });
  }
  f.envelope.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  f.envelope.candidateReviews.push(reviewRef);
  f.envelope.candidateReviewEvidence.push(evidenceRef);
  f.writeEnvelope();
  return { reviewRef, evidenceRef };
}

describe('synthetic portable source input transport', () => {
  it('binds source, candidate, policy, wrapper and every archive into verifier graph snapshots', () => {
    const f = fixture(), result = verifyPortableInputs(f.options);
    expect(result.sourceManifest).toEqual(f.envelope.sourceManifest);
    expect(result.candidatePlan).toEqual(f.envelope.candidatePlan);
    expect(result.inputs.sha256).toBe(hash(readFileSync(join(f.root, f.inputsPath))));
    expect(result.admissionPolicy).toEqual(f.envelope.admissionPolicy);
    expect(result.consumerBundle).toEqual(f.envelope.consumerBundle);
    expect(result.exampleBundle).toEqual(f.envelope.exampleBundle);
    expect(result.matrixBundle).toEqual(f.envelope.matrixBundle);
    expect(result.consumers).toHaveLength(6);
    expect(result.pnpmConsumers).toHaveLength(4);
    expect(Buffer.from(result.consumers[0].archives[0].bytes)).toEqual(f.archiveBytes);
    expect(Buffer.from(result.consumers[0].archives[1].bytes)).toEqual(f.externalBytes);
    expect(hash(result.consumers[1].manifestBytes)).toBe(f.examples.examples[0].manifestSha256);
    expect(Buffer.from(result.pnpmConsumers[0].lockBytes).toString('utf8')).toContain('synthetic transport-only');
    expect(result).not.toHaveProperty('admitted');
  });

  it('stages only verified bytes into a prepared destination without overwriting', () => {
    const f = fixture();
    const result = stagePortableInputs({ ...f.options, dest: f.dest });
    expect(result.inputs).toEqual(verifyPortableInputs({ ...f.options, root: f.dest }).inputs);
    for (const file of f.envelope.files) expect(hash(readFileSync(join(f.dest, file.path)))).toBe(file.sha256);
    expect(() => stagePortableInputs({ ...f.options, dest: f.dest })).toThrow(/already exists/);
    expect(hash(readFileSync(join(f.dest, f.inputsPath)))).toBe(result.inputs.sha256);
  });

  it('rejects changed or missing bytes before creating the destination', () => {
    for (const remove of [false, true]) {
      const f = fixture(), path = f.envelope.files[0].path;
      if (remove) rmSync(join(f.root, path)); else writeFileSync(join(f.root, path), 'changed');
      expect(() => stagePortableInputs({ ...f.options, dest: f.dest })).toThrow();
      expect(existsSync(join(f.dest, f.side))).toBe(false);
    }
  });

  it('rejects changed retained source, candidate, policy and root manifest copies', () => {
    for (const path of ['source', 'candidate', 'policy', 'root-manifest']) {
      const f = fixture();
      const target = path === 'source' ? f.sourceManifestPath : path === 'candidate' ? f.candidatePath :
        path === 'policy' ? 'tools/release/archive-admission-policy.json' : '.native-source-manifest.json';
      writeFileSync(join(f.dest, target), 'synthetic mismatch');
      expect(() => stagePortableInputs({ ...f.options, dest: f.dest })).toThrow();
      expect(existsSync(join(f.dest, f.side))).toBe(false);
    }
  });

  it('rejects source, candidate, policy and run identity substitutions', () => {
    for (const key of ['sourceManifest', 'candidatePlan', 'admissionPolicy'] as const) {
      const f = fixture(); f.envelope[key].sha256 = '0'.repeat(64); f.writeEnvelope();
      expect(() => verifyPortableInputs(f.options)).toThrow();
    }
    const f = fixture(); f.envelope.runId = 'different'; f.writeEnvelope();
    expect(() => verifyPortableInputs(f.options)).toThrow();
    expect(() => verifyPortableInputs({ ...f.options, inputsPath: '../inputs.json' })).toThrow();
  });

  it('rejects unlisted files, omitted records, duplicate records and unsafe file paths', () => {
    const extra = fixture(); extra.source(extra.root, `${extra.side}/unexpected.txt`, Buffer.from('synthetic'));
    expect(() => verifyPortableInputs(extra.options)).toThrow();
    const omitted = fixture(); omitted.envelope.files.pop(); omitted.writeEnvelope();
    expect(() => verifyPortableInputs(omitted.options)).toThrow();
    const duplicate = fixture(); duplicate.envelope.files.push(duplicate.envelope.files[0]); duplicate.envelope.files.sort((a, b) => a.path < b.path ? -1 : 1); duplicate.writeEnvelope();
    expect(() => verifyPortableInputs(duplicate.options)).toThrow();
    for (const path of ['../escape', `${omitted.side}/node_modules/a`, `${omitted.side}/.npmrc`, `${omitted.side}/private.key`]) {
      const f = fixture(); f.envelope.files[0].path = path; f.writeEnvelope();
      expect(() => verifyPortableInputs(f.options)).toThrow();
    }
  });

  it('rejects symlinks and an existing destination without changing them', () => {
    const f = fixture(), target = f.envelope.files[0].path;
    rmSync(join(f.root, target)); symlinkSync(join(f.root, f.envelope.files[1].path), join(f.root, target));
    expect(() => stagePortableInputs({ ...f.options, dest: f.dest })).toThrow();
    expect(existsSync(join(f.dest, f.side))).toBe(false);
    const existing = fixture(); existing.source(existing.dest, `${existing.side}/sentinel`, Buffer.from('keep'));
    expect(() => stagePortableInputs({ ...existing.options, dest: existing.dest })).toThrow();
    expect(readFileSync(join(existing.dest, existing.side, 'sentinel'), 'utf8')).toBe('keep');
  });

  it('rejects duplicate JSON keys, malformed JSON and credential-bearing input without exposing secrets', () => {
    const duplicate = fixture(); duplicate.source(duplicate.root, duplicate.inputsPath, Buffer.from('{"schema":"x","schema":"y"}'));
    expect(() => verifyPortableInputs(duplicate.options)).toThrow(/duplicate/);
    const malformed = fixture(); malformed.source(malformed.root, malformed.inputsPath, Buffer.from('{'));
    expect(() => verifyPortableInputs(malformed.options)).toThrow(/JSON/);
    const secret = fixture(), value = 'synthetic-only-secret-value';
    secret.update(secret.consumerPath, json({ ...secret.consumer, _authToken: value }));
    try { verifyPortableInputs(secret.options); throw new Error('expected refusal'); }
    catch (error) { expect(String(error)).toContain('credential'); expect(String(error)).not.toContain(value); }
    expect(() => stagePortableInputs({ ...secret.options, dest: secret.dest })).toThrow(/credential/);
    expect(existsSync(join(secret.dest, secret.side))).toBe(false);
  });

  it('rejects mismatched example manifests and missing or duplicate example IDs', () => {
    const mismatched = fixture(); mismatched.envelope.exampleManifests[0].sha256 = '0'.repeat(64); mismatched.writeEnvelope();
    expect(() => verifyPortableInputs(mismatched.options)).toThrow();
    const missing = fixture(); missing.envelope.exampleManifests[0].id = 'starter-example:different'; missing.writeEnvelope();
    expect(() => verifyPortableInputs(missing.options)).toThrow();
    const duplicate = fixture(); duplicate.envelope.exampleManifests.push(duplicate.envelope.exampleManifests[0]); duplicate.writeEnvelope();
    expect(() => verifyPortableInputs(duplicate.options)).toThrow();
  });

  it('accepts real catalog IDs as logical identifiers in both staging and remote verification', () => {
    for (const id of ['capability-example:runtime-physics', 'starter-example:mini-game',
      'documented-example:apps/terrain-viewer', 'documented-example:examples/solar-system',
      `capability-example:${'a'.repeat(256 - 'capability-example:'.length)}`]) {
      const f = fixture(); f.examples.examples[0].id = id; f.envelope.exampleManifests[0].id = id;
      f.update(f.examplePath, json(f.examples));
      expect(() => verifyPortableInputs(f.options), id).not.toThrow();
      expect(() => stagePortableInputs({ ...f.options, dest: f.dest }), id).not.toThrow();
    }
  });

  it('rejects malformed, oversized and path-traversing catalog IDs in both phases', () => {
    for (const id of ['synthetic-example', 'capability-example:', 'starter-example:mini/game',
      'documented-example:apps/../secret', 'documented-example:apps/a/b', 'documented-example:tools/example',
      'documented-example:apps/', 'documented-example:apps/example?mode=x', 'capability-example:UPPER',
      `capability-example:${'a'.repeat(257 - 'capability-example:'.length)}`]) {
      const f = fixture(); f.examples.examples[0].id = id; f.envelope.exampleManifests[0].id = id;
      f.update(f.examplePath, json(f.examples));
      expect(() => verifyPortableInputs(f.options), id).toThrow(/example (?:manifest|project)/);
      expect(() => stagePortableInputs({ ...f.options, dest: f.dest }), id).toThrow(/example (?:manifest|project)/);
      expect(existsSync(join(f.dest, f.side))).toBe(false);
    }
  });

  it('retains separately supplied candidate-review and evidence bytes without claiming admission', () => {
    const f = fixture(), refs = addSyntheticReview(f);
    const verified = verifyPortableInputs(f.options);
    expect(verified.candidateReviews).toEqual([refs.reviewRef]);
    expect(verified.candidateReviewEvidence).toEqual([refs.evidenceRef]);
    const staged = stagePortableInputs({ ...f.options, dest: f.dest });
    expect(staged.candidateReviews).toEqual([refs.reviewRef]);
    expect(staged.candidateReviewEvidence).toEqual([refs.evidenceRef]);
    expect(readFileSync(join(f.dest, refs.reviewRef.path))).toEqual(readFileSync(join(f.root, refs.reviewRef.path)));
    expect(readFileSync(join(f.dest, refs.evidenceRef.path))).toEqual(readFileSync(join(f.root, refs.evidenceRef.path)));
  });

  it('rejects altered, unlisted, duplicate and out-of-run candidate review evidence', () => {
    const changed = fixture(), refs = addSyntheticReview(changed);
    changed.source(changed.root, refs.evidenceRef.path, Buffer.from('altered synthetic evidence'));
    expect(() => verifyPortableInputs(changed.options)).toThrow(/mismatch/);
    expect(() => stagePortableInputs({ ...changed.options, dest: changed.dest })).toThrow(/mismatch/);
    const unlisted = fixture(); addSyntheticReview(unlisted); unlisted.envelope.candidateReviewEvidence = []; unlisted.writeEnvelope();
    expect(() => verifyPortableInputs(unlisted.options)).toThrow(/unexpected/);
    expect(() => stagePortableInputs({ ...unlisted.options, dest: unlisted.dest })).toThrow(/unexpected/);
    const duplicate = fixture(); const review = addSyntheticReview(duplicate).reviewRef;
    duplicate.envelope.candidateReviews.push(review); duplicate.writeEnvelope();
    expect(() => verifyPortableInputs(duplicate.options)).toThrow(/candidateReviews/);
    expect(() => stagePortableInputs({ ...duplicate.options, dest: duplicate.dest })).toThrow(/candidateReviews/);
    const escaped = fixture(); addSyntheticReview(escaped);
    escaped.envelope.candidateReviews[0].path = `tests/reports/native-source-inputs/other-run/candidate-reviews/${review.sha256}.json`;
    escaped.writeEnvelope();
    expect(() => verifyPortableInputs(escaped.options)).toThrow(/candidateReviews/);
    expect(() => stagePortableInputs({ ...escaped.options, dest: escaped.dest })).toThrow(/candidateReviews/);
    const unsafe = fixture(); addSyntheticReview(unsafe);
    unsafe.envelope.candidateReviewEvidence[0].path = `${unsafe.side}/candidate-review-evidence/bad name.txt`;
    unsafe.writeEnvelope();
    expect(() => verifyPortableInputs(unsafe.options)).toThrow(/candidateReviewEvidence/);
    expect(() => stagePortableInputs({ ...unsafe.options, dest: unsafe.dest })).toThrow(/candidateReviewEvidence/);
  });
  it('refuses credential-bearing review evidence before either staging or remote verification', () => {
    const f = fixture(), refs = addSyntheticReview(f), secret = 'synthetic-review-credential';
    const bytes = Buffer.from(`password=${secret}\n`), digest = hash(bytes);
    f.source(f.root, refs.evidenceRef.path, bytes);
    const record = f.envelope.files.find(item => item.path === refs.evidenceRef.path)!;
    record.sha256 = digest; record.size = bytes.length; f.envelope.candidateReviewEvidence[0].sha256 = digest; f.writeEnvelope();
    for (const check of [() => verifyPortableInputs(f.options), () => stagePortableInputs({ ...f.options, dest: f.dest })]) {
      try { check(); throw new Error('expected refusal'); }
      catch (error) { expect(String(error)).toContain('credential'); expect(String(error)).not.toContain(secret); }
    }
    expect(existsSync(join(f.dest, f.side))).toBe(false);
  });

  it('requires every lock resolution and its actual SHA-512 bytes', () => {
    const incomplete = fixture(); incomplete.consumer.projects[0].archives.pop(); incomplete.update(incomplete.consumerPath, json(incomplete.consumer));
    expect(() => verifyPortableInputs(incomplete.options)).toThrow();
    const integrity = fixture(); integrity.consumer.projects[0].archives[1].integrity = sri(Buffer.from('different synthetic bytes'));
    integrity.update(integrity.consumerPath, json(integrity.consumer));
    expect(() => verifyPortableInputs(integrity.options)).toThrow();
    const unsafe = fixture(); unsafe.consumer.projects[0].archives[1].resolved = 'https://user:synthetic@registry.npmjs.org/a.tgz';
    unsafe.update(unsafe.consumerPath, json(unsafe.consumer)); expect(() => verifyPortableInputs(unsafe.options)).toThrow();
  });

  it('does not treat arbitrary local archives as a retained candidate', () => {
    const f = fixture();
    const first = f.consumer.projects[0].archives[0];
    first.path = `${f.side}/synthetic-external.tgz`; first.size = f.externalBytes.length;
    first.sha256 = hash(f.externalBytes); first.integrity = sri(f.externalBytes);
    f.update(f.consumerPath, json(f.consumer));
    expect(() => verifyPortableInputs(f.options)).toThrow();
  });

  it('requires all eight independently addressed matrix cells and their archived bytes', () => {
    const missing = fixture(); missing.matrix.cells.pop(); missing.update(missing.matrixPath, json(missing.matrix));
    expect(() => verifyPortableInputs(missing.options)).toThrow();
    const wrongManager = fixture(); wrongManager.matrix.cells[0].manager = 'pnpm'; wrongManager.update(wrongManager.matrixPath, json(wrongManager.matrix));
    expect(() => verifyPortableInputs(wrongManager.options)).toThrow();
    const wrongPath = fixture(); wrongPath.matrix.cells[0].manifest.path = `${wrongPath.side}/consumer-manifest.json`;
    wrongPath.update(wrongPath.matrixPath, json(wrongPath.matrix));
    expect(() => verifyPortableInputs(wrongPath.options)).toThrow();
    const wrongArchive = fixture(); wrongArchive.matrix.cells[0].archives[0].path = wrongArchive.candidatePath;
    wrongArchive.update(wrongArchive.matrixPath, json(wrongArchive.matrix));
    expect(() => verifyPortableInputs(wrongArchive.options)).toThrow();
  });

  it('refuses credential-bearing pnpm lock text before returning pnpm snapshots', () => {
    const f = fixture(), cell = f.matrix.cells.find(item => item.manager === 'pnpm')!;
    const bytes = Buffer.from("lockfileVersion: '9.0'\n_authToken: synthetic-only-secret\n");
    f.update(cell.lockfile.path, bytes); cell.lockfile.size = bytes.length; cell.lockfile.sha256 = hash(bytes);
    f.update(f.matrixPath, json(f.matrix));
    try { verifyPortableInputs(f.options); throw new Error('expected refusal'); }
    catch (error) { expect(String(error)).toContain('credential'); expect(String(error)).not.toContain('synthetic-only-secret'); }
    expect(() => stagePortableInputs({ ...f.options, dest: f.dest })).toThrow(/credential/);
  });

  it('copies across multiple bounded chunks and refuses a changed final chunk without publishing', () => {
    const f = fixture(), asset = f.consumer.projects[0].assets[0];
    const bytes = Buffer.alloc(PORTABLE_INPUT_CHUNK_BYTES * 2 + 17, 0x53);
    bytes[bytes.length - 1] = 0x42;
    f.update(asset.path, bytes); asset.size = bytes.length; asset.sha256 = hash(bytes);
    f.update(f.consumerPath, json(f.consumer));
    const result = stagePortableInputs({ ...f.options, dest: f.dest });
    expect(readFileSync(join(f.dest, asset.path))).toEqual(bytes);
    expect(result).not.toHaveProperty('consumers');
    expect(result).not.toHaveProperty('pnpmConsumers');
    const changed = fixture(), late = changed.consumer.projects[0].assets[0];
    const original = Buffer.alloc(PORTABLE_INPUT_CHUNK_BYTES * 2 + 17, 0x53);
    changed.update(late.path, original); late.size = original.length; late.sha256 = hash(original);
    changed.update(changed.consumerPath, json(changed.consumer));
    original[original.length - 1] = 0x42; writeFileSync(join(changed.root, late.path), original);
    expect(() => stagePortableInputs({ ...changed.options, dest: changed.dest })).toThrow(/mismatch/);
    expect(existsSync(join(changed.dest, changed.side))).toBe(false);
  });

  it('leaves full npm lock graph validation to the remote verifier', () => {
    const f = fixture(), lock = f.consumer.projects[0].lockfile;
    const syntacticallyValidButUnsupported = json({ lockfileVersion: 2, packages: { '': {} } });
    f.update(lock.path, syntacticallyValidButUnsupported);
    lock.size = syntacticallyValidButUnsupported.length; lock.sha256 = hash(syntacticallyValidButUnsupported);
    f.update(f.consumerPath, json(f.consumer));
    expect(stagePortableInputs({ ...f.options, dest: f.dest })).not.toHaveProperty('consumers');
    expect(() => verifyPortableInputs({ ...f.options, root: f.dest })).toThrow(/project lock/);
  });
});
