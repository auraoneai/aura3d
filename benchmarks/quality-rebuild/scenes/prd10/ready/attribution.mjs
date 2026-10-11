/**
 * PRD-10 Track 0 (a) ready-time attribution — pure helpers for
 * `ready-probe.mjs`. They turn a Chrome DevTools CPU profile (Profiler.stop)
 * into self-time per source bucket, so a slow READY can be blamed on a lane
 * by file path instead of by guess. The probe runs the benchmark on the vite
 * dev server, where every frame URL is the source path
 * (`/packages/engine/src/production-runtime/world/TerrainRuntime.ts`).
 */

/** Lane-10 (world) source paths, CONTRACTS §4.1 row 10 / QR_OWNERSHIP owner 10. */
export const LANE10_PATTERNS = [
  /\/packages\/rendering\/src\/world\//,
  /\/packages\/rendering\/src\/lanes\/prd10\.ts/,
  /\/packages\/rendering\/src\/(EnvironmentPreset|EnvironmentPresetPack|OceanSurface|SpaceEnvironment|VegetationScatter|WaterSurface)\.ts/,
  /\/packages\/rendering\/src\/Terrain[^/]*\.ts/,
  /\/packages\/engine\/src\/agent-api\/world\//,
  /\/packages\/engine\/src\/agent-api\/(Scatter|LayeredSceneComposition)\.ts/,
  /\/packages\/engine\/src\/agent-api\/compiler\/world\.ts/,
  /\/packages\/engine\/src\/agent-api\/nodes\/(instances|water|environments\.world)\.ts/,
  /\/packages\/engine\/src\/production-runtime\/world\//,
  /\/packages\/engine\/src\/lanes\/prd10\.ts/,
  /\/packages\/environments\/src\/BiomeEnvironmentRegistry\.ts/
];

/** True when a profile frame URL is lane-10 source. */
export function isLane10Url(url) {
  return typeof url === "string" && LANE10_PATTERNS.some((re) => re.test(url));
}

/**
 * Coarse bucket for a frame URL: `lane10`, `(program)`/`(idle)`/`(garbage
 * collector)`/`(native)` for Chrome's synthetic nodes, otherwise
 * `<package>/<first src dir>` (e.g. `engine/production-runtime`), `three`,
 * `bench`, or `other`.
 */
export function bucketFor(node) {
  const { url, functionName } = node.callFrame;
  if (!url) {
    if (functionName === "(idle)" || functionName === "(program)" || functionName === "(garbage collector)") return functionName;
    return "(native)";
  }
  if (isLane10Url(url)) return "lane10";
  const pkg = /\/packages\/([^/]+)\/src\/([^/?]+)/.exec(url);
  if (pkg) return pkg[2].includes(".") ? `${pkg[1]}/(root)` : `${pkg[1]}/${pkg[2]}`;
  if (/\/node_modules\/(\.vite\/deps\/)?three/.test(url)) return "three";
  if (/\/benchmarks\/quality-rebuild\//.test(url) || /\/(aura3d|shared|three)\/[^/]+\.ts/.test(url)) return "bench";
  return "other";
}

/**
 * Self time (ms) per bucket and the top self-time functions. `timeDeltas`
 * are µs between samples; each sample's delta is charged to its node.
 */
export function attributeProfile(profile, { top = 25 } = {}) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parentOf = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parentOf.set(child, node.id);
  /**
   * Native frames (no URL: `getProgramParameter`, `readPixels`, `texImage2D`,
   * shader compile/link waits) are charged to the nearest JS caller's bucket
   * as `native<-bucket`, so a synchronous GL stall is attributed to the lane
   * that issued it rather than to an anonymous "(native)".
   */
  const effectiveBucket = (node) => {
    const own = bucketFor(node);
    if (own !== "(native)") return own;
    let cursor = parentOf.get(node.id);
    while (cursor !== undefined) {
      const parent = byId.get(cursor);
      if (parent?.callFrame.url) return `native<-${bucketFor(parent)}`;
      cursor = parentOf.get(cursor);
    }
    return "(native)";
  };
  const selfUs = new Map();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i += 1) {
    const id = samples[i];
    // Chrome's delta i is the gap before sample i; charge it to sample i.
    const dt = Math.max(0, deltas[i] ?? 0);
    selfUs.set(id, (selfUs.get(id) ?? 0) + dt);
  }
  const buckets = {};
  const fns = new Map();
  let totalUs = 0;
  for (const [id, us] of selfUs) {
    const node = byId.get(id);
    if (!node) continue;
    totalUs += us;
    const bucket = effectiveBucket(node);
    buckets[bucket] = (buckets[bucket] ?? 0) + us;
    const { functionName, url, lineNumber } = node.callFrame;
    if (bucket === "(idle)") continue; // idle is not a function cost
    const key = `${functionName || "(anonymous)"} ${url ? url.replace(/^https?:\/\/[^/]+/, "") : ""}:${(lineNumber ?? -1) + 1}`;
    fns.set(key, (fns.get(key) ?? 0) + us);
  }
  const ms = (us) => Math.round(us / 100) / 10;
  const busyUs = totalUs - (buckets["(idle)"] ?? 0);
  const lane10Us = (buckets.lane10 ?? 0) + (buckets["native<-lane10"] ?? 0);
  return {
    totalMs: ms(totalUs),
    busyMs: ms(busyUs),
    lane10Ms: ms(lane10Us),
    lane10ShareOfBusy: busyUs > 0 ? Math.round((lane10Us / busyUs) * 1000) / 1000 : 0,
    buckets: Object.fromEntries(Object.entries(buckets).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, ms(v)])),
    topFunctions: [...fns.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([fn, us]) => ({ fn, ms: ms(us) })),
    topLane10Functions: [...fns.entries()]
      .filter(([fn]) => isLane10Url(fn.split(" ")[1] ?? ""))
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([fn, us]) => ({ fn, ms: ms(us) }))
  };
}

/**
 * Splits a rAF trace (from the probe's init script) into frame stats.
 * `frames` are `{ t, cbMs }`: rAF fire time and total callback duration.
 */
export function frameStats(frames) {
  if (!frames.length) return { count: 0, meanIntervalMs: null, meanCallbackMs: null, maxCallbackMs: null };
  let cb = 0;
  let max = 0;
  for (const f of frames) {
    cb += f.cbMs;
    max = Math.max(max, f.cbMs);
  }
  const span = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0;
  const r = (v) => Math.round(v * 10) / 10;
  return {
    count: frames.length,
    meanIntervalMs: frames.length > 1 ? r(span / (frames.length - 1)) : null,
    meanCallbackMs: r(cb / frames.length),
    maxCallbackMs: r(max)
  };
}
