/**
 * Deterministic sharding of the packed example catalog (ACR source5 stages
 * packed-c1..packed-cN, `tools/agent-examples/index.ts --packed --shard I/N`).
 *
 * Pure and dependency-free so the in-image producer, the launcher-side union
 * verification (tools/remote-acr/source5-artifacts.mjs) and the gate adapter
 * (tools/remote-acr/source5-gate-inputs.mjs) all run the same code:
 *   - `partitionExampleCatalog` splits the sorted catalog ids into N shards,
 *     weighted greedy (longest estimated cost first onto the lightest shard);
 *   - `mergeExampleShardReports` proves a set of shard reports is exactly one
 *     complete, consistent partition of one catalog and builds the single
 *     merged `examples-source.json` the gate and the acceptance spec bind.
 *
 * Cost model (estimated work units, integers so every machine agrees): a fixed
 * install/scaffold cost, plus one unit per source file, plus one unit per 25 KiB
 * of source and public asset bytes. It only balances shards; correctness never
 * depends on it, and the shard report records the exact (id, cost) catalog it
 * was partitioned from so the union check can recompute the partition.
 */
import { createHash } from 'node:crypto';

export const EXAMPLE_COST_BASE = 100;
export const EXAMPLE_COST_BYTES_PER_UNIT = 25 * 1024;
export const MAX_EXAMPLE_SHARDS = 16;
export const EXAMPLE_SHARD_SCHEMA = 'aura3d.example-shard/1';

const sha256 = text => createHash('sha256').update(text).digest('hex');
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Estimated cost of one example from its source directory file count and total bytes (public assets included). */
export function exampleCostUnits({ files, bytes }) {
  if (!Number.isSafeInteger(files) || files < 0 || !Number.isSafeInteger(bytes) || bytes < 0) throw new Error('example cost needs non-negative integer file and byte counts');
  return EXAMPLE_COST_BASE + files + Math.ceil(bytes / EXAMPLE_COST_BYTES_PER_UNIT);
}

/** `"2/4"` -> `{ index: 2, count: 4 }`; anything else throws. */
export function parseExampleShard(spec) {
  const match = /^([1-9]\d{0,1})\/([1-9]\d{0,1})$/.exec(String(spec ?? ''));
  if (!match) throw new Error(`invalid shard ${JSON.stringify(spec)} (expected I/N, e.g. 1/4)`);
  const index = Number(match[1]), count = Number(match[2]);
  if (count > MAX_EXAMPLE_SHARDS || index > count) throw new Error(`invalid shard ${spec}: need 1 <= I <= N <= ${MAX_EXAMPLE_SHARDS}`);
  return { index, count };
}

/** Report file a shard writes beside the merged `examples-source.json`. */
export const exampleShardReportName = (index, count) => `examples-source.shard-${index}-of-${count}.json`;

/** The sorted `[{ id, cost }]` catalog a partition is computed from (also what the digests bind). */
export function normalizeExampleCatalog(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('example catalog is empty');
  const seen = new Set();
  const catalog = items.map(item => {
    if (typeof item?.id !== 'string' || !item.id || !Number.isSafeInteger(item.cost) || item.cost < 1) throw new Error(`example catalog entry is invalid: ${JSON.stringify(item?.id ?? null)}`);
    if (seen.has(item.id)) throw new Error(`example catalog has a duplicate id: ${item.id}`);
    seen.add(item.id);
    return { id: item.id, cost: item.cost };
  });
  return catalog.sort((a, b) => byText(a.id, b.id));
}

/**
 * Weighted greedy partition: ids sorted by (cost descending, id ascending) are
 * assigned one by one to the shard with the lowest running cost (lowest index
 * on ties). Each shard's ids are returned sorted by id. Pure function of the
 * catalog and the shard count.
 */
export function partitionExampleCatalog(items, count) {
  const catalog = normalizeExampleCatalog(items);
  if (!Number.isInteger(count) || count < 1 || count > MAX_EXAMPLE_SHARDS) throw new Error(`invalid shard count ${count}`);
  if (count > catalog.length) throw new Error(`shard count ${count} exceeds the ${catalog.length} catalog examples`);
  const shards = Array.from({ length: count }, (_, i) => ({ index: i + 1, ids: [], cost: 0 }));
  for (const item of [...catalog].sort((a, b) => b.cost - a.cost || byText(a.id, b.id))) {
    const target = shards.reduce((best, shard) => (shard.cost < best.cost ? shard : best));
    target.ids.push(item.id);
    target.cost += item.cost;
  }
  for (const shard of shards) shard.ids.sort(byText);
  return {
    catalog, count,
    catalogSha256: sha256(canonical(catalog)),
    partitionSha256: sha256(canonical({ count, shards: shards.map(shard => ({ index: shard.index, ids: shard.ids })) })),
    shards
  };
}

/** The `shard` record a shard report carries: everything the union check needs to recompute and compare. */
export function exampleShardRecord(items, index, count) {
  const partition = partitionExampleCatalog(items, count);
  if (!Number.isInteger(index) || index < 1 || index > count) throw new Error(`invalid shard index ${index}/${count}`);
  const mine = partition.shards[index - 1];
  return { schema: EXAMPLE_SHARD_SCHEMA, index, count, ids: mine.ids, cost: mine.cost, catalog: partition.catalog, catalogSha256: partition.catalogSha256, partitionSha256: partition.partitionSha256 };
}

const COMMON_FIELDS = ['schema', 'phase', 'install', 'runId', 'candidateSha256', 'candidatePlan', 'source', 'stagedSourceSha256', 'lockfileSha256', 'packages', 'toolVersions', 'exemptions', 'browser'];

