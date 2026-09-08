import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sourceIdentity, sameSource } from '../muse3jsparity-readiness/evidence-lineage';

// Invoke on a remote browser worker. Independent routes share no browser context;
// a separate final process replays all immutable receipts before accepting output.
const root = process.cwd();
const sweepId = randomUUID();
const directory = resolve(root, 'tests/reports/showcase-route-primary-probes/sweeps', sweepId);
const source = sourceIdentity(root);
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'manifest.json'), JSON.stringify({ sweepId, source, startedAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
const workers = Number(process.env.A3D_ROUTE_PRIMARY_WORKERS ?? 4);
if (!Number.isInteger(workers) || workers < 1 || workers > 8) throw new Error('Remote route worker count must be an integer from 1 to 8');
const cli = resolve(root, 'node_modules/@playwright/test/cli.js');
const spec = 'tests/browser/showcase-route-primary-probes.spec.ts';
const routeConfig = JSON.parse(readFileSync(resolve(root, 'tools/showcase-library/route-gates.json'), 'utf8')) as {
  routes: readonly { id: string; published: boolean; primaryAssets: readonly string[]; requiresRoutePrimaryProbe?: boolean; retainedEvidenceFrozen?: boolean }[];
};
const routeIds = routeConfig.routes
  .filter(route => route.published && (route.primaryAssets.length > 0 || route.requiresRoutePrimaryProbe === true) && route.retainedEvidenceFrozen !== true)
  .map(route => route.id);
const isolatedRoutes = ['showcase-gallery-shift', 'showcase-blockfall-reactor', 'showcase-patrol-wing', 'showcase-mech-hangar'];
const parallelRoutes = routeIds.filter(id => !isolatedRoutes.includes(id));

const run = (phase: 'capture' | 'aggregate', ids: readonly string[] = [], workerCount = 1) => {
  const capture = phase === 'capture';
  const result = spawnSync(process.execPath, [cli, 'test', spec, `--workers=${capture ? workerCount : 1}`, '--reporter=line', `--global-timeout=${capture ? 3_000_000 : 150_000}`], {
    cwd: root, stdio: 'inherit', timeout: capture ? 3_060_000 : 180_000,
    env: {
      ...process.env,
      A3D_ROUTE_PRIMARY_PHASE: phase,
      A3D_ROUTE_PRIMARY_SWEEP_ID: sweepId,
      ...(capture ? { A3D_ROUTE_PRIMARY_IDS: ids.join(',') } : { A3D_ROUTE_PRIMARY_IDS: '' })
    }
  });
  if (result.error) console.error(result.error);
  return result.status ?? 1;
};
console.log(`Route-primary sweep ${sweepId}: isolated ${isolatedRoutes.join(', ')} then ${workers} workers for ${parallelRoutes.length} routes`);
const isolatedExit = run('capture', isolatedRoutes, 1);
if (!sameSource(source, sourceIdentity(root))) throw new Error('Source changed during isolated route capture; refusing mixed-source aggregation');
const parallelExit = isolatedExit === 0 ? run('capture', parallelRoutes, workers) : 1;
if (!sameSource(source, sourceIdentity(root))) throw new Error('Source changed during route-primary capture; refusing mixed-source aggregation');
// Aggregate even after failed captures so missing route receipts are diagnosed.
const aggregateExit = run('aggregate');
if (!sameSource(source, sourceIdentity(root))) throw new Error('Source changed during route-primary aggregation');
process.exitCode = isolatedExit || parallelExit || aggregateExit;
