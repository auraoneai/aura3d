import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { AnimationClip, AnimationMixer, AnimationTrack } from "@galileo3d/animation";
import { AssetManager, type AssetLoader } from "@galileo3d/assets";
import { World } from "@galileo3d/ecs";
import { PhysicsWorld, Shape } from "@galileo3d/physics";
import {
  CollisionModule,
  ForceModule,
  Geometry,
  InstancedUnlitMaterial,
  MAX_GPU_INSTANCES,
  MockRenderDevice,
  ParticleEmitter,
  ParticleSystem,
  Renderer,
  UnlitMaterial,
} from "@galileo3d/rendering";

interface Baseline {
  name: string;
  elapsedMs: number;
  averageFrameMs?: number;
  budgetMs?: number;
  withinBudget?: boolean;
  attempts?: number;
  firstAttemptMs?: number;
  slowestAttemptMs?: number;
  minMs?: number;
  medianMs?: number;
  maxMs?: number;
  samplesMs?: readonly number[];
  [key: string]: string | number | boolean | readonly number[] | undefined;
}

class PositionComponent {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}
}

function elapsed<T>(name: string, run: () => T): { value: T; baseline: Baseline } {
  const start = performance.now();
  const value = run();
  const elapsedMs = performance.now() - start;
  return { value, baseline: { name, elapsedMs: Number(elapsedMs.toFixed(3)) } };
}

async function elapsedAsync<T>(name: string, run: () => Promise<T>): Promise<{ value: T; baseline: Baseline }> {
  const start = performance.now();
  const value = await run();
  const elapsedMs = performance.now() - start;
  return { value, baseline: { name, elapsedMs: Number(elapsedMs.toFixed(3)) } };
}

function ecsBaseline(): Baseline {
  const { value, baseline } = elapsed("ecs-100000-query", () => {
    const world = new World();
    world.registerComponent(PositionComponent);
    for (let index = 0; index < 100_000; index += 1) {
      const entity = world.createEntity();
      world.add(entity, PositionComponent, new PositionComponent(index, index * 0.5, 0));
    }
    let sum = 0;
    world.query({ include: [PositionComponent] }).forEach((entity) => {
      sum += world.get(entity, PositionComponent)?.x ?? 0;
    });
    return { entities: 100_000, sum };
  });

  return { ...baseline, entities: value.entities, checksum: value.sum };
}

async function rendererBaseline(): Promise<Baseline> {
  const { value, baseline } = await elapsedAsync("renderer-1000-mock-cubes", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 640, height: 360 });
    const material = new UnlitMaterial({ color: [0.4, 0.8, 1, 1] });
    const items = Array.from({ length: 1_000 }, (_, index) => ({
      geometry: Geometry.cube(1),
      material,
      label: `cube-${index}`,
    }));
    const diagnostics = renderer.render(items);
    renderer.dispose();
    return diagnostics;
  });

  return withBudget({ ...baseline, drawCalls: value.drawCalls, buffers: value.buffers, shaders: value.shaders }, 250);
}

async function rendererInstancingBaseline(): Promise<Baseline> {
  const totalInstances = 10_000;
  const { value, baseline } = await elapsedAsync("renderer-10000-mock-instances", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 640, height: 360 });
    const geometry = Geometry.triangle();
    const material = new InstancedUnlitMaterial({ color: [0.25, 0.9, 0.45, 1] });
    const batches = [];
    for (let start = 0; start < totalInstances; start += MAX_GPU_INSTANCES) {
      const count = Math.min(MAX_GPU_INSTANCES, totalInstances - start);
      batches.push({
        geometry,
        material,
        instanceTransforms: buildInstanceMatrices(start, count),
        label: `instance-batch-${Math.floor(start / MAX_GPU_INSTANCES)}`,
      });
    }
    const diagnostics = renderer.render(batches);
    renderer.dispose();
    geometry.dispose();
    return { diagnostics, batches: batches.length };
  });

  return withBudget({
    ...baseline,
    instances: totalInstances,
    batches: value.batches,
    drawCalls: value.diagnostics.drawCalls,
    buffers: value.diagnostics.buffers,
    shaders: value.diagnostics.shaders,
    instancesPerDraw: Number((totalInstances / value.diagnostics.drawCalls).toFixed(3)),
  }, 250);
}

