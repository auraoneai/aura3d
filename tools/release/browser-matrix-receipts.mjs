#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { sourceIdentity } from './source-identity.mjs';

const root = process.cwd();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const [mode, ...args] = process.argv.slice(2);
const shardSpecs = Object.freeze({
  'route-primary': 'tests/browser/showcase-route-primary-probes.spec.ts',
  gallery: 'tests/browser/advanced-examples-gallery.spec.ts',
  q02: 'tests/browser/showcase-gameplay-proof.spec.ts tests/browser/smart-city-composition-301.spec.ts',
  routes: 'tests/browser/wow-showcase-screenshots.spec.ts tests/browser/current-routes-route-health.spec.ts tests/browser/current-routes-parity-evidence.spec.ts tests/browser/product-demos.spec.ts tests/browser/loader-instancing-evidence.spec.ts'
});
const requiredShards = Object.keys(shardSpecs);
const canonicalReportPath = shard => `tests/reports/browser-matrix/${shard}/browser.json`;
const isInsideRoot = path => {
  const rel = relative(root, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep);
};
const reportFiles = suites => {
  const files = new Set();
  const visit = values => {
    for (const suite of values ?? []) {
      if (typeof suite.file === 'string') files.add(suite.file.replaceAll('\\', '/'));
      for (const spec of suite.specs ?? []) if (typeof spec.file === 'string') files.add(spec.file.replaceAll('\\', '/'));
      visit(suite.suites);
    }
  };
  visit(suites);
  return files;
};
const readPassingReport = (shard, reportPath, expectedHash) => {
  const absolutePath = resolve(root, reportPath);
  if (!isInsideRoot(absolutePath) || reportPath !== canonicalReportPath(shard)) throw new Error(`${shard}: noncanonical Playwright report path`);
  const bytes = readFileSync(absolutePath);
  if (expectedHash && sha256(bytes) !== expectedHash) throw new Error(`Changed Browser Matrix report for ${shard}`);
  const report = JSON.parse(bytes.toString('utf8'));
  const expected = Number(report.stats?.expected);
  const unexpected = Number(report.stats?.unexpected);
  const flaky = Number(report.stats?.flaky);
  const skipped = Number(report.stats?.skipped);
  if (!Array.isArray(report.suites) || report.suites.length === 0 || !Number.isInteger(expected) || expected < 1 || unexpected !== 0 || flaky !== 0 || skipped !== 0) {
    throw new Error(`${shard}: Playwright report is empty, incomplete, failed, flaky, or skipped`);
  }
  const files = reportFiles(report.suites);
  const missingSpecs = shardSpecs[shard].split(' ').filter(spec => !files.has(spec));
  if (missingSpecs.length) throw new Error(`${shard}: Playwright report is missing required specs: ${missingSpecs.join(', ')}`);
  return { bytes };
};

if (mode === 'receipt') {
  const [shard, reportPath, specs] = args;
  if (!requiredShards.includes(shard) || !reportPath || !specs) throw new Error('usage: receipt <shard> <report.json> <specs>');
  if (specs.trim().replace(/\s+/g, ' ') !== shardSpecs[shard]) throw new Error(`${shard}: unexpected Browser Matrix spec set`);
  const { bytes } = readPassingReport(shard, reportPath);
  const out = `tests/reports/browser-matrix/${shard}/receipt.json`;
  mkdirSync(dirname(resolve(root, out)), { recursive: true });
  writeFileSync(resolve(root, out), `${JSON.stringify({
    schema: 'aura3d.browser-matrix-shard/v1', runId: randomUUID(), shard, specs: shardSpecs[shard],
    source: sourceIdentity(root), report: { path: reportPath, sha256: sha256(bytes) },
    browser: 'Chromium', status: 'passed', generatedAt: new Date().toISOString()
  }, null, 2)}\n`);
} else if (mode === 'verify') {
  const expectedSource = sourceIdentity(root);
  const sameSource = value => ['commit', 'tree', 'lockfileSha256', 'fingerprint'].every(key => value?.[key] === expectedSource[key]);
  const receipts = requiredShards.map(shard => {
    const path = resolve(root, `tests/reports/browser-matrix/${shard}/receipt.json`);
    if (!existsSync(path)) throw new Error(`Missing Browser Matrix receipt for ${shard}`);
    const receipt = JSON.parse(readFileSync(path, 'utf8'));
    if (receipt.schema !== 'aura3d.browser-matrix-shard/v1' || receipt.shard !== shard || receipt.status !== 'passed' || receipt.browser !== 'Chromium' || receipt.specs !== shardSpecs[shard] || !sameSource(receipt.source) || !/^[a-f0-9]{64}$/.test(receipt.report?.sha256 ?? '')) {
      throw new Error(`Invalid or wrong-source Browser Matrix receipt for ${shard}`);
    }
    readPassingReport(shard, receipt.report?.path, receipt.report.sha256);
    return receipt;
  });
  const out = resolve(root, 'tests/reports/browser-matrix/aggregate.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ schema: 'aura3d.browser-matrix-aggregate/v1', source: expectedSource, browser: 'Chromium', shards: receipts }, null, 2)}\n`);
  console.log(`Verified ${receipts.length} exact-source Chromium Browser Matrix shards.`);
} else {
  throw new Error('usage: receipt|verify');
}
