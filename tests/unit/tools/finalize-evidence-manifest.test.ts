import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artifact, sourceIdentity, type ProducerReceipt } from '../../../tools/muse3jsparity-readiness/evidence-lineage';
import { finalizeEvidenceManifest } from '../../../tools/release/finalize-evidence-manifest';

function fixture(): string {
  const root = mkdtempSync(resolve(tmpdir(), 'aura301-manifest-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'tests@aura3d.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Aura3D Tests'], { cwd: root });
  writeFileSync(resolve(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  execFileSync('git', ['add', 'pnpm-lock.yaml'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root });
  mkdirSync(resolve(root, 'tests/reports/base'), { recursive: true });
  mkdirSync(resolve(root, 'tests/reports/typed'), { recursive: true });
  return root;
}

function receipt(root: string, path: string, gate: string): ReturnType<typeof artifact> {
  const source = sourceIdentity(root);
  const value: ProducerReceipt = {
    schema: 'muse3jsparity-producer/v1', runId: gate, gate, tasks: [`task:${gate}`],
    command: ['fixture'], cwd: root, exitCode: 0,
    startedAt: '2026-09-12T00:00:00.000Z', endedAt: '2026-09-12T00:00:01.000Z', source,
    claimSurface: 'release tooling', environment: { browser: 'none', backend: 'node', hardware: 'fixture' },
    artifacts: [], packages: [], tarballs: [],
  };
  writeFileSync(resolve(root, path), `${JSON.stringify(value)}\n`);
  return artifact(root, path);
}

describe('final source-exact evidence manifest', () => {
  it('merges validated typed receipts with broad work-order receipts', () => {
    const root = fixture(), source = sourceIdentity(root);
    const base = receipt(root, 'tests/reports/base/a.receipt.json', 'a');
    const typed = receipt(root, 'tests/reports/typed/q02.receipt.json', 'q02');
    writeFileSync(resolve(root, 'tests/reports/manifest.json'), `${JSON.stringify({
      schema: 'muse301-evidence-manifest/v1', generatedAt: 'earlier', source, receipts: [base],
    })}\n`);
    writeFileSync(resolve(root, 'tests/reports/typed/validation.json'), `${JSON.stringify({ valid: true, source, receipt: typed })}\n`);

    const merged = finalizeEvidenceManifest(root, 'tests/reports/manifest.json', ['tests/reports/typed/validation.json']);
    expect(merged.source).toEqual(source);
    expect(merged.receipts.map(item => item.path)).toEqual([
      'tests/reports/base/a.receipt.json', 'tests/reports/typed/q02.receipt.json',
    ]);
  });

  it('rejects a typed receipt from another source identity', () => {
    const root = fixture(), source = sourceIdentity(root);
    const base = receipt(root, 'tests/reports/base/a.receipt.json', 'a');
    const typed = receipt(root, 'tests/reports/typed/q02.receipt.json', 'q02');
    const changed = JSON.parse(readFileSync(resolve(root, typed.path), 'utf8')) as ProducerReceipt;
    changed.source = { ...changed.source, fingerprint: '0'.repeat(64) };
    writeFileSync(resolve(root, typed.path), `${JSON.stringify(changed)}\n`);
    writeFileSync(resolve(root, 'tests/reports/manifest.json'), `${JSON.stringify({ schema: 'muse301-evidence-manifest/v1', generatedAt: 'earlier', source, receipts: [base] })}\n`);
    writeFileSync(resolve(root, 'tests/reports/typed/validation.json'), `${JSON.stringify({ valid: true, source, receipt: artifact(root, typed.path) })}\n`);

    expect(() => finalizeEvidenceManifest(root, 'tests/reports/manifest.json', ['tests/reports/typed/validation.json']))
      .toThrow(/Receipt source differs/);
  });
});
