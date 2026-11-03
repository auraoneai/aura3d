import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exampleCatalogCosts } from '../../../tools/agent-examples/index.ts';
import {
  EXAMPLE_COST_BASE, exampleCostUnits, exampleShardRecord, exampleShardRecordProblems, exampleShardReportName, mergeExampleShardReports,
  parseExampleShard, partitionExampleCatalog
} from '../../../tools/agent-examples/shard.mjs';

/** A 99-example catalog with a few asset-heavy projects, like the real one. */
function catalog(size = 99) {
  return Array.from({ length: size }, (_, i) => ({
    id: `${i % 3 === 0 ? 'starter-example' : 'documented-example:apps'}${i % 3 === 0 ? ':' : '/'}ex-${String(i).padStart(3, '0')}`,
    cost: exampleCostUnits({ files: 10 + (i * 7) % 40, bytes: i % 11 === 0 ? 40 * 1024 * 1024 + i * 1000 : (i * 13) % 700 * 1024 })
  }));
}
const reordered = <T,>(items: T[]) => [...items.slice(37), ...items.slice(0, 37)].reverse();

describe('example catalog sharding (agent-examples --shard I/N)', () => {
  it('parses I/N and refuses anything else', () => {
    expect(parseExampleShard('1/4')).toEqual({ index: 1, count: 4 });
    expect(parseExampleShard('16/16')).toEqual({ index: 16, count: 16 });
    for (const bad of ['0/4', '5/4', '1/0', '1/17', '1-4', '1/4/2', 'a/b', '', undefined, '01/4']) expect(() => parseExampleShard(bad as string), String(bad)).toThrow(/invalid shard/);
    expect(exampleShardReportName(2, 4)).toBe('examples-source.shard-2-of-4.json');
  });

  it('weights projects with large public assets more than small ones', () => {
    const small = exampleCostUnits({ files: 12, bytes: 40 * 1024 });
    const heavy = exampleCostUnits({ files: 12, bytes: 40 * 1024 * 1024 });
    expect(small).toBeGreaterThanOrEqual(EXAMPLE_COST_BASE);
    expect(heavy).toBeGreaterThan(small * 5);
    expect(exampleCostUnits({ files: 200, bytes: 0 })).toBeGreaterThan(exampleCostUnits({ files: 5, bytes: 0 }));
    expect(() => exampleCostUnits({ files: -1, bytes: 0 })).toThrow();
  });

  it('covers every catalog id exactly once for every shard count, deterministically and independent of input order', () => {
    const items = catalog();
    const ids = items.map(item => item.id).sort();
    for (const count of [1, 2, 3, 4, 5, 8, 16]) {
      const partition = partitionExampleCatalog(items, count);
      expect(partition.shards.map(shard => shard.index)).toEqual(Array.from({ length: count }, (_, i) => i + 1));
      expect(partition.shards.flatMap(shard => shard.ids).sort(), `count ${count}`).toEqual(ids);
      expect(new Set(partition.shards.flatMap(shard => shard.ids)).size).toBe(items.length);
      for (const shard of partition.shards) expect(shard.ids, `shard ${shard.index}/${count} sorted`).toEqual([...shard.ids].sort());
      // Same catalog, any input order, repeated call: same partition and digests.
      const again = partitionExampleCatalog(reordered(items), count);
      expect(again).toEqual(partition);
      expect(partitionExampleCatalog(items, count)).toEqual(partition);
    }
  });

  it('balances estimated cost (longest-first greedy: spread at most one item) and splits the heavy projects across shards', () => {
    const items = catalog();
    const largest = Math.max(...items.map(item => item.cost));
    const partition = partitionExampleCatalog(items, 4);
    const costs = partition.shards.map(shard => shard.cost);
    expect(costs.reduce((a, b) => a + b, 0)).toBe(items.reduce((sum, item) => sum + item.cost, 0));
    expect(Math.max(...costs) - Math.min(...costs)).toBeLessThanOrEqual(largest);
    const heavy = items.filter(item => item.cost > 10 * EXAMPLE_COST_BASE).sort((a, b) => b.cost - a.cost || (a.id < b.id ? -1 : 1)).slice(0, 4).map(item => item.id);
    expect(new Set(heavy.map(id => partition.shards.find(shard => shard.ids.includes(id))!.index)).size).toBe(4);
  });

  it('refuses an empty, duplicate or invalid catalog and impossible shard counts', () => {
    const items = catalog(6);
    expect(() => partitionExampleCatalog([], 2)).toThrow(/empty/);
    expect(() => partitionExampleCatalog([...items, items[0]!], 2)).toThrow(/duplicate id/);
    expect(() => partitionExampleCatalog([{ id: 'x', cost: 0 }], 1)).toThrow(/invalid/);
    expect(() => partitionExampleCatalog(items, 7)).toThrow(/exceeds/);
    expect(() => partitionExampleCatalog(items, 0)).toThrow(/invalid shard count/);
  });

  it('derives catalog costs from the staged manifest (tracked files only), so build output in one job cannot move an example', () => {
    const root = mkdtempSync(join(tmpdir(), 'aura3d-shard-costs-'));
    const put = (path: string, data: string | Buffer) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), data); };
    try {
      put('apps/heavy/index.html', '<html></html>');
      put('apps/heavy/public/models/big.glb', Buffer.alloc(8 * 1024 * 1024));
      put('apps/light/index.html', '<html></html>');
      put('apps/light/src/main.ts', 'export {};\n');
      const tracked = ['apps/heavy/index.html', 'apps/heavy/public/models/big.glb', 'apps/light/index.html', 'apps/light/src/main.ts'];
      put('.native-source-manifest.json', JSON.stringify({ files: tracked.map(path => ({ path })) }));
      const entries = [{ id: 'documented-example:apps/heavy', kind: 'documented-example', sourcePath: 'apps/heavy' }, { id: 'documented-example:apps/light', kind: 'documented-example', sourcePath: 'apps/light' },
        { id: 'capability-example:x', kind: 'capability-example', sourcePath: 'examples/native-capabilities/index.ts' }];
      const costs = exampleCatalogCosts(root, entries);
      const byId = Object.fromEntries(costs.map(item => [item.id, item.cost]));
      expect(byId['documented-example:apps/heavy']).toBeGreaterThan(byId['documented-example:apps/light']! * 3);
      expect(byId['capability-example:x']).toBe(EXAMPLE_COST_BASE);
      // Untracked build output (dist, caches, a node_modules tree) never changes the costs of this job.
      put('apps/light/dist/assets/index.js', Buffer.alloc(20 * 1024 * 1024));
      put('apps/light/.vite/deps/chunk.js', Buffer.alloc(20 * 1024 * 1024));
      expect(exampleCatalogCosts(root, entries)).toEqual(costs);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

// ---- union (merge) verification --------------------------------------------------------------------------

const COMMON = {
  schema: 'aura3d.native-consumers/1', phase: 'source', install: 'packed-v1', runId: 'run-1', candidateSha256: 'a'.repeat(64), candidatePlan: 'tests/reports/native-5/run-1/candidate-plan.json',
  source: { commit: 'c'.repeat(40) }, stagedSourceSha256: 'd'.repeat(64), lockfileSha256: 'e'.repeat(64), packages: [{ name: '@aura3d/engine', version: '5.0.0' }],
  toolVersions: { node: 'v24.0.0', npm: '11.0.0' }, exemptions: [{ sourcePath: 'apps/common', reason: 'support-only source directory' }], browser: 'not-run'
};
const check = (id: string) => ({ id, status: 'passed', exitCode: 0, command: ['npm', id], logPath: `x/${id}.log`, logSha256: 'f'.repeat(64) });
function shardReport(items: { id: string; cost: number }[], index: number, count: number, patch: Record<string, unknown> = {}) {
  const shard = exampleShardRecord(items, index, count);
  return { ...COMMON, generatedAt: `2026-11-03T00:0${index}:00.000Z`, pass: true, failures: [], shard,
    cases: shard.ids.map(id => ({ id, kind: 'documented-example', sourcePath: 'apps/x', project: `p/${id}`, status: 'passed', checks: [check('install'), check('build')] })),
    projects: shard.ids.map(id => ({ id, path: `p/${id}` })), ...patch } as Record<string, any>;
}

describe('example shard union verification', () => {
  const items = catalog(20);
  const all = (count: number) => Array.from({ length: count }, (_, i) => shardReport(items, i + 1, count));

  it('merges a complete set of shard reports into one full-catalog report (every id exactly once, no shard field)', () => {
    const { problems, merged } = mergeExampleShardReports(all(4), 4);
    expect(problems).toEqual([]);
    expect(merged!.cases.map((item: { id: string }) => item.id)).toEqual(items.map(item => item.id).sort());
    expect(merged!.projects).toHaveLength(items.length);
    expect(merged).not.toHaveProperty('shard');
    expect(merged!.pass).toBe(true);
    expect(merged!.shards.map((shard: { index: number; ids: string[] }) => [shard.index, shard.ids.length])).toEqual(partitionExampleCatalog(items, 4).shards.map(shard => [shard.index, shard.ids.length]));
    expect(merged!.generatedAt).toBe('2026-11-03T00:04:00.000Z');
    // Report order does not matter and the merge is deterministic.
    expect(mergeExampleShardReports([...all(4)].reverse(), 4).merged).toEqual(merged);
  });

  it('a failing shard fails the union (pass false, failures carried) but the union is still complete', () => {
    const reports = all(2);
    reports[1] = { ...reports[1]!, pass: false, failures: ['documented-example:apps/ex-001: build did not pass exactly once'] };
    const { problems, merged } = mergeExampleShardReports(reports, 2);
    expect(problems).toEqual([]);
    expect(merged).toMatchObject({ pass: false, failures: ['documented-example:apps/ex-001: build did not pass exactly once'] });
  });

  it('refuses a missing shard, a duplicate shard and a wrong shard count', () => {
    const reports = all(4);
    expect(mergeExampleShardReports(reports.filter(report => report.shard.index !== 3), 4).problems).toEqual(['shard 3/4 is missing']);
    expect(mergeExampleShardReports([...reports, reports[0]!], 4).problems).toEqual(expect.arrayContaining(['shard 1/4: shard reported more than once']));
    expect(mergeExampleShardReports(reports, 3).problems).toEqual(expect.arrayContaining(['shard count is 4, expected 3']));
    expect(mergeExampleShardReports([], 4).problems).toEqual(['no example shard reports']);
    expect(mergeExampleShardReports(reports.slice(0, 1), 4).problems).toEqual(['shard 2/4 is missing', 'shard 3/4 is missing', 'shard 4/4 is missing']);
  });

  it('refuses shards that did not run exactly their partition or that disagree on the catalog or candidate', () => {
    const reports = all(4);
    // A shard that dropped one of its cases (an example never built).
    const dropped = reports.map(report => (report.shard.index === 2 ? { ...report, cases: report.cases.slice(1) } : report));
    expect(mergeExampleShardReports(dropped, 4).problems).toEqual([`shard 2/4: cases are not exactly the shard's ${reports[1]!.shard.ids.length} examples`]);
    // A shard that claims ids it was not assigned (an id covered twice, another never).
    const stolen = reports.map(report => (report.shard.index === 1 ? { ...report, shard: { ...report.shard, ids: [...report.shard.ids.slice(1), reports[1]!.shard.ids[0]!].sort() } } : report));
    expect(mergeExampleShardReports(stolen, 4).problems.join('\n')).toMatch(/shard 1\/4: ids are not the deterministic 1\/4 partition/);
    // A shard partitioned from a different catalog (costs differ -> different partition digest).
    const other = shardReport(items.map(item => ({ ...item, cost: item.cost + 1 })), 3, 4);
    expect(mergeExampleShardReports(reports.map(report => (report.shard.index === 3 ? other : report)), 4).problems.join('\n')).toMatch(/shard 3\/4: partitioned a different catalog than shard 1\/4/);
    // Different candidate / run between shards.
    expect(mergeExampleShardReports(reports.map(report => (report.shard.index === 4 ? { ...report, candidateSha256: 'b'.repeat(64) } : report)), 4).problems).toEqual(['shard 4/4: candidateSha256 differs from shard 1/4']);
    expect(mergeExampleShardReports(reports.map(report => (report.shard.index === 2 ? { ...report, runId: 'run-2' } : report)), 4).problems).toEqual(['shard 2/4: runId differs from shard 1/4']);
    // A forged catalog digest / partition digest.
    expect(exampleShardRecordProblems({ ...reports[0]!.shard, partitionSha256: '0'.repeat(64) }, 'shard 1/4')).toEqual(['shard 1/4: partitionSha256 does not match the deterministic partition of its catalog']);
    expect(exampleShardRecordProblems(undefined, 'x')).toEqual(['x: shard record is missing or malformed']);
  });
});
