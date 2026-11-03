import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, truncateSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectArtifacts, parseArgs, planArtifactBatches, run } from '../../../tools/remote-acr/upload-artifacts.mjs';

const tempRoots: string[] = [];
function temp(): string {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'aura-artifact-bounds-'));
  tempRoots.push(root);
  return root;
}
function put(root: string, path: string, bytes: string): string {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  return file;
}
function sourceArgs(root: string, phase: 'prepare' | 'resume', ...dirs: string[]) {
  return parseArgs(['--source-handoff', '--prefix', `run1/${phase}`, '--preserve-root', root, ...dirs]);
}
afterEach(() => { for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('bounded source handoff transfer', () => {
  it('partitions a large inventory in order, respecting each batch limit', () => {
    const entries = Array.from({ length: 10_000 }, (_, index) => ({ name: `file-${index}`, size: index % 7 }));
    const batches = planArtifactBatches(entries, { maxBytes: 12, maxFiles: 5 });
    expect(batches.length).toBeGreaterThan(2_000);
    expect(batches.flat()).toEqual(entries);
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(5);
      expect(batch.reduce((sum: number, entry: { size: number }) => sum + entry.size, 0)).toBeLessThanOrEqual(12);
    }
    expect(() => planArtifactBatches([{ size: 13 }], { maxBytes: 12, maxFiles: 5 })).toThrow(/fit/);
    expect(() => planArtifactBatches([{ size: -1 }])).toThrow(/fit/);
  });

  it('retains the generic per-file bound and permits the specifically bounded larger build report', () => {
    const root = temp();
    const report = put(root, 'tests/reports/native-capabilities/run1/source-build.json', '');
    // Sparse metadata exercises the boundary without reading or uploading 200 MiB.
    truncateSync(report, 200 * 1024 * 1024 + 1);
    expect(() => collectArtifacts(parseArgs(['--prefix', 'run1', '--preserve-root', root, report]))).toThrow(/per-file/);
    const source = collectArtifacts(sourceArgs(root, 'prepare', report));
    expect(source.map((entry: { size: number }) => entry.size)).toEqual([200 * 1024 * 1024 + 1]);
    expect(source[0].name).toBe('run1/prepare/tests/reports/native-capabilities/run1/source-build.json');
    const other = put(root, 'tests/reports/native-source-inputs/run1/oversized.bin', '');
    truncateSync(other, 200 * 1024 * 1024 + 1);
    expect(() => collectArtifacts(sourceArgs(root, 'resume', other))).toThrow(/per-file/);
    truncateSync(report, 256 * 1024 * 1024 + 1);
    expect(() => collectArtifacts(sourceArgs(root, 'prepare', report))).toThrow(/per-file/);
  });

  it('limits source mode to the named run, phase and report families', () => {
    const root = temp();
    const file = put(root, 'tests/reports/native-source-inputs/run1/inputs.json', '{}');
    expect(() => parseArgs(['--source-handoff', '--prefix', 'run1', '--preserve-root', root, file])).toThrow(/run\/phase/);
    expect(() => parseArgs(['--source-handoff', '--prefix', 'run1/acceptance', '--preserve-root', root, file])).toThrow(/run\/phase/);
    expect(() => parseArgs(['--source-handoff', '--prefix', 'run1/resume', '--copy', file, 'report.json'])).toThrow(/run\/phase/);
    const wrongRun = put(root, 'tests/reports/native-source-inputs/run2/inputs.json', '{}');
    expect(() => collectArtifacts(sourceArgs(root, 'resume', wrongRun))).toThrow(/run-scoped/);
    const wrongFamily = put(root, 'tests/reports/unrelated/run1/inputs.json', '{}');
    expect(() => collectArtifacts(sourceArgs(root, 'resume', wrongFamily))).toThrow(/run-scoped/);
    const link = join(dirname(file), 'link.json');
    symlinkSync(file, link);
    expect(() => collectArtifacts(sourceArgs(root, 'resume', dirname(file)))).toThrow(/symlink/);
  });

  it('uploads exact bytes under the source phase with create-only identity and no remote dependency in the test', async () => {
    const root = temp();
    const file = put(root, 'tests/reports/native-source-inputs/run1/inputs.json', '{"data":"source"}\n');
    const env = { AURA3D_ARTIFACTS_BLOB_URL: 'https://example.blob.core.windows.net/container', IDENTITY_ENDPOINT: 'http://127.0.0.1:1234/token', IDENTITY_HEADER: 'local-test' };
    const uploads: Array<{ url: string; options: any }> = [];
    const request = async (url: URL, options: any) => {
      if (options.method === 'PUT') { uploads.push({ url: String(url), options }); return { ok: true, status: 201 }; }
      return { ok: true, json: async () => ({ access_token: 'test-token' }) };
    };
    expect(await run(sourceArgs(root, 'resume', file), env, request as any)).toEqual({ uploaded: 1 });
    expect(uploads).toHaveLength(1);
    expect(uploads[0].url).toContain('/run1/resume/tests/reports/native-source-inputs/run1/inputs.json');
    expect(uploads[0].options.headers['if-none-match']).toBe('*');
    expect(uploads[0].options.body).toEqual(readFileSync(file));
    expect(uploads[0].url).not.toContain('test-token');
  });

  it('rejects a replaced or symlinked source file before transferring its contents', async () => {
    const root = temp();
    const first = put(root, 'tests/reports/native-source-inputs/run1/a.txt', 'first');
    const second = put(root, 'tests/reports/native-source-inputs/run1/b.txt', 'second');
    const env = { AURA3D_ARTIFACTS_BLOB_URL: 'https://example.blob.core.windows.net/container', IDENTITY_ENDPOINT: 'http://127.0.0.1:1234/token', IDENTITY_HEADER: 'local-test' };
    const uploaded: string[] = [];
    const request = async (url: URL, options: any) => {
      if (options.method !== 'PUT') return { ok: true, json: async () => ({ access_token: 'test-token' }) };
      uploaded.push(String(url));
      if (uploaded.length === 1) { unlinkSync(second); symlinkSync(first, second); }
      return { ok: true, status: 201 };
    };
    await expect(run(sourceArgs(root, 'resume', dirname(first)), env, request as any)).rejects.toThrow();
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]).toContain('/a.txt');
  });

  it('scans the source snapshot for credential-like text before any upload of that file', async () => {
    const root = temp();
    const file = put(root, 'tests/reports/native-source-inputs/run1/inputs.json', '{"access_token":"example-secret"}');
    const env = { AURA3D_ARTIFACTS_BLOB_URL: 'https://example.blob.core.windows.net/container', IDENTITY_ENDPOINT: 'http://127.0.0.1:1234/token', IDENTITY_HEADER: 'local-test' };
    let puts = 0;
    const request = async (_url: URL, options: any) => {
      if (options.method === 'PUT') { puts += 1; return { ok: true, status: 201 }; }
      return { ok: true, json: async () => ({ access_token: 'test-token' }) };
    };
    await expect(run(sourceArgs(root, 'resume', file), env, request as any)).rejects.toThrow(/credentials/);
    expect(puts).toBe(0);
  });
});