/** Problems with one shard record against the partition it claims (empty when it is exactly that shard). */
export function exampleShardRecordProblems(shard, label) {
  const problems = [];
  if (shard?.schema !== EXAMPLE_SHARD_SCHEMA || !Number.isInteger(shard.index) || !Number.isInteger(shard.count) || !Array.isArray(shard.ids) || !Array.isArray(shard.catalog)) return [`${label}: shard record is missing or malformed`];
  let partition;
  try { partition = partitionExampleCatalog(shard.catalog, shard.count); } catch (error) { return [`${label}: ${error.message}`]; }
  if (shard.index < 1 || shard.index > shard.count) return [`${label}: shard index ${shard.index} is outside 1..${shard.count}`];
  if (canonical(shard.catalog) !== canonical(partition.catalog)) problems.push(`${label}: catalog is not the sorted (id, cost) list`);
  if (shard.catalogSha256 !== partition.catalogSha256) problems.push(`${label}: catalogSha256 does not match its catalog`);
  if (shard.partitionSha256 !== partition.partitionSha256) problems.push(`${label}: partitionSha256 does not match the deterministic partition of its catalog`);
  const mine = partition.shards[shard.index - 1];
  if (canonical(shard.ids) !== canonical(mine.ids) || shard.cost !== mine.cost) problems.push(`${label}: ids are not the deterministic ${shard.index}/${shard.count} partition of the catalog`);
  return problems;
}

/**
 * Prove `reports` (parsed shard reports; `expectedCount` = the shard count the
 * run was launched with) are one complete partition of one catalog and build
 * the single merged report. Every catalog id must be covered by exactly one
 * shard, each shard's cases/projects must be exactly its ids, and every field
 * that identifies the candidate must agree. Returns `{ problems, merged }`;
 * `merged` is null while any problem is found. The merged report has no `shard`
 * field (it is the full-catalog report the acceptance validators expect) and
 * lists the shards under `shards`.
 */
export function mergeExampleShardReports(reports, expectedCount) {
  const problems = [];
  if (!Array.isArray(reports) || !reports.length) return { problems: ['no example shard reports'], merged: null };
  const count = reports[0]?.shard?.count;
  if (!Number.isInteger(count) || (expectedCount !== undefined && count !== expectedCount)) problems.push(`shard count is ${count}, expected ${expectedCount ?? 'an integer'}`);
  const byIndex = new Map();
  for (const report of reports) {
    const label = `shard ${report?.shard?.index}/${report?.shard?.count}`;
    problems.push(...exampleShardRecordProblems(report?.shard, label));
    if (report?.shard?.count !== count) problems.push(`${label}: shard count differs from ${count}`);
    if (byIndex.has(report?.shard?.index)) problems.push(`${label}: shard reported more than once`);
    byIndex.set(report?.shard?.index, report);
  }
  for (let i = 1; Number.isInteger(count) && i <= count; i += 1) if (!byIndex.has(i)) problems.push(`shard ${i}/${count} is missing`);
  if (problems.length) return { problems, merged: null };
  const ordered = [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(entry => entry[1]);
  const first = ordered[0];
  for (const report of ordered) {
    const label = `shard ${report.shard.index}/${count}`;
    if (report.shard.catalogSha256 !== first.shard.catalogSha256 || report.shard.partitionSha256 !== first.shard.partitionSha256) problems.push(`${label}: partitioned a different catalog than shard 1/${count}`);
    for (const field of COMMON_FIELDS) if (canonical(report[field]) !== canonical(first[field])) problems.push(`${label}: ${field} differs from shard 1/${count}`);
    const ids = report.shard.ids;
    const caseIds = (Array.isArray(report.cases) ? report.cases : []).map(item => item?.id), projectIds = (Array.isArray(report.projects) ? report.projects : []).map(item => item?.id);
    if (canonical([...caseIds].sort(byText)) !== canonical(ids)) problems.push(`${label}: cases are not exactly the shard's ${ids.length} examples`);
    if (projectIds.some(id => !ids.includes(id)) || new Set(projectIds).size !== projectIds.length) problems.push(`${label}: projects are not a subset of the shard's examples (each at most once)`);
    if (typeof report.pass !== 'boolean' || !Array.isArray(report.failures)) problems.push(`${label}: pass/failures are missing`);
  }
  const covered = ordered.flatMap(report => report.shard.ids);
  if (canonical([...covered].sort(byText)) !== canonical(first.shard.catalog.map(item => item.id))) problems.push('the shards do not cover every catalog example exactly once');
  if (problems.length) return { problems, merged: null };
  const rank = new Map(first.shard.catalog.map((item, i) => [item.id, i]));
  const byRank = (a, b) => rank.get(a.id) - rank.get(b.id);
  const merged = Object.fromEntries(COMMON_FIELDS.filter(field => first[field] !== undefined).map(field => [field, first[field]]));
  merged.generatedAt = ordered.map(report => report.generatedAt).filter(value => typeof value === 'string').sort(byText).at(-1) ?? null;
  merged.pass = ordered.every(report => report.pass === true);
  merged.failures = ordered.flatMap(report => report.failures);
  merged.cases = ordered.flatMap(report => report.cases).sort(byRank);
  merged.projects = ordered.flatMap(report => report.projects).sort(byRank);
  merged.shards = ordered.map(report => ({ index: report.shard.index, count, cost: report.shard.cost, ids: report.shard.ids, generatedAt: report.generatedAt ?? null, pass: report.pass }));
  merged.catalogSha256 = first.shard.catalogSha256;
  merged.partitionSha256 = first.shard.partitionSha256;
  return { problems, merged };
}