function physicsBaseline(): Baseline {
  const { value, baseline } = elapsed("physics-500-bodies-120-steps", () => {
    const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60 });
    const ground = world.createRigidBody({ type: "static", position: [0, 0, 0] });
    world.createCollider(ground, { shape: Shape.plane([0, 1, 0], 0) });
    for (let index = 0; index < 500; index += 1) {
      const body = world.createRigidBody({ position: [(index % 20) * 0.1, 1 + Math.floor(index / 20) * 0.15, 0] });
      world.createCollider(body, { shape: Shape.box(0.05, 0.05, 0.05) });
    }
    for (let step = 0; step < 120; step += 1) {
      world.step();
    }
    return world.snapshot().stats;
  });

  return withBudget({
    ...baseline,
    bodies: value.bodies,
    colliders: value.colliders,
    steps: value.steps,
    contacts: value.contacts,
    broadphasePairs: value.broadphasePairs,
    broadphaseFiniteColliders: value.broadphaseFiniteColliders,
    broadphaseInfiniteColliders: value.broadphaseInfiniteColliders,
    broadphaseCandidateTests: value.broadphaseCandidateTests,
    broadphaseActiveMax: value.broadphaseActiveMax,
    broadphaseRejectedByBounds: value.broadphaseRejectedByBounds
  }, 6_000, "Three-run median budget for 500 dynamic bodies over 120 steps under full release load; report records broadphase profile counters, min/median/max, and machine context.");
}

function animationBaseline(): Baseline {
  const { value, baseline } = elapsed("animation-100-mixers-120-frames", () => {
    const clip = new AnimationClip({
      name: "baseline",
      tracks: [
        new AnimationTrack({
          target: "position",
          valueType: "vector3",
          keyframes: [
            { time: 0, value: [0, 0, 0] },
            { time: 1, value: [1, 1, 0] },
          ],
        }),
      ],
    });
    const mixers = Array.from({ length: 100 }, () => {
      const mixer = new AnimationMixer();
      mixer.play(clip);
      return mixer;
    });
    for (let frame = 0; frame < 120; frame += 1) {
      for (const mixer of mixers) {
        mixer.update(1 / 60);
      }
    }
    return mixers.reduce((sum, mixer) => sum + (((mixer.getValue("position") as readonly number[] | undefined)?.[0] ?? 0)), 0);
  });

  return withBudget({ ...baseline, mixers: 100, frames: 120, checksum: Number(value.toFixed(3)) }, 250);
}

async function assetsBaseline(): Promise<Baseline> {
  let disposed = 0;
  const loader: AssetLoader<{ index: number }> = {
    type: "baseline-json",
    canLoad: (request) => request.url.endsWith(".baseline"),
    load: (request) => ({ index: Number(request.url.match(/(\d+)/)?.[1] ?? 0) }),
    dispose: () => {
      disposed += 1;
    },
  };

  const { value, baseline } = await elapsedAsync("assets-100-load-release", async () => {
    const manager = new AssetManager();
    manager.register(loader);
    const handles = [];
    for (let index = 0; index < 100; index += 1) {
      handles.push(await manager.load<{ index: number }>(`asset-${index}.baseline`));
    }
    for (const handle of handles) {
      await manager.release(handle);
    }
    return { loaded: handles.length, disposed };
  });

  return withBudget({ ...baseline, loaded: value.loaded, disposed: value.disposed }, 500);
}

function particlesBaseline(): Baseline {
  const { value, baseline } = elapsed("particles-10000-cpu-120-frames", () => {
    const system = new ParticleSystem({
      maxParticles: 10_000,
      emitters: [
        new ParticleEmitter({
          seed: 42,
          emissionRate: 10_000,
          lifetime: 4,
          speed: { min: 0.1, max: 0.8 },
          shape: { type: "sphere", radius: 1 },
        }),
      ],
      modules: [
        new ForceModule({ x: 0, y: -0.2, z: 0 }),
        new CollisionModule({ normal: { x: 0, y: 1, z: 0 }, constant: -2, restitution: 0.1 }),
      ],
    });
    system.update(1);
    for (let frame = 0; frame < 120; frame += 1) {
      system.update(1 / 60);
    }
    const device = new MockRenderDevice();
    return { stats: system.getStats(), deviceKind: device.kind };
  });

  return withBudget({
    ...baseline,
    liveCount: value.stats.liveCount,
    spawnedCount: value.stats.spawnedCount,
    killedCount: value.stats.killedCount,
    frames: 120,
    averageFrameMs: Number((baseline.elapsedMs / 120).toFixed(4)),
  }, 1_500);
}

