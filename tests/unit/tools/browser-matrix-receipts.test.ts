import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const shardSpecs = {
  'route-primary': 'tests/browser/showcase-route-primary-probes.spec.ts',
  gallery: 'tests/browser/advanced-examples-gallery.spec.ts',
  q02: 'tests/browser/showcase-gameplay-proof.spec.ts tests/browser/smart-city-composition-301.spec.ts',
  routes: 'tests/browser/wow-showcase-screenshots.spec.ts tests/browser/current-routes-route-health.spec.ts tests/browser/current-routes-parity-evidence.spec.ts tests/browser/product-demos.spec.ts tests/browser/loader-instancing-evidence.spec.ts'
} as const;
const roots: string[] = [];
const write = (root: string, path: string, value: string) => {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value);
};
const passingReport = (shard: keyof typeof shardSpecs) => {
  const files = shardSpecs[shard].split(' ');
  return JSON.stringify({
    suites: files.map(file => ({ title: file, file, specs: [{ title: 'renders', file, tests: [{ status: 'expected', results: [{ status: 'passed' }] }] }] })),
    stats: { expected: files.length, skipped: 0, unexpected: 0, flaky: 0 }
  });
};
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'aura-browser-receipts-'));
  roots.push(root);
  mkdirSync(join(root, 'tools/release'), { recursive: true });
  cpSync(resolve('tools/release/browser-matrix-receipts.mjs'), join(root, 'tools/release/browser-matrix-receipts.mjs'));
  cpSync(resolve('tools/release/source-identity.mjs'), join(root, 'tools/release/source-identity.mjs'));
  write(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'], { cwd: root });
  const run = (...args: string[]) => spawnSync(process.execPath, ['tools/release/browser-matrix-receipts.mjs', ...args], { cwd: root, encoding: 'utf8' });
  const reportPath = (shard: keyof typeof shardSpecs) => `tests/reports/browser-matrix/${shard}/browser.json`;
  const mint = (shard: keyof typeof shardSpecs, report = passingReport(shard)) => {
    write(root, reportPath(shard), report);
    return run('receipt', shard, reportPath(shard), shardSpecs[shard]);
  };
  return { root, run, mint, reportPath };
}
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('exact-source Browser Matrix receipts', () => {
  it('mints and aggregates all four canonical passing shards', () => {
    const f = fixture();
    for (const shard of Object.keys(shardSpecs) as (keyof typeof shardSpecs)[]) expect(f.mint(shard).status).toBe(0);
    const result = f.run('verify');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Verified 4 exact-source Chromium Browser Matrix shards.');
    const aggregate = JSON.parse(readFileSync(join(f.root, 'tests/reports/browser-matrix/aggregate.json'), 'utf8'));
    expect(aggregate.schema).toBe('aura3d.browser-matrix-aggregate/v1');
    expect(aggregate.shards.map((receipt: { shard: string }) => receipt.shard)).toEqual(Object.keys(shardSpecs));
  });

  it('rejects empty, unsuccessful, flaky, wrong-spec, and noncanonical reports', () => {
    const f = fixture();
    expect(f.mint('gallery', JSON.stringify({ suites: [], stats: { expected: 0, unexpected: 0, flaky: 0 } })).status).not.toBe(0);
    expect(f.mint('gallery', JSON.stringify({ suites: [{}], stats: { expected: 1, unexpected: 1, flaky: 0 } })).status).not.toBe(0);
    expect(f.mint('gallery', JSON.stringify({ suites: [{}], stats: { expected: 1, unexpected: 0, flaky: 1 } })).status).not.toBe(0);
    expect(f.mint('gallery', JSON.stringify({ suites: [{}], stats: { expected: 1, skipped: 1, unexpected: 0, flaky: 0 } })).status).not.toBe(0);
    write(f.root, f.reportPath('gallery'), passingReport('gallery'));
    expect(f.run('receipt', 'gallery', f.reportPath('gallery'), shardSpecs.routes).status).not.toBe(0);
    write(f.root, 'outside.json', passingReport('gallery'));
    expect(f.run('receipt', 'gallery', 'outside.json', shardSpecs.gallery).status).not.toBe(0);
    expect(f.mint('q02', passingReport('gallery')).stderr).toContain('Playwright report is missing required specs');
  });

  it('fails closed on a missing shard, changed report, or altered source identity', () => {
    const f = fixture();
    for (const shard of Object.keys(shardSpecs) as (keyof typeof shardSpecs)[]) expect(f.mint(shard).status).toBe(0);
    write(f.root, f.reportPath('q02'), `${passingReport('q02')}\n`);
    expect(f.run('verify').stderr).toContain('Changed Browser Matrix report for q02');
    expect(f.mint('q02').status).toBe(0);
    const receiptPath = join(f.root, 'tests/reports/browser-matrix/gallery/receipt.json');
    const validReceipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    const receipt = structuredClone(validReceipt);
    delete receipt.report.sha256;
    writeFileSync(receiptPath, JSON.stringify(receipt));
    expect(f.run('verify').stderr).toContain('Invalid or wrong-source Browser Matrix receipt for gallery');
    receipt.report = validReceipt.report;
    receipt.source.fingerprint = createHash('sha256').update('wrong source').digest('hex');
    writeFileSync(receiptPath, JSON.stringify(receipt));
    expect(f.run('verify').stderr).toContain('Invalid or wrong-source Browser Matrix receipt for gallery');
    writeFileSync(receiptPath, JSON.stringify(validReceipt));
    rmSync(join(f.root, 'tests/reports/browser-matrix/routes/receipt.json'));
    expect(f.run('verify').stderr).toContain('Missing Browser Matrix receipt for routes');
  });
});
