import { createRecastNavigation } from "../../packages/navigation-recast/src/index.js";

declare global {
  interface Window { __auraRecastLoadStart?: number; __auraRecastProof?: unknown }
}

const plane = { positions: [-10, 0, -10, 10, 0, -10, 10, 0, 10, -10, 0, 10], indices: [0, 2, 1, 0, 3, 2] };

async function workerBuild(): Promise<{ bytes: Uint8Array; generationMs: number }> {
  const worker = new Worker("/navigation-worker.js", { type: "module" });
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("navigation worker timed out")), 30_000);
      worker.onerror = (event) => { clearTimeout(timeout); reject(new Error(event.message)); };
      worker.onmessage = (event: MessageEvent<{ pass: boolean; bytes?: Uint8Array; generationMs?: number; error?: string }>) => {
        clearTimeout(timeout);
        if (!event.data.pass || !event.data.bytes) reject(new Error(event.data.error ?? "navigation worker failed"));
        else resolve({ bytes: event.data.bytes, generationMs: event.data.generationMs ?? 0 });
      };
      worker.postMessage(plane);
    });
  } finally { worker.terminate(); }
}

async function run(): Promise<void> {
  const initStart = performance.now();
  const navigation = await createRecastNavigation();
  const initMs = performance.now() - initStart;
  const workerStart = performance.now();
  const built = await workerBuild();
  const workerRoundTripMs = performance.now() - workerStart;
  const mesh = navigation.import(built.bytes);
  const path = mesh.computePath([-8, 0, -8], [8, 0, 8]);
  const crowd = mesh.createCrowd(64, 0.5);
  for (let index = 0; index < 32; index += 1) {
    const agent = crowd.addAgent([-8 + (index % 8) * 0.25, 0, -8 + Math.floor(index / 8) * 0.25], { radius: 0.1, height: 1, maxSpeed: 2, maxAcceleration: 8 });
    crowd.requestMoveTarget(agent, [8, 0, 8]);
  }
  const crowdStart = performance.now();
  for (let step = 0; step < 120; step += 1) crowd.update(1 / 60);
  const crowdStepMs32Agents = (performance.now() - crowdStart) / 120;
  const moved = crowd.positions().some((point) => point[0] > -7.9);
  crowd.dispose();
  mesh.dispose();

  const cache = navigation.generateTileCache(plane, { maxObstacles: 8 });
  const obstacle = cache.addCylinderObstacle([0, 0, 0], 0.5, 1.5);
  const addUpdates = cache.update();
  cache.removeObstacle(obstacle);
  const removeUpdates = cache.update();
  cache.dispose();

  let repeatedDisposals = 0;
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const mounted = navigation.generateSolo(plane, {});
    mounted.dispose();
    if (mounted.disposed) repeatedDisposals += 1;
  }
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  window.__auraRecastProof = {
    pass: path.success && moved && repeatedDisposals === 10,
    loadToReadyMs: performance.now() - (window.__auraRecastLoadStart ?? 0),
    initMs,
    workerGenerationMs: built.generationMs,
    workerRoundTripMs,
    transferredBytes: built.bytes.byteLength,
    pathPoints: path.points.length,
    crowdStepMs32Agents,
    temporaryObstacleAddUpdates: addUpdates,
    temporaryObstacleRemoveUpdates: removeUpdates,
    repeatedDisposals,
    usedJSHeapSize: memory?.usedJSHeapSize ?? null
  };
}

void run().catch((error) => { window.__auraRecastProof = { pass: false, error: error instanceof Error ? error.message : String(error) }; });