async function main(): Promise<void> {
  const baselines = [
    await retryFailedBaseline(() => withBudget(
      ecsBaseline(),
      1_500,
      "Three-run median budget for 100k entity creation/query under full release load; report records min/median/max and machine context."
    )),
    await retryFailedBaseline(rendererBaseline),
    await retryFailedBaseline(rendererInstancingBaseline),
    await retryFailedBaseline(physicsBaseline),
    await retryFailedBaseline(animationBaseline),
    await retryFailedBaseline(assetsBaseline),
    await retryFailedBaseline(particlesBaseline),
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    releaseRunId: process.env.G3D_RELEASE_RUN_ID ?? "standalone-performance-run",
    suite: "workstream-6-system-performance",
    environment: {
      node: process.version,
      platform: platform(),
      osRelease: release(),
      arch: process.arch,
      cpuModel: cpus()[0]?.model ?? "unknown",
      cpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
    },
    status: baselines.every((baseline) => baseline.withinBudget) ? "pass" : "fail",
    baselines,
  };

  for (const reportPath of ["tests/reports/performance.json", "tests/reports/final-performance.json"]) {
    const resolvedReportPath = resolve(reportPath);
    mkdirSync(dirname(resolvedReportPath), { recursive: true });
    writeFileSync(resolvedReportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "pass") {
    throw new Error(`Performance budget verification failed for ${baselines.filter((baseline) => !baseline.withinBudget).map((baseline) => baseline.name).join(", ")}`);
  }
}

await main();

async function retryFailedBaseline<T extends Baseline>(createBaseline: () => T | Promise<T>, maxAttempts = 3): Promise<T> {
  const attempts: T[] = [];
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const baseline = await createBaseline();
    attempts.push(baseline);
  }

  const sortedElapsed = attempts.map((attempt) => attempt.elapsedMs).sort((left, right) => left - right);
  const medianElapsed = sortedElapsed[Math.floor(sortedElapsed.length / 2)] ?? attempts[0]?.elapsedMs ?? 0;
  const median = attempts.reduce((currentMedian, candidate) => (
    Math.abs(candidate.elapsedMs - medianElapsed) < Math.abs(currentMedian.elapsedMs - medianElapsed) ? candidate : currentMedian
  ));
  const min = sortedElapsed[0] ?? median.elapsedMs;
  const max = sortedElapsed.at(-1) ?? median.elapsedMs;

  return {
    ...median,
    attempts: attempts.length,
    firstAttemptMs: attempts[0]?.elapsedMs ?? median.elapsedMs,
    slowestAttemptMs: Number(max.toFixed(3)),
    minMs: Number(min.toFixed(3)),
    medianMs: Number(medianElapsed.toFixed(3)),
    maxMs: Number(max.toFixed(3)),
    samplesMs: attempts.map((attempt) => attempt.elapsedMs)
  };
}

function withBudget<T extends Baseline>(baseline: T, budgetMs: number, budgetReason?: string): T {
  return {
    ...baseline,
    budgetMs,
    withinBudget: baseline.elapsedMs <= budgetMs,
    ...(budgetReason ? { budgetReason } : {})
  };
}

function buildInstanceMatrices(start: number, count: number): Float32Array {
  const output = new Float32Array(count * 16);
  for (let index = 0; index < count; index += 1) {
    const instance = start + index;
    const column = instance % 100;
    const row = Math.floor(instance / 100);
    output.set(translationMatrix((column - 49.5) * 0.02, (row - 49.5) * 0.02, 0), index * 16);
  }
  return output;
}

function translationMatrix(x: number, y: number, z: number): readonly number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
  ];
}
